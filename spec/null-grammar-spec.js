const path = require("node:path");

describe("highlight-selected with no grammar", () => {
  let editor, manager;
  beforeEach(async () => {
    await lumine.packages.activatePackage("language-text");
    jasmine.attachToDOM(lumine.workspace.getElement());
    const main = (await lumine.packages.activatePackage(path.join(__dirname, ".."))).mainModule;
    manager = main.selectionManager;
    editor = await lumine.workspace.open();
    editor.setText("word word word");
  });
  afterEach(() => editor?.destroy());

  it("clears highlights synchronously and skips scans until a grammar is selected", () => {
    const grammar = lumine.grammars.grammarForScopeName("text.plain");
    editor.setGrammar(grammar);
    editor.setSelectedBufferRange([
      [0, 0],
      [0, 4],
    ]);
    manager.searchModel.handleSelection();
    expect(manager.getMarkersForEditor(editor).length).toBe(2);
    editor.setGrammar(lumine.grammars.nullGrammar);
    expect(manager.getMarkersForEditor(editor)).toEqual([]);
    spyOn(editor, "scan").and.callThrough();
    manager.searchModel.handleSelection();
    expect(editor.scan).not.toHaveBeenCalled();
    editor.setGrammar(grammar);
    expect(manager.getMarkersForEditor(editor).length).toBe(2);
    expect(editor.scan).toHaveBeenCalled();
  });
});
