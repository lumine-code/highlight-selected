const { CompositeDisposable } = require("lumine");
const SelectionManager = require("./selection-manager");

module.exports = {
  selectionManager: null,

  activate() {
    this.selectionManager = new SelectionManager();
    this.subscriptions = new CompositeDisposable();

    return this.subscriptions.add(this.listenForCommands());
  },

  deactivate() {
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
};
