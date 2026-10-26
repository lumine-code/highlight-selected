const WHITESPACE_ONLY_REGEX = /^\s+$/;
const ESCAPE_REGEX = /[-/\\^$*+?.()|[\]{}]/g;
const MAX_PATTERN_UNITS = 4096;
const MAX_HIGHLIGHTS = 10000;

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

  cancel() {
    this.request?.controller.abort();
    this.request = null;
  }

  handleSelection() {
    this.selectionManager.handleSelectionDebounce?.clear();
    this.selectionManager.removeAllMarkers();
    const editor = lumine.workspace.getActiveTextEditor();
    if (!editor) {
      return;
    }

    if (this.selectionManager.disabled || editor.getGrammar() === lumine.grammars.nullGrammar) {
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

    const selectionRange = selection.getBufferRange();
    if (!selectionRange.isSingleLine()) return;
    // This is incidental selection feedback, not an explicit search request.
    // Buffer columns count UTF-16 units, matching the old string.length check
    // without copying a potentially enormous selection just to reject it.
    const length = selectionRange.end.column - selectionRange.start.column;
    const minimumLength = lumine.config.get("highlight-selected.minimumLength");
    if (length < minimumLength || length > MAX_PATTERN_UNITS) return;

    const text = selection.getText();
    if (WHITESPACE_ONLY_REGEX.test(text)) {
      return;
    }

    const regexSearch = new RegExp(escapeRegExp(text), "g");
    const rawMax = lumine.config.get("highlight-selected.maximumHighlights");
    const maximumHighlights = rawMax > 0 ? Math.min(rawMax, MAX_HIGHLIGHTS) : MAX_HIGHLIGHTS;

    this.selectionManager.resultCount = 0;

    const request = (this.request = { controller: new AbortController() });
    this.pending = (async () => {
      for (const otherEditor of getActiveEditors()) {
        if (request.controller.signal.aborted) return;
        await this.highlightSelectionInEditor(
          otherEditor,
          regexSearch,
          editor,
          selectionRange,
          maximumHighlights,
          request,
        );
      }
      if (this.request === request) this.selectionManager.emitter.emit("did-finish-adding-markers");
    })().catch((error) => {
      if (error.name !== "AbortError" && this.request === request) {
        this.selectionManager.removeAllMarkers();
        console.error("Unable to highlight the selected text", error);
      }
    });
    return this.pending;
  }

  async highlightSelectionInEditor(
    editor,
    regexSearch,
    originalEditor,
    selectionRange,
    maximumHighlights,
    request,
  ) {
    if (
      !editor ||
      editor.getGrammar() === lumine.grammars.nullGrammar ||
      this.selectionManager.resultCount >= maximumHighlights
    ) {
      return;
    }

    const markerLayers = this.selectionManager.editorToMarkerLayerMap[editor.id];
    if (!markerLayers || !markerLayers.markerLayer) {
      return;
    }

    const { markerLayer } = markerLayers;
    const isOriginalEditor = originalEditor && originalEditor.id === editor.id;

    const search = editor
      .getBuffer()
      .createSearch(regexSearch, { signal: request.controller.signal });
    for await (const found of search.matches()) {
      if (this.request !== request || markerLayer.isDestroyed()) return;
      const range = search.range(found);
      if (isOriginalEditor && this.rangesEqual(range, selectionRange)) continue;
      this.selectionManager.resultCount += 1;
      markerLayer.markBufferRange(range);
      if (this.selectionManager.resultCount >= maximumHighlights) return;
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
