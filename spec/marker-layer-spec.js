const { CompositeDisposable, Emitter } = require("lumine");

describe("highlight-selected marker layer", () => {
  // Processing fixtures use a real grammar; None deliberately disables this package.
  beforeEach(async () => {
    await lumine.packages.activatePackage("language-text");
  });

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
  // onDidFinishAddingMarkers, onDidRemoveAllMarkers, and
  // getMarkersForEditor(editor).
  function makeFakeService() {
    const emitter = new Emitter();
    const markerLayers = new Map();
    return {
      emitter,
      markerLayers,
      onDidFinishAddingMarkers: (callback) => emitter.on("did-finish-adding-markers", callback),
      onDidRemoveAllMarkers: (callback) => emitter.on("did-remove-all-markers", callback),
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
    service.emitter.emit("did-finish-adding-markers");
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
    service.emitter.emit("did-finish-adding-markers");
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
    service.emitter.emit("did-finish-adding-markers");
    initial.clear();
    service.emitter.emit("did-remove-all-markers");
    service.emitter.emit("did-finish-adding-markers");
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
    service.emitter.emit("did-finish-adding-markers");
    expect(layer.items.length).toBe(1);

    editorMarkerLayer.clear();
    service.emitter.emit("did-remove-all-markers");
    expect(layer.items).toEqual([]);
  });

  it("forgets the editor when its layer detaches", () => {
    layer.disposables.dispose();
    layer.update.calls.reset();

    markRanges([
      [7, 0],
      [8, 5],
    ]);
    service.emitter.emit("did-finish-adding-markers");

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
    service.emitter.emit("did-finish-adding-markers");
    expect(layer.update).toHaveBeenCalledTimes(1);
    previous.dispose();
    expect(markerLayer.highlightService).toBe(service);
    layer.update.calls.reset();
    service.emitter.emit("did-remove-all-markers");
    expect(layer.update).toHaveBeenCalledTimes(1);
  });

  it("clears markers on disconnect and stops responding to the retired service", () => {
    markRanges([
      [7, 0],
      [7, 5],
    ]);
    service.emitter.emit("did-finish-adding-markers");
    expect(layer.items.length).toBe(1);
    layer.update.calls.reset();
    consumerDisposable.dispose();
    expect(layer.update).toHaveBeenCalledTimes(1);
    expect(layer.items).toEqual([]);
    layer.update.calls.reset();
    service.emitter.emit("did-finish-adding-markers");
    expect(layer.update).not.toHaveBeenCalled();
    expect(markerLayer.highlightService).toBeNull();
  });
});
