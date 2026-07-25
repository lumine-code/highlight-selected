const { CompositeDisposable } = require("atom");
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
    return this.selectionManager;
  },

  toggle() {
    if (this.selectionManager.disabled) {
      return this.selectionManager.enable();
    }
    return this.selectionManager.disable();
  },

  listenForCommands() {
    return atom.commands.add("atom-workspace", {
      "highlight-selected:toggle": () => this.toggle(),
      "highlight-selected:go-to-next": () => this.selectionManager.goToNext(),
      "highlight-selected:go-to-previous": () => this.selectionManager.goToPrevious(),
    });
  },
};
