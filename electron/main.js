const { app, BrowserWindow } = require("electron");
const path = require("path");
const { SCHEME } = require("./constants");
const { registerScheme, handleProtocol } = require("./protocol");
const { createStore } = require("./store");
const { startUrl, trackLocale } = require("./locale");
const { createWindowStateKeeper } = require("./window-state");

const isDev = process.env.ELECTRON_DEV === "1";
const OUT_DIR = app.isPackaged
  ? path.join(process.resourcesPath, "out")
  : path.join(__dirname, "..", "out");

// 协议方案必须在 ready 前注册。
registerScheme();

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  let win = null;
  const store = createStore(app.getPath("userData"));
  const windowState = createWindowStateKeeper(store);

  app.on("second-instance", () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      if (!win.isVisible()) win.show();
      win.focus();
    }
  });

  function createWindow() {
    const s = windowState.saved;
    win = new BrowserWindow({
      width: s.width,
      height: s.height,
      x: s.x,
      y: s.y,
      show: false,
      webPreferences: { contextIsolation: true, nodeIntegration: false },
    });

    windowState.track(win);
    trackLocale(win, store);

    if (isDev) {
      win.loadURL("http://localhost:3000");
    } else {
      win.loadURL(startUrl(store));
    }
    win.once("ready-to-show", () => win.show());
    return win;
  }

  app.whenReady().then(() => {
    if (!isDev) handleProtocol(OUT_DIR);
    createWindow();
    // <-- TRAY-HOOK (Task 7):setupTray(app, () => win, ICON_PATH)

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  // 关闭所有窗口不退出(Task 7 起改为常驻托盘);Windows 上保持运行。
  app.on("window-all-closed", () => {
    if (!isDev) return; // 非 dev 常驻;dev 模式下允许正常退出便于迭代
    app.quit();
  });
}
