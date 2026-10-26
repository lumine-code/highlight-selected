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

  it("clears highlights synchronously and skips scans until a grammar is selected", async () => {
    const grammar = lumine.grammars.grammarForScopeName("text.plain");
    editor.setGrammar(grammar);
    editor.setSelectedBufferRange([
      [0, 0],
      [0, 4],
    ]);
    await manager.searchModel.handleSelection();
    expect(manager.getMarkersForEditor(editor).length).toBe(2);
    editor.setGrammar(lumine.grammars.nullGrammar);
    expect(manager.getMarkersForEditor(editor)).toEqual([]);
    const search = spyOn(editor.getBuffer(), "createSearch").and.callThrough();
    await manager.searchModel.handleSelection();
    expect(search).not.toHaveBeenCalled();
    editor.setGrammar(grammar);
    await manager.searchModel.pending;
    expect(manager.getMarkersForEditor(editor).length).toBe(2);
    expect(search).toHaveBeenCalled();
  });
});
