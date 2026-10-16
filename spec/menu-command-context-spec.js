const path = require("node:path");
const packageRoot = path.join(__dirname, "..");

describe("highlight-selected menu commands in captured presentation contexts", () => {
  let main, first, second, firstPane, notebook, captured;

  beforeEach(async () => {
    jasmine.useRealClock();
    for (const method of ["openExternal", "openPath", "showItemInFolder", "openApplication"])
      if (!jasmine.isSpy(lumine.shell[method])) spyOn(lumine.shell, method).and.resolveTo();
    if (!jasmine.isSpy(lumine.application.openWindow))
      spyOn(lumine.application, "openWindow").and.resolveTo();
    jasmine.attachToDOM(lumine.workspace.getElement());
    first = await lumine.workspace.open();
    firstPane = lumine.workspace.paneForItem(first);
    second = lumine.workspace.buildTextEditor();
    main = (await lumine.packages.activatePackage(packageRoot)).mainModule;
    captured = spyOn(main.selectionManager, "goToNext").and.stub();
  });

  afterEach(async () => {
    await lumine.packages.deactivatePackage("highlight-selected");
    await lumine.workspace.discardEditorWindows();
    if (notebook) await lumine.workspace.paneForItem(notebook)?.destroyItem(notebook);
    first?.destroy();
    second?.destroy();
    main = first = second = firstPane = notebook = captured = null;
  });

  it("does not redirect a window control to the document in that window", async () => {
    const extra = await lumine.workspace.openEditorWindow({ show: false });
    extra.getEditorContainer().getActivePane().activateItem(second, { activatePane: true });
    firstPane.activate();
    firstPane.activateItem(first);
    const button = extra.getDocument().createElement("button");
    extra.getElement().appendChild(button);
    expect(lumine.workspace.getActiveTextEditor()).toBe(first);

    await lumine.commands.dispatch(button, "highlight-selected:go-to-next");

    expect(lumine.commands.canDispatch(button, "highlight-selected:go-to-next")).toBe(false);
    expect(captured).not.toHaveBeenCalled();
  });

  it("does not redirect a notebook control to its active cell editor", async () => {
    const element = document.createElement("div");
    const button = document.createElement("button");
    element.appendChild(button);
    notebook = {
      element,
      getTitle: () => "Command Context Notebook",
      getActiveEmbeddedTextEditor: () => second,
    };
    const pane = firstPane.splitRight();
    pane.activateItem(notebook, { activatePane: true });
    firstPane.activate();
    firstPane.activateItem(first);
    const context = lumine.workspace.resolveCommandContext(button);
    expect(context.editor).toBeUndefined();
    expect(context.embeddedEditor).toBe(second);
    expect(lumine.workspace.getActiveTextEditor()).toBe(first);

    await lumine.commands.dispatch(button, "highlight-selected:go-to-next");

    expect(lumine.commands.canDispatch(button, "highlight-selected:go-to-next")).toBe(false);
    expect(captured).not.toHaveBeenCalled();
  });

  it("does not select a shared main editor when the invoking presentation has no document", async () => {
    const extra = await lumine.workspace.openEditorWindow({ show: false });
    firstPane.activate();
    firstPane.activateItem(first);
    const button = extra.getDocument().createElement("button");
    extra.getElement().appendChild(button);
    expect(lumine.workspace.getActiveTextEditor()).toBe(first);

    await lumine.commands.dispatch(button, "highlight-selected:go-to-next");

    expect(captured).not.toHaveBeenCalled();
  });
});
