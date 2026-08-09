class EarlyTerminationSignal extends Error {}

const WHITESPACE_ONLY_REGEX = /^\s+$/;
const ESCAPE_REGEX = /[-/\\^$*+?.()|[\]{}]/g;

function escapeRegExp(string) {
  return string ? string.replace(ESCAPE_REGEX, "\\$&") : "";
}

function getActiveEditors() {
  return lumine.workspace
    .getPanes()
    .map((pane) => pane.activeItem)
    .filter((item) => item && lumine.workspace.isTextEditor(item));
}

module.exports = class SearchModel {
  constructor(selectionManager) {
    this.selectionManager = selectionManager;
  }

  handleSelection() {
    const editor = lumine.workspace.getActiveTextEditor();
    if (!editor) {
      return;
    }

    this.selectionManager.removeAllMarkers();

    if (this.selectionManager.disabled) {
      return;
    }

    const selection = editor.getLastSelection();
    if (!selection || selection.isEmpty()) {
      return;
    }

    // Only support single selection
    if (editor.selections.length > 1) {
      return;
    }

    const text = selection.getText();
    const minimumLength = lumine.config.get("highlight-selected.minimumLength");

    if (text.length < minimumLength || text.includes("\n") || WHITESPACE_ONLY_REGEX.test(text)) {
      return;
    }

    const regexSearch = new RegExp(escapeRegExp(text), "g");
    const selectionRange = selection.getBufferRange();
    const rawMax = lumine.config.get("highlight-selected.maximumHighlights");
    const maximumHighlights = rawMax === 0 ? Infinity : rawMax;

    this.selectionManager.resultCount = 0;

    getActiveEditors().forEach((otherEditor) => {
      this.highlightSelectionInEditor(
        otherEditor,
        regexSearch,
        editor,
        selectionRange,
        maximumHighlights,
      );
    });

    this.selectionManager.emitter.emit("did-finish-adding-markers");
  }

  highlightSelectionInEditor(
    editor,
    regexSearch,
    originalEditor,
    selectionRange,
    maximumHighlights,
  ) {
    if (!editor || this.selectionManager.resultCount >= maximumHighlights) {
      return;
    }

    const markerLayers = this.selectionManager.editorToMarkerLayerMap[editor.id];
    if (!markerLayers || !markerLayers.markerLayer) {
      return;
    }

    const { markerLayer } = markerLayers;
    const isOriginalEditor = originalEditor && originalEditor.id === editor.id;

    try {
      editor.scan(regexSearch, (result) => {
        if (this.selectionManager.resultCount >= maximumHighlights) {
          throw new EarlyTerminationSignal();
        }

        // Skip the selected word in the original editor
        if (isOriginalEditor && this.rangesEqual(result.range, selectionRange)) {
          return;
        }

        this.selectionManager.resultCount += 1;
        markerLayer.markBufferRange(result.range);
      });
    } catch (error) {
      if (
        !(error instanceof EarlyTerminationSignal) &&
        error.message !== "regular expression is too large"
      ) {
        throw error;
      }
    }
  }

  rangesEqual(a, b) {
    return (
      a.start.row === b.start.row &&
      a.start.column === b.start.column &&
      a.end.row === b.end.row &&
      a.end.column === b.end.column
    );
  }
};
