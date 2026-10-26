describe("bounded snapshot occurrence highlighting", () => {
  let editor, manager;
  beforeEach(async () => {
    jasmine.useRealClock();
    await lumine.packages.activatePackage("language-text");
    lumine.config.set("highlight-selected.timeout", 60000);
    editor = await lumine.workspace.open();
    manager = (await lumine.packages.activatePackage("highlight-selected")).mainModule
      .selectionManager;
  });
  afterEach(async () => {
    await lumine.packages.deactivatePackage("highlight-selected");
    editor?.destroy();
  });
  const select = () =>
    editor.setSelectedBufferRange([
      [0, 0],
      [0, 4],
    ]);

  it("retires a queued debounce before an explicitly awaited search starts", async () => {
    lumine.config.set("highlight-selected.timeout", 0);
    editor.setText("word word");
    select();
    const buffer = editor.getBuffer();
    const createSearch = buffer.createSearch.bind(buffer);
    const searched = spyOn(buffer, "createSearch").and.callFake((...args) => {
      const search = createSearch(...args);
      const matches = search.matches.bind(search);
      search.matches = async function* () {
        await new Promise((resolve) => setTimeout(resolve, 10));
        yield* matches();
      };
      return search;
    });
    await manager.searchModel.handleSelection();
    expect(searched).toHaveBeenCalledTimes(1);
    expect(manager.getMarkersForEditor(editor).length).toBe(1);
  });

  it("finds a far occurrence in a giant row without legacy scan or whole-text access", async () => {
    editor.setText("word " + "x".repeat(1024 * 1024) + " word");
    select();
    const scan = spyOn(editor, "scan").and.throwError("legacy scan");
    const read = spyOn(editor.getBuffer(), "getText").and.throwError("whole string");
    await manager.searchModel.handleSelection();
    expect(
      manager.getMarkersForEditor(editor).map((marker) => marker.getBufferRange().start.column),
    ).toEqual([1024 * 1024 + 6]);
    expect(scan).not.toHaveBeenCalled();
    expect(read).not.toHaveBeenCalled();
  });

  it("stops dense searches at a finite marker budget even for the legacy zero setting", async () => {
    lumine.config.set("highlight-selected.maximumHighlights", 0);
    editor.setText("word ".repeat(15000));
    select();
    await manager.searchModel.handleSelection();
    expect(manager.getMarkersForEditor(editor).length).toBe(10000);
    expect(manager.resultCount).toBe(10000);
  });

  it("aborts no-match work immediately when selection changes before debounce", async () => {
    editor.setText("word " + "x".repeat(8 * 1024 * 1024));
    select();
    const added = jasmine.createSpy("added");
    manager.onDidFinishAddingMarkers(added);
    const pending = manager.searchModel.handleSelection();
    const signal = manager.searchModel.request.controller.signal;
    editor.setCursorBufferPosition([0, 0]);
    expect(signal.aborted).toBeTrue();
    await pending;
    expect(added).not.toHaveBeenCalled();
    expect(manager.getMarkersForEditor(editor)).toEqual([]);
  });

  it("never restores markers from an obsolete revision or after disable", async () => {
    editor.setText("word ".repeat(20000));
    select();
    const pending = manager.searchModel.handleSelection();
    editor.getBuffer().setText("unrelated");
    manager.disable();
    await pending;
    expect(manager.getMarkersForEditor(editor)).toEqual([]);
    expect(manager.resultCount).toBe(0);
  });
});
