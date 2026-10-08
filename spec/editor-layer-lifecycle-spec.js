const { CompositeDisposable } = require("lumine");

describe("Highlight editor layer lifetime", () => {
  let editor, main, manager, service, disposables;

  beforeEach(async () => {
    jasmine.useRealClock();
    disposables = new CompositeDisposable();
    editor = await lumine.workspace.open();
    editor.setText("word word word");
    editor.setSelectedBufferRange([
      [0, 0],
      [0, 4],
    ]);
    jasmine.attachToDOM(lumine.workspace.getElement());
    main = (await lumine.packages.activatePackage("highlight-selected")).mainModule;
    manager = main.selectionManager;
    service = main.provideHighlightSelected();
    manager.searchModel.handleSelection();
    expect(service.getMarkersForEditor(editor).length).toBe(2);
  });

  afterEach(async () => {
    disposables.dispose();
    await lumine.packages.deactivatePackage("highlight-selected");
    editor.destroy();
  });

  function preventClose() {
    disposables.add(lumine.workspace.onWillDestroyPaneItem((event) => event.prevent()));
  }

  it("keeps highlights after a real Core listener prevents closing the editor", async () => {
    preventClose();
    const pane = lumine.workspace.paneForItem(editor);
    const closed = await pane.destroyItem(editor, true);
    expect(closed).toBe(false);
    expect(editor.isDestroyed()).toBe(false);
    expect(pane.getItems()).toContain(editor);
    expect(service.getMarkersForEditor(editor).length).toBe(2);
    editor.setSelectedBufferRange([
      [0, 5],
      [0, 9],
    ]);
    manager.searchModel.handleSelection();
    expect(service.getMarkersForEditor(editor).length).toBe(2);
  });

  it("keeps the current markers while an actual close listener is pending", async () => {
    let entered, release;
    const started = new Promise((resolve) => {
      entered = resolve;
    });
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    disposables.add(
      lumine.workspace.onWillDestroyPaneItem(async (event) => {
        entered();
        await gate;
        event.prevent();
      }),
    );
    const pane = lumine.workspace.paneForItem(editor);
    const closing = pane.destroyItem(editor, true);
    await started;
    expect(editor.isDestroyed()).toBe(false);
    expect(service.getMarkersForEditor(editor).length).toBe(2);
    release();
    expect(await closing).toBe(false);
    expect(service.getMarkersForEditor(editor).length).toBe(2);
  });

  it("forgets and destroys the owned layers after an actual pane close succeeds", async () => {
    const layers = manager.editorToMarkerLayerMap[editor.id];
    const pane = lumine.workspace.paneForItem(editor);
    expect(await pane.destroyItem(editor, true)).toBe(true);
    expect(editor.isDestroyed()).toBe(true);
    expect(layers.markerLayer.isDestroyed()).toBe(true);
    expect(layers.decoration.isDestroyed()).toBe(true);
    expect(manager.editorToMarkerLayerMap[editor.id]).toBeUndefined();
    expect(service.getMarkersForEditor(editor)).toEqual([]);
  });

  it("forgets the record when a live editor is destroyed directly", () => {
    const layers = manager.editorToMarkerLayerMap[editor.id];
    editor.destroy();
    expect(layers.markerLayer.isDestroyed()).toBe(true);
    expect(layers.decoration.isDestroyed()).toBe(true);
    expect(manager.editorToMarkerLayerMap[editor.id]).toBeUndefined();
    expect(service.getMarkersForEditor(editor)).toEqual([]);
  });

  it("creates fresh layers for the current package generation after deactivation", async () => {
    const previousService = service;
    const previousLayers = manager.editorToMarkerLayerMap[editor.id];
    await lumine.packages.deactivatePackage("highlight-selected");
    expect(previousLayers.markerLayer.isDestroyed()).toBe(true);
    expect(previousService.getMarkersForEditor(editor)).toEqual([]);
    main = (await lumine.packages.activatePackage("highlight-selected")).mainModule;
    manager = main.selectionManager;
    service = main.provideHighlightSelected();
    manager.searchModel.handleSelection();
    expect(manager.editorToMarkerLayerMap[editor.id].markerLayer).not.toBe(
      previousLayers.markerLayer,
    );
    expect(service.getMarkersForEditor(editor).length).toBe(2);
    editor.destroy();
    expect(service.getMarkersForEditor(editor)).toEqual([]);
    expect(manager.editorToMarkerLayerMap[editor.id]).toBeUndefined();
  });

  it("preserves the marker provider's live rows across a refused close and host reattachment", async () => {
    const provider = main.provideMarkerLayer();
    const makeLayer = () => {
      const layer = {
        editor,
        cache: new Map(),
        disposables: new CompositeDisposable(),
        update: jasmine.createSpy("update overview"),
      };
      disposables.add(layer.disposables);
      provider.initialize(layer);
      return layer;
    };
    const first = makeLayer();
    expect(provider.getItems(first).length).toBe(2);
    preventClose();
    expect(await lumine.workspace.paneForItem(editor).destroyItem(editor, true)).toBe(false);
    first.disposables.dispose();
    const second = makeLayer();
    expect(provider.getItems(second).length).toBe(2);
    editor.setSelectedBufferRange([
      [0, 5],
      [0, 9],
    ]);
    manager.searchModel.handleSelection();
    expect(second.update).toHaveBeenCalled();
    expect(provider.getItems(second).length).toBe(2);
  });
});
