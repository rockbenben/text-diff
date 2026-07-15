const { app, BrowserWindow, Menu, shell } = require("electron");
const path = require("path");
const { SCHEME } = require("./constants");
const { registerScheme, handleProtocol } = require("./protocol");
const { createStore } = require("./store");
const { startUrl, trackLocale } = require("./locale");
const { createWindowStateKeeper } = require("./window-state");
const { setupTray } = require("./tray");

const isDev = process.env.ELECTRON_DEV === "1";
const OUT_DIR = app.isPackaged
  ? path.join(process.resourcesPath, "out")
  : path.join(__dirname, "..", "out");
const ICON_PATH = app.isPackaged
  ? path.join(process.resourcesPath, "icon.png")
  : path.join(__dirname, "..", "build", "icon.png");

// 协议方案必须在 ready 前注册。
registerScheme();

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  let win = null;
  let tray = null;
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

    // 外链走系统默认浏览器,不在应用窗口内导航。去掉菜单栏后窗口没有后退入口,
    // 若让站外链接在窗口内加载会把用户困住。
    win.webContents.setWindowOpenHandler(({ url }) => {
      if (/^https?:/.test(url)) {
        shell.openExternal(url);
        return { action: "deny" };
      }
      return { action: "allow" };
    });
    win.webContents.on("will-navigate", (e, navUrl) => {
      // 允许应用自身(app://)与 dev 服务器(localhost)的整页导航,其余交给系统浏览器。
      if (!navUrl.startsWith("app://") && !navUrl.startsWith("http://localhost")) {
        e.preventDefault();
        shell.openExternal(navUrl);
      }
    });

    if (isDev) {
      win.loadURL("http://localhost:3000");
    } else {
      win.loadURL(startUrl(store));
    }
    win.once("ready-to-show", () => win.show());
    return win;
  }

  app.whenReady().then(() => {
    Menu.setApplicationMenu(null); // 移除默认菜单栏(File/Edit/View…),包壳应用不需要
    if (!isDev) handleProtocol(OUT_DIR);
    createWindow();
    tray = setupTray(app, () => win, ICON_PATH);

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
