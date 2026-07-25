describe("highlight-selected", () => {
  let workspaceElement, editor, editorElement, mainModule, selectionManager;

  function getMarkers() {
    const layers = selectionManager.editorToMarkerLayerMap[editor.id];
    return layers.markerLayer.getMarkers();
  }

  function flushDebounce() {
    advanceClock(atom.config.get("highlight-selected.timeout") + 10);
  }

  beforeEach(async () => {
    workspaceElement = atom.views.getView(atom.workspace);
    jasmine.attachToDOM(workspaceElement);

    const pack = await atom.packages.activatePackage("highlight-selected");
    mainModule = pack.mainModule;
    selectionManager = mainModule.selectionManager;

    editor = await atom.workspace.open();
    editorElement = atom.views.getView(editor);
    editor.setText("hello world\nhello there\nhello again\nsomething else\n");
  });

  describe("activation", () => {
    it("activates and registers its commands", () => {
      expect(atom.packages.isPackageActive("highlight-selected")).toBe(true);
      const commands = atom.commands
        .findCommands({ target: workspaceElement })
        .map((command) => command.name);
      expect(commands).toContain("highlight-selected:toggle");
      expect(commands).toContain("highlight-selected:go-to-next");
      expect(commands).toContain("highlight-selected:go-to-previous");
    });

    it("creates a marker layer with a highlight-selected decoration per editor", () => {
      const layers = selectionManager.editorToMarkerLayerMap[editor.id];
      expect(layers).toBeDefined();
      expect(layers.markerLayer).toBeDefined();
      expect(layers.decoration.getProperties().type).toBe("highlight");
      expect(layers.decoration.getProperties().class).toBe("highlight-selected");
    });
  });

  describe("highlighting", () => {
    it("highlights other occurrences of the selected word", () => {
      editor.setSelectedBufferRange([
        [0, 0],
        [0, 5],
      ]);
      flushDebounce();

      const markers = getMarkers();
      expect(markers.length).toBe(2);
      const ranges = markers.map((marker) => marker.getBufferRange());
      expect(ranges[0].start.row).toBe(1);
      expect(ranges[1].start.row).toBe(2);
    });

    it("removes highlights when the selection is cleared", () => {
      editor.setSelectedBufferRange([
        [0, 0],
        [0, 5],
      ]);
      flushDebounce();
      expect(getMarkers().length).toBe(2);

      editor.setCursorBufferPosition([0, 0]);
      flushDebounce();
      expect(getMarkers().length).toBe(0);
    });

    it("ignores selections shorter than the minimum length", () => {
      editor.setSelectedBufferRange([
        [0, 0],
        [0, 1],
      ]);
      flushDebounce();
      expect(getMarkers().length).toBe(0);
    });

    it("caps the number of highlights at the maximumHighlights setting", () => {
      atom.config.set("highlight-selected.maximumHighlights", 1);
      editor.setSelectedBufferRange([
        [0, 0],
        [0, 5],
      ]);
      flushDebounce();
      expect(getMarkers().length).toBe(1);
    });

    it("emits events when markers are added and removed", () => {
      const added = jasmine.createSpy("added");
      const removed = jasmine.createSpy("removed");
      selectionManager.onDidFinishAddingMarkers(added);
      selectionManager.onDidRemoveAllMarkers(removed);

      editor.setSelectedBufferRange([
        [0, 0],
        [0, 5],
      ]);
      flushDebounce();
      expect(added).toHaveBeenCalled();
      expect(removed).toHaveBeenCalled();
    });
  });

  describe("highlight-selected:toggle", () => {
    it("disables and re-enables highlighting", () => {
      editor.setSelectedBufferRange([
        [0, 0],
        [0, 5],
      ]);
      flushDebounce();
      expect(getMarkers().length).toBe(2);

      atom.commands.dispatch(editorElement, "highlight-selected:toggle");
      expect(selectionManager.disabled).toBe(true);
      expect(getMarkers().length).toBe(0);

      atom.commands.dispatch(editorElement, "highlight-selected:toggle");
      expect(selectionManager.disabled).toBe(false);
      flushDebounce();
      expect(getMarkers().length).toBe(2);
    });
  });

  describe("occurrence navigation", () => {
    beforeEach(() => {
      editor.setSelectedBufferRange([
        [0, 0],
        [0, 5],
      ]);
      flushDebounce();
      expect(getMarkers().length).toBe(2);
    });

    it("go-to-next selects the next occurrence", () => {
      atom.commands.dispatch(editorElement, "highlight-selected:go-to-next");
      expect(editor.getSelectedBufferRange().start.row).toBe(1);
      expect(editor.getSelectedText()).toBe("hello");
    });

    it("go-to-previous wraps around to the last occurrence", () => {
      atom.commands.dispatch(editorElement, "highlight-selected:go-to-previous");
      expect(editor.getSelectedBufferRange().start.row).toBe(2);
      expect(editor.getSelectedText()).toBe("hello");
    });
  });

  describe("highlight-selected service", () => {
    it("provides a facade with the event API and a marker accessor", () => {
      const service = mainModule.provideHighlightSelected();
      expect(typeof service.onDidFinishAddingMarkers).toBe("function");
      expect(typeof service.onDidRemoveAllMarkers).toBe("function");
      expect(typeof service.getMarkersForEditor).toBe("function");
      // The internal selection manager stays private.
      expect(service.editorToMarkerLayerMap).toBeUndefined();

      let finished = false;
      const sub = service.onDidFinishAddingMarkers(() => {
        finished = true;
      });
      editor.setSelectedBufferRange([
        [0, 0],
        [0, 5],
      ]);
      flushDebounce();
      sub.dispose();

      expect(finished).toBe(true);
      expect(service.getMarkersForEditor(editor).length).toBe(2);
    });
  });
});
