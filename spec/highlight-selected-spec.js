describe("highlight-selected", () => {
  // Processing fixtures use a real grammar; None deliberately disables this package.
  beforeEach(async () => {
    await lumine.packages.activatePackage("language-text");
  });

  let workspaceElement, editor, editorElement, mainModule, selectionManager;

  function getMarkers() {
    const layers = selectionManager.editorToMarkerLayerMap[editor.id];
    return layers.markerLayer.getMarkers();
  }

  async function flushDebounce() {
    advanceClock(lumine.config.get("highlight-selected.timeout") + 10);
    await selectionManager.searchModel.pending;
  }

  beforeEach(async () => {
    workspaceElement = lumine.views.getView(lumine.workspace);
    jasmine.attachToDOM(workspaceElement);

    const pack = await lumine.packages.activatePackage("highlight-selected");
    mainModule = pack.mainModule;
    selectionManager = mainModule.selectionManager;

    editor = await lumine.workspace.open();
    editorElement = lumine.views.getView(editor);
    editor.setText("hello world\nhello there\nhello again\nsomething else\n");
  });

  describe("activation", () => {
    it("activates and registers its commands", async () => {
      expect(lumine.packages.isPackageActive("highlight-selected")).toBe(true);
      const commands = lumine.commands
        .findCommands({ target: editorElement })
        .map((command) => command.name);
      expect(commands).toContain("highlight-selected:toggle");
      expect(commands).toContain("highlight-selected:go-to-next");
      expect(commands).toContain("highlight-selected:go-to-previous");
    });

    it("keeps occurrence navigation local while the highlighting switch remains global", async () => {
      expect(lumine.commands.canDispatch(workspaceElement, "highlight-selected:toggle")).toBe(true);
      expect(lumine.commands.canDispatch(workspaceElement, "highlight-selected:go-to-next")).toBe(
        false,
      );
      const mini = lumine.workspace.buildTextEditor({ mini: true });
      workspaceElement.appendChild(mini.getElement());
      expect(lumine.commands.canDispatch(mini.getElement(), "highlight-selected:go-to-next")).toBe(
        false,
      );
      mini.destroy();
    });

    it("creates a marker layer with a highlight-selected decoration per editor", async () => {
      const layers = selectionManager.editorToMarkerLayerMap[editor.id];
      expect(layers).toBeDefined();
      expect(layers.markerLayer).toBeDefined();
      expect(layers.decoration.getProperties().type).toBe("highlight");
      expect(layers.decoration.getProperties().class).toBe("highlight-selected");
    });
  });

  describe("highlighting", () => {
    it("highlights other occurrences of the selected word", async () => {
      editor.setSelectedBufferRange([
        [0, 0],
        [0, 5],
      ]);
      await flushDebounce();

      const markers = getMarkers();
      expect(markers.length).toBe(2);
      const ranges = markers.map((marker) => marker.getBufferRange());
      expect(ranges[0].start.row).toBe(1);
      expect(ranges[1].start.row).toBe(2);
    });

    it("removes highlights when the selection is cleared", async () => {
      editor.setSelectedBufferRange([
        [0, 0],
        [0, 5],
      ]);
      await flushDebounce();
      expect(getMarkers().length).toBe(2);

      editor.setCursorBufferPosition([0, 0]);
      await flushDebounce();
      expect(getMarkers().length).toBe(0);
    });

    it("ignores selections shorter than the minimum length", async () => {
      editor.setSelectedBufferRange([
        [0, 0],
        [0, 1],
      ]);
      await flushDebounce();
      expect(getMarkers().length).toBe(0);
    });

    it("rejects multiline selections before reading their text", async () => {
      editor.setText("selected line\n".repeat(10000));
      editor.selectAll();
      const read = spyOn(editor.getLastSelection(), "getText").and.throwError(
        "unbounded selection read",
      );
      try {
        expect(() => selectionManager.searchModel.handleSelection()).not.toThrow();
        expect(read).not.toHaveBeenCalled();
        expect(getMarkers().length).toBe(0);
      } finally {
        // Linux PRIMARY owns a separate, bounded selection read. Keep this
        // assertion scoped to the package's incidental highlighting path.
        read.and.callThrough();
      }
    });

    it("bounds automatic single-line patterns before reading their text", async () => {
      editor.setText("x".repeat(5000));
      editor.selectAll();
      const read = spyOn(editor.getLastSelection(), "getText").and.throwError(
        "unbounded selection read",
      );
      try {
        expect(() => selectionManager.searchModel.handleSelection()).not.toThrow();
        expect(read).not.toHaveBeenCalled();
        expect(getMarkers().length).toBe(0);
      } finally {
        read.and.callThrough();
      }
    });

    it("retains UTF-16 minimum-length semantics for astral text", async () => {
      editor.setText("😀 😀");
      lumine.config.set("highlight-selected.minimumLength", 2);
      editor.setSelectedBufferRange([
        [0, 0],
        [0, 2],
      ]);
      await flushDebounce();
      expect(getMarkers().map((marker) => marker.getBufferRange().serialize())).toEqual([
        [
          [0, 3],
          [0, 5],
        ],
      ]);
      lumine.config.set("highlight-selected.minimumLength", 3);
      const read = spyOn(editor.getLastSelection(), "getText").and.throwError(
        "short selection read",
      );
      try {
        selectionManager.searchModel.handleSelection();
        expect(read).not.toHaveBeenCalled();
        expect(getMarkers().length).toBe(0);
      } finally {
        read.and.callThrough();
      }
    });

    it("caps the number of highlights at the maximumHighlights setting", async () => {
      lumine.config.set("highlight-selected.maximumHighlights", 1);
      editor.setSelectedBufferRange([
        [0, 0],
        [0, 5],
      ]);
      await flushDebounce();
      expect(getMarkers().length).toBe(1);
    });

    it("emits events when markers are added and removed", async () => {
      const added = jasmine.createSpy("added");
      const removed = jasmine.createSpy("removed");
      selectionManager.onDidFinishAddingMarkers(added);
      selectionManager.onDidRemoveAllMarkers(removed);

      editor.setSelectedBufferRange([
        [0, 0],
        [0, 5],
      ]);
      await flushDebounce();
      expect(added).toHaveBeenCalled();
      expect(removed).toHaveBeenCalled();
    });
  });

  describe("highlight-selected:toggle", () => {
    it("disables and re-enables highlighting", async () => {
      editor.setSelectedBufferRange([
        [0, 0],
        [0, 5],
      ]);
      await flushDebounce();
      expect(getMarkers().length).toBe(2);

      lumine.commands.dispatch(editorElement, "highlight-selected:toggle");
      expect(selectionManager.disabled).toBe(true);
      expect(getMarkers().length).toBe(0);

      lumine.commands.dispatch(editorElement, "highlight-selected:toggle");
      expect(selectionManager.disabled).toBe(false);
      await flushDebounce();
      expect(getMarkers().length).toBe(2);
    });
  });

  describe("occurrence navigation", () => {
    beforeEach(async () => {
      editor.setSelectedBufferRange([
        [0, 0],
        [0, 5],
      ]);
      await flushDebounce();
      expect(getMarkers().length).toBe(2);
    });

    it("go-to-next selects the next occurrence", async () => {
      lumine.commands.dispatch(editorElement, "highlight-selected:go-to-next");
      expect(editor.getSelectedBufferRange().start.row).toBe(1);
      expect(editor.getSelectedText()).toBe("hello");
    });

    it("go-to-previous wraps around to the last occurrence", async () => {
      lumine.commands.dispatch(editorElement, "highlight-selected:go-to-previous");
      expect(editor.getSelectedBufferRange().start.row).toBe(2);
      expect(editor.getSelectedText()).toBe("hello");
    });
  });

  describe("highlight-selected service", () => {
    it("provides a facade with the event API and a marker accessor", async () => {
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
      await flushDebounce();
      sub.dispose();

      expect(finished).toBe(true);
      expect(service.getMarkersForEditor(editor).length).toBe(2);
    });
  });
});
