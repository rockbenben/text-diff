const { Tray, Menu, nativeImage } = require("electron");

// 设置托盘图标,并把窗口关闭按钮改写为隐藏到托盘。
// getWin 返回当前 BrowserWindow(可能为 null)。
function setupTray(app, getWin, iconPath) {
  app.isQuitting = false;

  const tray = new Tray(nativeImage.createFromPath(iconPath));
  tray.setToolTip("TextDiff");

  const show = () => {
    const w = getWin();
    if (w) {
      w.show();
      w.focus();
    }
  };

  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "显示窗口", click: show },
      { type: "separator" },
      { label: "退出", click: () => { app.isQuitting = true; app.quit(); } },
    ])
  );
  tray.on("click", show);

  const w = getWin();
  if (w) {
    w.on("close", (e) => {
      if (!app.isQuitting) {
        e.preventDefault();
        w.hide();
      }
    });
  }
  return tray;
}

module.exports = { setupTray };
