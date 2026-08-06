# highlight-selected

Highlight all occurrences of the selected text.

## Features

- **Automatic highlighting**: highlights all matching occurrences when text is selected.
- **Occurrence navigation**: jump to the next or previous highlighted occurrence.
- **Customizable style**: override highlight appearance via stylesheet.
- **Scrollmap**: shows highlight markers in the scrollbar via the scrollmap package.

## Installation

To install `highlight-selected` search for _highlight-selected_ in the Install pane of the Lumine settings or run `lumine --install lumine-code/highlight-selected`.

## Commands

Commands available in `atom-workspace`:

- `highlight-selected:toggle`: enable or disable highlighting,
- `highlight-selected:go-to-next`: select the next highlighted occurrence,
- `highlight-selected:go-to-previous`: select the previous highlighted occurrence.

## Customization

The style can be adjusted according to user preferences in the `styles.css` file, e.g. change highlight style:

```css
atom-text-editor .highlights {
  .highlight-selected .region {
    border: 1px solid var(--syntax-result-marker-color);
    background-color: var(--syntax-result-marker-color-selected);
    border-radius: 3px;
  }
}
```

## Services

- **[highlight-selected](docs/highlight-selected.md)** (`1.0.0`): provided to expose the selection manager — other packages can observe marker events via `onDidFinishAddingMarkers` / `onDidRemoveAllMarkers` and read the per-editor marker layers.

## Contributing

Got ideas to make this package better, found a bug, or want to help add new features? Just drop your thoughts on GitHub. Any feedback is welcome!
