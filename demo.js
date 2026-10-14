// Authentic package usage. Run with lumine/script/demo.js; fixtures stay in demo/.
module.exports = {
  version: 1,
  dependencies: [],
  viewport: { width: 1100, height: 730 },
  async before() {},
  async prepare(context) {
    const { state, open } = context;
    state.editor = await open("usage/signal.js");
  },
  scenes: [
    {
      id: "scene-1",
      file: "demo.png",
      caption: "Selecting a word highlights its other occurrences in the file.",
      timeout: 60000,
      async run(context) {
        const { state } = context;
        {
          state.editor.setSelectedBufferRange([
            [2, 9],
            [2, 16],
          ]);
        }
      },
      ready() {
        return Boolean(document.querySelectorAll(".highlight-selected").length > 0);
      },
    },
  ],
  async cleanup() {},
};
