# highlight-selected

Reports which occurrences of the current selection are highlighted, and when that set changes.

|             |                                                                           |
| ----------- | ------------------------------------------------------------------------- |
| Version     | `1.0.0`                                                                   |
| Provided by | `provideHighlightSelected()` returning the query facade                   |
| Consumed by | `consumeHighlightSelected(service)`                                       |
| Owner       | [`highlight-selected`](https://github.com/lumine-code/highlight-selected) |

For anything that wants to show the same occurrences somewhere other than in the buffer — a scrollbar overview is the existing consumer.

## Registration

In your `package.json`:

```json
{
  "consumedServices": {
    "highlight-selected": {
      "versions": { "^1.0.0": "consumeHighlightSelected" }
    }
  }
}
```

## Contract

```ts
type HighlightSelected = {
  getMarkersForEditor(editor: TextEditor): DisplayMarker[];
  onDidChangeMarkers(callback: (editor: TextEditor) => void): Disposable;
};
```

| Member                         | Description                                                                                   |
| ------------------------------ | --------------------------------------------------------------------------------------------- |
| `getMarkersForEditor(editor)`  | The markers currently highlighted in that editor.                                             |
| `onDidChangeMarkers(callback)` | Reports the editor whose native markers were created, moved, invalidated, cleared or retired. |

A narrow facade over the package's selection manager, so consumers never depend on its internals.

## Minimal example

```js
const { CompositeDisposable, Disposable } = require("lumine");

module.exports = {
  consumeHighlightSelected(service) {
    const disposables = new CompositeDisposable();
    disposables.add(
      service.onDidChangeMarkers((editor) => this.redraw(editor, service)),
      new Disposable(() => this.clear()),
    );
    return disposables;
  },
};
```

## Behavior

`onDidChangeMarkers` reports changes from each editor's native marker layer, including positions and validity after an edit. A consumer can refresh only that editor without waiting for the next selection scan. Highlight creation is batched in a buffer transaction, and overview consumers coalesce notifications into their next frame.

The callback receives the affected editor. Re-query with `getMarkersForEditor(editor)` and skip markers for which `isValid()` returns `false`, matching native highlight decorations.

The event does not replay on subscribe, so read the current state once when you receive the service.

The markers are live `DisplayMarker`s owned by `highlight-selected`; read positions on demand and never destroy them.

Markers remain available while their editor is alive, including when a close listener prevents or delays closing it. Destroying the editor or deactivating the package releases its highlight layers.

Highlighting is off while the package is disabled by the user, in which case the marker list is simply always empty.

## Teardown

Return a `Disposable` that unsubscribes **and clears what you drew** — losing the service should look the same as the selection being cleared.

## Versioning

`1.0.0` provided, `^1.0.0` consumed. A change that breaks this shape gets a new service name rather than a new major version, and both sides move in the same release.
