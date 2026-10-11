beforeEach(() => {
  for (const method of ["openExternal", "openPath", "showItemInFolder", "openApplication"])
    spyOn(lumine.shell, method).and.resolveTo();
  spyOn(lumine.application, "openWindow").and.resolveTo();
});

describe("Highlight occurrence command editor targets", () => {
  let editor, background, main;
  beforeEach(async () => {
    jasmine.useRealClock();
    jasmine.attachToDOM(lumine.workspace.getElement());
    if (lumine.packages.isPackageLoaded("highlight-selected"))
      await lumine.packages.unloadPackage("highlight-selected");
    lumine.config.set("highlight-selected.timeout", 0);
    editor = await lumine.workspace.open();
    const pane = lumine.workspace.paneForItem(editor);
    editor.setText("😀 foo foo");
    background = await lumine.workspace.open(undefined, { split: "right" });
    background.setText("foo\nfoo\nfoo");
    background.setSelectedBufferRange([
      [1, 0],
      [1, 3],
    ]);
    pane.activate();
    pane.activateItem(editor);
    editor.getElement().focus();
    main = (await lumine.packages.activatePackage("highlight-selected")).mainModule;
    editor.setSelectedBufferRange([
      [0, 3],
      [0, 6],
    ]);
    await conditionPromise(
      () => main.provideHighlightSelected().getMarkersForEditor(background).length === 3,
    );
    expect(lumine.workspace.getActiveTextEditor()).toBe(editor);
  });

  afterEach(async () => {
    if (lumine.packages.isPackageLoaded("highlight-selected"))
      await lumine.packages.unloadPackage("highlight-selected");
    editor?.destroy();
    background?.destroy();
    await lumine.fileWatchClient.settlePendingTeardown();
    editor = background = main = null;
  });

  it("moves to the next occurrence in the editor that dispatched the command", async () => {
    await lumine.commands.dispatch(background.getElement(), "highlight-selected:go-to-next");
    expect(background.getSelectedBufferRange().serialize()).toEqual([
      [2, 0],
      [2, 3],
    ]);
    expect(editor.getSelectedBufferRange().serialize()).toEqual([
      [0, 3],
      [0, 6],
    ]);
  });

  it("moves to the previous occurrence in the editor that dispatched the command", async () => {
    await lumine.commands.dispatch(background.getElement(), "highlight-selected:go-to-previous");
    expect(background.getSelectedBufferRange().serialize()).toEqual([
      [0, 0],
      [0, 3],
    ]);
    expect(editor.getSelectedBufferRange().serialize()).toEqual([
      [0, 3],
      [0, 6],
    ]);
  });

  it("keeps the active editor fallback and its UTF-16 marker positions for menu dispatch", async () => {
    await lumine.commands.dispatch(lumine.workspace.getElement(), "highlight-selected:go-to-next");
    expect(editor.getSelectedBufferRange().serialize()).toEqual([
      [0, 7],
      [0, 10],
    ]);
    expect(background.getSelectedBufferRange().serialize()).toEqual([
      [1, 0],
      [1, 3],
    ]);
  });
});
