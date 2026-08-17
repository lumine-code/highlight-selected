const { CompositeDisposable } = require("lumine");
const SelectionManager = require("./selection-manager");
const markerLayer = require("./marker-layer");

module.exports = {
  selectionManager: null,
  markerLayerConnection: null,

  activate() {
    this.selectionManager = new SelectionManager();
    this.subscriptions = new CompositeDisposable();
    this.subscriptions.add(this.listenForCommands());

    // The layer consumes the same facade an external package would, so folding
    // it in changed no contract — only the wiring became a direct call.
    markerLayer.activate();
    this.markerLayerConnection = markerLayer.connect(this.provideHighlightSelected());
  },

  deactivate() {
    if (this.markerLayerConnection) {
      this.markerLayerConnection.dispose();
    }
    this.markerLayerConnection = null;
    markerLayer.deactivate();
    if (this.selectionManager) {
      this.selectionManager.destroy();
    }
    this.selectionManager = null;
    if (this.subscriptions) {
      this.subscriptions.dispose();
    }
    this.subscriptions = null;
  },

  provideHighlightSelected() {
    // Expose a narrow facade rather than the SelectionManager itself so
    // consumers never depend on its internal state.
    const manager = this.selectionManager;
    return {
      onDidFinishAddingMarkers: (callback) => manager.onDidFinishAddingMarkers(callback),
      onDidRemoveAllMarkers: (callback) => manager.onDidRemoveAllMarkers(callback),
      getMarkersForEditor: (editor) => manager.getMarkersForEditor(editor),
    };
  },

  toggle() {
    if (this.selectionManager.disabled) {
      return this.selectionManager.enable();
    }
    return this.selectionManager.disable();
  },

  listenForCommands() {
    return lumine.commands.add("lumine-workspace", {
      "highlight-selected:toggle": () => this.toggle(),
      "highlight-selected:go-to-next": {
        description: "Move the cursor to the next occurrence of the selection.",
        didDispatch: () => this.selectionManager.goToNext(),
      },
      "highlight-selected:go-to-previous": {
        description: "Move the cursor to the previous occurrence of the selection.",
        didDispatch: () => this.selectionManager.goToPrevious(),
      },
    });
  },

  provideMarkerLayer() {
    return markerLayer.provideMarkerLayer();
  },

  markerLayer,
};
