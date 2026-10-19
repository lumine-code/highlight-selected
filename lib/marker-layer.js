const { Disposable } = require("lumine");

// The `marker.layer` provider: highlighted occurrences on the overview maps.
//
// Fed through the same facade `provideHighlightSelected()` hands to external
// consumers, so the layer sees exactly what a separate package would — main.js
// only replaces the service wiring with a direct `connect()` call.
module.exports = {
  activate() {
    this.highlightService = null;
    this.connection = null;
    // Layers handed over by the marker hub, keyed by editor. The hub builds
    // exactly one layer per (provider, editor), so a plain Map suffices.
    this.layers = new Map();
  },

  deactivate() {
    this.highlightService = null;
    this.connection = null;
    this.layers?.clear();
  },

  updateLayers() {
    for (const layer of this.layers.values()) layer.update();
  },

  connect(highlightService) {
    const connection = {};
    this.connection = connection;
    this.highlightService = highlightService;
    const updateAll = () => {
      if (this.connection === connection) this.updateLayers();
    };
    const addSubscription = highlightService.onDidFinishAddingMarkers(updateAll);
    const removeSubscription = highlightService.onDidRemoveAllMarkers(updateAll);
    updateAll();
    return new Disposable(() => {
      addSubscription.dispose();
      removeSubscription.dispose();
      if (this.connection !== connection) return;
      this.connection = null;
      this.highlightService = null;
      this.updateLayers();
    });
  },

  provideMarkerLayer() {
    return {
      name: "highlight",
      description: "Highlighted selection markers",
      merge: true,
      enabled: "highlight-selected.marker.enabled",
      threshold: "highlight-selected.marker.threshold",
      initialize: (layer) => {
        this.layers.set(layer.editor, layer);
        layer.disposables.add(
          new Disposable(() => {
            this.layers.delete(layer.editor);
          }),
        );
        layer.update();
      },
      getItems: ({ editor }) => {
        // Clear/add bursts only invalidate; read their final markers once when
        // the hub polls the layer for its next frame.
        const data = this.highlightService?.getMarkersForEditor(editor) ?? [];
        return data.map((marker) => {
          const range = marker.getScreenRange();
          return { row: range.start.row, end: range.end.row };
        });
      },
    };
  },
};
