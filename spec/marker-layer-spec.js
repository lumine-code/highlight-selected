const { CompositeDisposable, Emitter } = require("lumine");

describe("highlight-selected marker layer", () => {
  let editor, mainModule, markerLayer, provider, layer, layers, service, consumerDisposable;

  // Minimal stand-in for the layer object a marker host passes to `initialize`
  // and `getItems` (see lib/layer.js in the marker package).
  function makeLayer(targetEditor) {
    const fake = {
      editor: targetEditor,
      props: provider,
      cache: new Map(),
      items: [],
      disposables: new CompositeDisposable(),
    };
    fake.update = jasmine.createSpy("update").and.callFake(() => {
      const items = provider.getItems(fake);
      if (items) {
        fake.items = items;
      }
    });
    fake.updateSync = fake.update;
    if (provider.initialize) {
      provider.initialize(fake);
    }
    layers.push(fake);
    return fake;
  }

  // Fake service mirroring the facade returned by provideHighlightSelected():
  // onDidChangeMarkers(editor) and getMarkersForEditor(editor).
  function makeFakeService() {
    const emitter = new Emitter();
    const markerLayers = new Map();
    return {
      emitter,
      markerLayers,
      onDidChangeMarkers: (callback) => emitter.on("did-change-markers", callback),
      getMarkersForEditor: (markerEditor) => markerLayers.get(markerEditor)?.getMarkers() || [],
    };
  }

  beforeEach(async () => {
    jasmine.attachToDOM(lumine.views.getView(lumine.workspace));
    const pack = await lumine.packages.activatePackage("highlight-selected");
    mainModule = pack.mainModule;
    markerLayer = mainModule.markerLayer;
    // Activation wired the layer to the real selection manager; take that
    // connection down so the fake service below is the only one speaking.
    mainModule.markerLayerConnection.dispose();
    provider = mainModule.provideMarkerLayer();
    editor = await lumine.workspace.open();
    editor.setText(Array(50).fill("hello world").join("\n"));
    layers = [];
    layer = makeLayer(editor);
    service = makeFakeService();
    consumerDisposable = markerLayer.connect(service);
  });

  afterEach(() => {
    consumerDisposable.dispose();
    for (const attached of layers) {
      attached.disposables.dispose();
    }
  });

  function markRanges(...ranges) {
    const editorMarkerLayer = editor.addMarkerLayer();
    for (const range of ranges) {
      editorMarkerLayer.markScreenRange(range);
    }
    service.markerLayers.set(editor, editorMarkerLayer);
    return editorMarkerLayer;
  }

  it("activates and provides a marker layer descriptor", () => {
    expect(lumine.packages.isPackageActive("highlight-selected")).toBe(true);
    expect(provider.name).toBe("highlight");
    expect(typeof provider.description).toBe("string");
    expect(provider.merge).toBe(true);
    expect(provider.enabled).toBe("highlight-selected.marker.enabled");
    expect(provider.threshold).toBe("highlight-selected.marker.threshold");
    expect(typeof provider.initialize).toBe("function");
    expect(typeof provider.getItems).toBe("function");
  });

  it("pushes highlight markers to the layer when markers finish adding", () => {
    markRanges(
      [
        [2, 0],
        [2, 5],
      ],
      [
        [10, 0],
        [11, 5],
      ],
    );
    service.emitter.emit("did-change-markers", editor);
    expect(layer.update).toHaveBeenCalled();
    expect(layer.items).toEqual([
      { row: 2, end: 2 },
      { row: 10, end: 11 },
    ]);
  });

  it("returns raw ranges and leaves sorting and merging to the host", () => {
    // Created out of document order on purpose.
    markRanges(
      [
        [20, 0],
        [20, 5],
      ],
      [
        [3, 0],
        [3, 5],
      ],
    );
    service.emitter.emit("did-change-markers", editor);
    expect(layer.items).toEqual([
      { row: 20, end: 20 },
      { row: 3, end: 3 },
    ]);
  });

  it("defers a clear/add burst to one read of the current markers at the host poll", () => {
    const getMarkers = spyOn(service, "getMarkersForEditor").and.callThrough();
    layer.update.and.stub();
    const initial = markRanges([
      [2, 0],
      [2, 5],
    ]);
    service.emitter.emit("did-change-markers", editor);
    initial.clear();
    service.emitter.emit("did-change-markers", editor);
    service.emitter.emit("did-change-markers", editor);
    expect(layer.update.calls.count()).toBeGreaterThan(0);
    expect(getMarkers).not.toHaveBeenCalled();

    // The producer can finish replacing its layer before the next frame polls.
    markRanges([
      [12, 0],
      [13, 5],
    ]);
    expect(provider.getItems(layer)).toEqual([{ row: 12, end: 13 }]);
    expect(getMarkers).toHaveBeenCalledTimes(1);
  });

  it("clears the layer when all markers are removed", () => {
    const editorMarkerLayer = markRanges([
      [2, 0],
      [2, 5],
    ]);
    service.emitter.emit("did-change-markers", editor);
    expect(layer.items.length).toBe(1);

    editorMarkerLayer.clear();
    service.emitter.emit("did-change-markers", editor);
    expect(layer.items).toEqual([]);
  });

  it("drops a highlight invalidated by Enter while valid anchors keep following the edit", () => {
    const markers = editor.addMarkerLayer();
    const edited = markers.markScreenRange(
      [
        [2, 0],
        [2, 5],
      ],
      { invalidate: "inside" },
    );
    const following = markers.markScreenRange(
      [
        [10, 0],
        [10, 5],
      ],
      { invalidate: "inside" },
    );
    service.markerLayers.set(editor, markers);
    service.emitter.emit("did-change-markers", editor);
    expect(layer.items.length).toBe(2);

    editor.getBuffer().insert([2, 2], "\n");

    expect(edited.isValid()).toBe(false);
    expect(following.isValid()).toBe(true);
    // Poll current native anchors before another producer notification.
    expect(provider.getItems(layer)).toEqual([{ row: 11, end: 11 }]);
  });

  it("updates only the edited native layer before the selection debounce runs", () => {
    consumerDisposable.dispose();
    const manager = mainModule.selectionManager;
    consumerDisposable = markerLayer.connect(mainModule.provideHighlightSelected());
    const background = lumine.workspace.buildTextEditor();
    background.setText(Array(20).fill("hello world").join("\n"));
    manager.setupMarkerLayers(background);
    const overview = makeLayer(background);
    const native = manager.editorToMarkerLayerMap[background.id].markerLayer;
    const edited = native.markBufferRange(
      [
        [2, 0],
        [2, 5],
      ],
      { invalidate: "inside" },
    );
    native.markBufferRange(
      [
        [10, 0],
        [10, 5],
      ],
      { invalidate: "inside" },
    );
    const rescan = spyOn(manager.searchModel, "handleSelection").and.callThrough();
    layer.update.calls.reset();
    overview.update.calls.reset();
    try {
      background.getBuffer().insert([2, 2], "x");

      expect(edited.isValid()).toBe(false);
      expect(overview.update).toHaveBeenCalled();
      expect(overview.items).toEqual([{ row: 10, end: 10 }]);
      expect(layer.update).not.toHaveBeenCalled();
      expect(rescan).not.toHaveBeenCalled();
    } finally {
      overview.disposables.dispose();
      background.destroy();
    }
  });

  it("forgets the editor when its layer detaches", () => {
    layer.disposables.dispose();
    layer.update.calls.reset();

    markRanges([
      [7, 0],
      [8, 5],
    ]);
    service.emitter.emit("did-change-markers", editor);

    expect(layer.update).not.toHaveBeenCalled();
    expect(markerLayer.layers.size).toBe(0);
  });

  it("reads existing highlights when a new layer attaches without a change event", () => {
    markRanges([
      [7, 0],
      [7, 5],
    ]);
    layer.disposables.dispose();

    const attached = makeLayer(editor);
    expect(attached.update).toHaveBeenCalled();
    expect(attached.items).toEqual([{ row: 7, end: 7 }]);
  });

  it("reads current highlights when reconnecting without a change event", () => {
    consumerDisposable.dispose();
    const highlights = markRanges([
      [12, 0],
      [13, 5],
    ]);
    const replacement = makeFakeService();
    replacement.markerLayers.set(editor, highlights);
    layer.update.calls.reset();

    consumerDisposable = markerLayer.connect(replacement);
    expect(layer.update).toHaveBeenCalledTimes(1);
    expect(layer.items).toEqual([{ row: 12, end: 13 }]);
  });

  it("ignores events and disposal from an older connection to the same facade", () => {
    const previous = consumerDisposable;
    consumerDisposable = markerLayer.connect(service);
    layer.update.calls.reset();

    // Only the current connection may invalidate, even while both subscribe.
    service.emitter.emit("did-change-markers", editor);
    expect(layer.update).toHaveBeenCalledTimes(1);
    previous.dispose();
    expect(markerLayer.highlightService).toBe(service);
    layer.update.calls.reset();
    service.emitter.emit("did-change-markers", editor);
    expect(layer.update).toHaveBeenCalledTimes(1);
  });

  it("clears markers on disconnect and stops responding to the retired service", () => {
    markRanges([
      [7, 0],
      [7, 5],
    ]);
    service.emitter.emit("did-change-markers", editor);
    expect(layer.items.length).toBe(1);
    layer.update.calls.reset();
    consumerDisposable.dispose();
    expect(layer.update).toHaveBeenCalledTimes(1);
    expect(layer.items).toEqual([]);
    layer.update.calls.reset();
    service.emitter.emit("did-change-markers", editor);
    expect(layer.update).not.toHaveBeenCalled();
    expect(markerLayer.highlightService).toBeNull();
  });
});
