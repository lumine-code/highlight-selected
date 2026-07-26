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
  onDidFinishAddingMarkers(callback: () => void): Disposable;
  onDidRemoveAllMarkers(callback: () => void): Disposable;
};
```

| Member                               | Description                                                                |
| ------------------------------------ | -------------------------------------------------------------------------- |
| `getMarkersForEditor(editor)`        | The markers currently highlighted in that editor.                          |
| `onDidFinishAddingMarkers(callback)` | Fires once a new highlight pass has finished adding its markers.           |
| `onDidRemoveAllMarkers(callback)`    | Fires when the highlight is cleared — the selection changed or went empty. |

A narrow facade over the package's selection manager, so consumers never depend on its internals.

## Minimal example

```js
const { CompositeDisposable, Disposable } = require("atom");

module.exports = {
  consumeHighlightSelected(service) {
    const disposables = new CompositeDisposable();
    disposables.add(
      service.onDidFinishAddingMarkers(() => this.redraw(service)),
      service.onDidRemoveAllMarkers(() => this.clear()),
      new Disposable(() => this.clear()),
    );
    return disposables;
  },
};
```

## Behavior

**Two events, not one**, and both matter. `onDidFinishAddingMarkers` is the "draw now" signal — it fires after a pass completes, not per marker, so you redraw once rather than per occurrence. `onDidRemoveAllMarkers` is the "erase now" signal; without handling it, an overlay keeps showing occurrences of a selection the user has already moved away from.

Neither event carries a payload or an editor. Re-query with `getMarkersForEditor` for the editors you draw.

Neither replays on subscribe, so read the current state once when you receive the service.

The markers are live `DisplayMarker`s owned by `highlight-selected`; read positions on demand and never destroy them.

Highlighting is off while the package is disabled by the user, in which case the marker list is simply always empty.

## Teardown

Return a `Disposable` that unsubscribes **and clears what you drew** — losing the service should look the same as the selection being cleared.

## Versioning

`1.0.0` provided, `^1.0.0` consumed. A change that breaks this shape gets a new service name rather than a new major version, and both sides move in the same release.
