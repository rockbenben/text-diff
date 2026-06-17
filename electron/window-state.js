// 无 electron 依赖(win 由调用方传入)。
function createWindowStateKeeper(store) {
  const saved = store.get("windowState", { width: 1200, height: 800 });

  function track(win) {
    const save = () => {
      if (win.isMaximized()) {
        const prev = store.get("windowState", {});
        store.set("windowState", { ...prev, maximized: true });
      } else if (!win.isMinimized()) {
        const b = win.getBounds();
        store.set("windowState", { ...b, maximized: false });
      }
    };
    win.on("resize", save);
    win.on("move", save);
    win.on("close", save);
    if (saved.maximized) win.maximize();
  }

  return { saved, track };
}

module.exports = { createWindowStateKeeper };
