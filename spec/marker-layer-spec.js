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

  it("stops updating the layer once the consumer is disposed", () => {
    consumerDisposable.dispose();
    layer.update.calls.reset();
    service.emitter.emit("did-finish-adding-markers");
    expect(layer.update).not.toHaveBeenCalled();
    expect(markerLayer.highlightService).toBeNull();
  });
});
