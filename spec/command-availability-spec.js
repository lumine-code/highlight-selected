describe("Highlight Selected command availability", () => {
  let editor, fragment;
  beforeEach(async () => {
    jasmine.attachToDOM(lumine.workspace.getElement());
    await lumine.packages.activatePackage("highlight-selected");
    editor = await lumine.workspace.open();
  });
  afterEach(async () => {
    fragment?.destroy();
    editor.destroy();
    await lumine.packages.deactivatePackage("highlight-selected");
    fragment = null;
  });
  it("requires an existing controller without creating one for an arbitrary editor", () => {
    fragment = lumine.workspace.buildTextEditor();
    lumine.workspace.getElement().appendChild(fragment.element);
    expect(lumine.commands.canDispatch(fragment.element, "highlight-selected:go-to-next")).toBe(
      false,
    );
    expect(lumine.commands.canDispatch(editor.element, "highlight-selected:go-to-next")).toBe(true);
  });
});
