# Electron 桌面版 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将本仓库的 Next.js 16 静态导出站点打包为可在内网完整离线运行的 Windows portable `.exe`,用 Electron(自带 Chromium)替代依赖系统 WebView2 的 Tauri 方案。

**Architecture:** Web 源码零改动。新增一个 `electron/` 主进程层:注册自定义 `app://` 标准协议,把请求映射到打包进 `resources/out` 的静态导出文件(无扩展名路径回退 `<p>.html` → `<p>/index.html` → `404.html`)。主进程旁路实现语言记忆、窗口状态、单实例、系统托盘。纯逻辑(路径解析、locale 解析、状态存储)抽成无 electron 依赖的模块,用 `node --test` 做 TDD;electron 运行时行为用手动运行验证。

**Tech Stack:** Electron、electron-builder(target `portable`)、Node 内置 `node:test`、GitHub Actions。

## Global Constraints

- 目标平台:**仅 Windows**;产出**单个 portable `.exe`**,免安装、免管理员、**不带自动更新**。
- **不修改** Web 应用源码(`src/`、`messages/`、`next.config.ts`、`scripts/buildWithLang.js`)。
- 静态导出为 `trailingSlash: false`:页面是扁平文件(`en.html`、`zh.html`、`index.html`),资源为绝对路径 `/_next/...`。
- 自定义协议 host 固定为 `app://local/`。
- 语言集合(共 18 个,顺序保证 `zh-hant` 在 `zh` 之前匹配不冲突):`ar bn de en es fr hi id it ja ko pt ru th tr vi zh-hant zh`。
- 纯逻辑模块**不得 `require("electron")`**(否则 `node --test` 无法在普通 Node 下运行)。electron API 只在 `protocol.js`、`tray.js`、`main.js` 中引用。
- 包管理器:`yarn`(仓库已用 `yarn@1.22.22`)。
- 关闭窗口按钮 = 最小化到托盘;仅托盘菜单「退出」真正结束进程。
- 应用/托盘图标来源:`public/logo.png`(已确认 512×512)。

---

### Task 1: 项目接线 + 纯路径解析器(TDD)

**Files:**
- Modify: `package.json`(新增 devDeps、`main`、scripts)
- Create: `scripts/electron-dev.js`
- Create: `electron/constants.js`
- Create: `electron/resolvePath.js`
- Test: `electron/resolvePath.test.js`

**Interfaces:**
- Produces:
  - `electron/constants.js` → `{ SCHEME: "app", LOCALES: string[] }`
  - `resolveAssetPath(outDir: string, pathname: string, exists: (p: string) => boolean): string` —— 返回应当返回给浏览器的磁盘文件绝对路径。

- [ ] **Step 1: 安装 Electron 工具链**

Run:
```bash
yarn add -D electron electron-builder
```
Expected: `package.json` 的 `devDependencies` 出现 `electron`、`electron-builder`;`yarn.lock` 更新。

- [ ] **Step 2: 写 `package.json` 接线**

在 `package.json` 顶层加入 `"main"`(与 `"license"` 同级),并在 `scripts` 中新增 4 条:
```json
{
  "main": "electron/main.js",
  "scripts": {
    "electron": "electron .",
    "electron:dev": "node scripts/electron-dev.js",
    "electron:build": "next build && electron-builder --win portable",
    "test:electron": "node --test electron"
  }
}
```
(保留现有 `dev`/`build`/`build:lang`/`start`/`lint`/`outdated` 不变。)

- [ ] **Step 3: 写 dev 启动脚本**

Create `scripts/electron-dev.js`:
```js
// 以 ELECTRON_DEV=1 启动 electron,指向 `next dev`(localhost:3000)。
// 用 node 脚本设置环境变量,避免引入 cross-env 依赖(贴合内网最小依赖)。
process.env.ELECTRON_DEV = "1";
const { spawn } = require("child_process");
const electron = require("electron"); // 在普通 node 下 require 返回 electron 可执行文件路径
spawn(electron, ["."], { stdio: "inherit" }).on("close", (code) => process.exit(code ?? 0));
```

- [ ] **Step 4: 写常量模块**

Create `electron/constants.js`:
```js
// 无 electron 依赖,可被 node --test 直接加载。
const SCHEME = "app";
// 顺序无关紧要(用 includes 精确匹配),但与 messages/ 下的语言一一对应。
const LOCALES = ["ar", "bn", "de", "en", "es", "fr", "hi", "id", "it", "ja", "ko", "pt", "ru", "th", "tr", "vi", "zh-hant", "zh"];
module.exports = { SCHEME, LOCALES };
```

- [ ] **Step 5: 写失败的测试**

Create `electron/resolvePath.test.js`:
```js
const { test } = require("node:test");
const assert = require("node:assert");
const path = require("path");
const { resolveAssetPath } = require("./resolvePath");

const OUT = path.join("C:", "out");
const j = (...p) => path.join(OUT, ...p);

test("根路径映射到 index.html", () => {
  assert.strictEqual(resolveAssetPath(OUT, "/", () => true), j("index.html"));
});

test("干净 locale 路径回退到 <path>.html", () => {
  const exists = (p) => p === j("zh.html");
  assert.strictEqual(resolveAssetPath(OUT, "/zh", exists), j("zh.html"));
});

test("zh-hant 不被误匹配为 zh", () => {
  const exists = (p) => p === j("zh-hant.html");
  assert.strictEqual(resolveAssetPath(OUT, "/zh-hant", exists), j("zh-hant.html"));
});

test("带扩展名的资源直接返回", () => {
  const exists = (p) => p === j("_next", "static", "x.js");
  assert.strictEqual(resolveAssetPath(OUT, "/_next/static/x.js", exists), j("_next", "static", "x.js"));
});

test("无扩展名且无 .html 时回退到目录 index.html", () => {
  const exists = (p) => p === j("foo", "index.html");
  assert.strictEqual(resolveAssetPath(OUT, "/foo", exists), j("foo", "index.html"));
});

test("完全找不到时回退到 404.html", () => {
  assert.strictEqual(resolveAssetPath(OUT, "/nope", () => false), j("404.html"));
});

test("阻止路径穿越", () => {
  const result = resolveAssetPath(OUT, "/../../secret", () => false);
  assert.ok(result.startsWith(OUT), "解析结果必须仍在 OUT 目录内");
});
```

- [ ] **Step 6: 运行测试确认失败**

Run: `yarn test:electron`
Expected: FAIL —— `Cannot find module './resolvePath'`。

- [ ] **Step 7: 写最小实现**

Create `electron/resolvePath.js`:
```js
const path = require("path");

// 纯函数:把请求 pathname 解析为 outDir 内的磁盘文件路径。
// exists 被注入,便于在不接触真实文件系统的情况下做单元测试。
function resolveAssetPath(outDir, pathname, exists) {
  let rel = decodeURIComponent(pathname).replace(/^\/+/, "");
  if (rel === "") rel = "index.html";

  // 归一化并阻止路径穿越(去掉开头的 ../ 序列)。
  const safe = path.normalize(rel).replace(/^(\.\.[\\/])+/, "");
  let candidate = path.join(outDir, safe);

  const hasExt = path.extname(safe) !== "";
  if (!hasExt) {
    const asHtml = path.join(outDir, safe + ".html");
    const asIndex = path.join(outDir, safe, "index.html");
    if (exists(asHtml)) candidate = asHtml;
    else if (exists(asIndex)) candidate = asIndex;
    else candidate = path.join(outDir, "404.html");
  } else if (!exists(candidate)) {
    candidate = path.join(outDir, "404.html");
  }
  return candidate;
}

module.exports = { resolveAssetPath };
```

- [ ] **Step 8: 运行测试确认通过**

Run: `yarn test:electron`
Expected: PASS —— 7 个测试全部通过。

- [ ] **Step 9: 提交**

```bash
git add package.json yarn.lock scripts/electron-dev.js electron/constants.js electron/resolvePath.js electron/resolvePath.test.js
git commit -m "feat(electron): 接线 electron 工具链与静态资源路径解析器"
```

---

### Task 2: 状态存储模块(TDD)

**Files:**
- Create: `electron/store.js`
- Test: `electron/store.test.js`

**Interfaces:**
- Produces: `createStore(dir: string, filename?: string): { get(key, fallback), set(key, value) }` —— 在 `dir/filename`(默认 `app-state.json`)读写 JSON;读失败或写失败均不抛异常。

- [ ] **Step 1: 写失败的测试**

Create `electron/store.test.js`:
```js
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { createStore } = require("./store");

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "store-"));
}

test("未设置时返回 fallback", () => {
  const s = createStore(tmp());
  assert.strictEqual(s.get("locale", "en"), "en");
});

test("跨实例持久化", () => {
  const dir = tmp();
  createStore(dir).set("locale", "zh");
  assert.strictEqual(createStore(dir).get("locale", "en"), "zh");
});

test("损坏的 JSON 不抛异常,回退到 fallback", () => {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, "app-state.json"), "{ not json");
  assert.strictEqual(createStore(dir).get("locale", "en"), "en");
});

test("存储对象类型的值", () => {
  const dir = tmp();
  createStore(dir).set("windowState", { width: 800, height: 600 });
  assert.deepStrictEqual(createStore(dir).get("windowState", {}), { width: 800, height: 600 });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `yarn test:electron`
Expected: FAIL —— `Cannot find module './store'`。

- [ ] **Step 3: 写实现**

Create `electron/store.js`:
```js
const fs = require("fs");
const path = require("path");

// 极简 JSON 存储。无第三方依赖,贴合内网离线最小依赖要求。
function createStore(dir, filename = "app-state.json") {
  const file = path.join(dir, filename);
  let data = {};
  try {
    data = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    data = {}; // 文件不存在或损坏 → 空状态
  }
  return {
    get(key, fallback) {
      return data[key] !== undefined ? data[key] : fallback;
    },
    set(key, value) {
      data[key] = value;
      try {
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(file, JSON.stringify(data, null, 2));
      } catch {
        // 只读环境写失败不致命,忽略。
      }
    },
  };
}

module.exports = { createStore };
```

- [ ] **Step 4: 运行测试确认通过**

Run: `yarn test:electron`
Expected: PASS —— 新增 4 个测试通过(连同 Task 1 共 11 个)。

- [ ] **Step 5: 提交**

```bash
git add electron/store.js electron/store.test.js
git commit -m "feat(electron): 增加 userData 下的 JSON 状态存储"
```

---

### Task 3: 协议 + 主进程窗口 + 单实例

> 本任务产出可启动的应用骨架。Electron 运行时行为用手动运行验证(无法在普通 node 下单测)。

**Files:**
- Create: `electron/protocol.js`
- Create: `electron/main.js`

**Interfaces:**
- Consumes: `resolveAssetPath`(Task 1)、`SCHEME`(Task 1 常量)、`createStore`(Task 2)。
- Produces:
  - `electron/protocol.js` → `registerScheme(): void`(app ready 前调用)、`handleProtocol(outDir: string): void`(app ready 后调用)。
  - `electron/main.js` → electron 入口;导出无。后续任务会向其中**插入**对 `trackLocale`/`createWindowStateKeeper`/`setupTray` 的调用(已预留位置注释)。

- [ ] **Step 1: 写协议模块**

Create `electron/protocol.js`:
```js
const { protocol, net } = require("electron");
const fs = require("fs");
const url = require("url");
const { SCHEME } = require("./constants");
const { resolveAssetPath } = require("./resolvePath");

// 必须在 app 'ready' 之前调用。
function registerScheme() {
  protocol.registerSchemesAsPrivileged([
    { scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true } },
  ]);
}

// 必须在 app 'ready' 之后调用。
function handleProtocol(outDir) {
  protocol.handle(SCHEME, (request) => {
    const { pathname } = new URL(request.url);
    const filePath = resolveAssetPath(outDir, pathname, fs.existsSync);
    // net.fetch 读取 file:// URL 并自动推断 Content-Type。
    return net.fetch(url.pathToFileURL(filePath).toString());
  });
}

module.exports = { registerScheme, handleProtocol };
```

- [ ] **Step 2: 写主进程**

Create `electron/main.js`:
```js
const { app, BrowserWindow } = require("electron");
const path = require("path");
const { SCHEME } = require("./constants");
const { registerScheme, handleProtocol } = require("./protocol");
const { createStore } = require("./store");

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

  app.on("second-instance", () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      if (!win.isVisible()) win.show();
      win.focus();
    }
  });

  function createWindow() {
    win = new BrowserWindow({
      width: 1200,
      height: 800,
      show: false,
      webPreferences: { contextIsolation: true, nodeIntegration: false },
    });

    // <-- WINDOW-STATE-HOOK (Task 5):windowState.track(win)
    // <-- LOCALE-HOOK (Task 4):trackLocale(win, store)

    if (isDev) {
      win.loadURL("http://localhost:3000");
    } else {
      win.loadURL(`${SCHEME}://local/`); // <-- START-URL-HOOK (Task 4):换成 startUrl(store)
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
```

- [ ] **Step 3: 构建静态导出**

Run: `yarn build`
Expected: 生成/更新 `out/`(含 `index.html`、`en.html`、`zh.html`、`_next/`、`404.html`)。

- [ ] **Step 4: 手动验证 —— 协议加载**

Run: `yarn electron`
Expected:
- 窗口打开,显示 text-diff 界面(非白屏)。
- 在 DevTools(`Ctrl+Shift+I`)Console 无 `Failed to load /_next/...` 之类的资源加载错误。
- 输入两段文本能正常 diff。

若白屏:用 DevTools 检查失败请求的 URL,核对 `resolveAssetPath` 回退逻辑。

- [ ] **Step 5: 手动验证 —— 单实例**

保持应用开着,再次 Run: `yarn electron`
Expected: 不出现第二个窗口;已有窗口被聚焦。关闭应用。

- [ ] **Step 6: 提交**

```bash
git add electron/protocol.js electron/main.js
git commit -m "feat(electron): app:// 协议加载静态导出 + 单实例窗口"
```

---

### Task 4: 语言记忆

**Files:**
- Create: `electron/locale.js`
- Test: `electron/locale.test.js`
- Modify: `electron/main.js`(替换 START-URL-HOOK、LOCALE-HOOK 注释处)

**Interfaces:**
- Consumes: `LOCALES`、`SCHEME`(常量)、`store`(Task 2)。
- Produces:
  - `startUrl(store): string` —— 返回 `app://local/<记住的 locale>`(无记录则 `app://local/`)。
  - `parseLocale(urlString: string): string | null` —— 从 URL 解析首段 locale,匹配 `LOCALES` 才返回。
  - `trackLocale(win, store): void` —— 监听 `did-navigate`,把当前 locale 写入 store。

- [ ] **Step 1: 写失败的测试**

Create `electron/locale.test.js`:
```js
const { test } = require("node:test");
const assert = require("node:assert");
const { startUrl, parseLocale } = require("./locale");

const fakeStore = (val) => ({ get: (_k, fb) => (val !== undefined ? val : fb), set() {} });

test("无记录时 startUrl 为根", () => {
  assert.strictEqual(startUrl(fakeStore(undefined)), "app://local/");
});

test("有记录时 startUrl 带 locale", () => {
  assert.strictEqual(startUrl(fakeStore("zh")), "app://local/zh");
});

test("parseLocale 识别 .html 页面", () => {
  assert.strictEqual(parseLocale("app://local/zh.html"), "zh");
});

test("parseLocale 识别干净路径", () => {
  assert.strictEqual(parseLocale("app://local/ja"), "ja");
});

test("parseLocale 正确区分 zh-hant 与 zh", () => {
  assert.strictEqual(parseLocale("app://local/zh-hant"), "zh-hant");
});

test("parseLocale 对非 locale 返回 null", () => {
  assert.strictEqual(parseLocale("app://local/_next/static/x.js"), null);
  assert.strictEqual(parseLocale("app://local/"), null);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `yarn test:electron`
Expected: FAIL —— `Cannot find module './locale'`。

- [ ] **Step 3: 写实现**

Create `electron/locale.js`:
```js
const { SCHEME, LOCALES } = require("./constants");

// 不 require("electron"):win 由调用方传入,便于单测 parseLocale/startUrl。
function startUrl(store) {
  const locale = store.get("locale", "");
  return `${SCHEME}://local/${locale}`;
}

function parseLocale(urlString) {
  try {
    const { pathname } = new URL(urlString);
    const seg = pathname.replace(/^\/+/, "").split("/")[0].replace(/\.html$/, "");
    return LOCALES.includes(seg) ? seg : null;
  } catch {
    return null;
  }
}

function trackLocale(win, store) {
  win.webContents.on("did-navigate", (_e, navUrl) => {
    const loc = parseLocale(navUrl);
    if (loc) store.set("locale", loc);
  });
}

module.exports = { startUrl, parseLocale, trackLocale };
```

- [ ] **Step 4: 运行测试确认通过**

Run: `yarn test:electron`
Expected: PASS —— 新增 6 个测试通过。

- [ ] **Step 5: 接入 main.js**

在 `electron/main.js` 顶部 require 区加入:
```js
const { startUrl, trackLocale } = require("./locale");
```
把 `createWindow` 内的 LOCALE-HOOK 注释行替换为实际调用(在 `win` 创建之后、`loadURL` 之前):
```js
    trackLocale(win, store);
```
把 START-URL-HOOK 那行的 `win.loadURL(\`${SCHEME}://local/\`);` 替换为:
```js
      win.loadURL(startUrl(store));
```

- [ ] **Step 6: 手动验证**

Run: `yarn electron`
- 在应用内把语言切到中文(或任一非默认语言)。
- 关闭应用,再 Run: `yarn electron`。
Expected: 重新打开时直接是上次选择的语言。

- [ ] **Step 7: 提交**

```bash
git add electron/locale.js electron/locale.test.js electron/main.js
git commit -m "feat(electron): 跨启动记住界面语言"
```

---

### Task 5: 窗口状态记忆

**Files:**
- Create: `electron/window-state.js`
- Modify: `electron/main.js`(WINDOW-STATE-HOOK 处 + 用 `saved` 初始化窗口尺寸)

**Interfaces:**
- Consumes: `store`(Task 2)。
- Produces: `createWindowStateKeeper(store): { saved: { width, height, x?, y?, maximized? }, track(win): void }`。
  - `saved` 用于初始化 BrowserWindow;`track` 绑定 resize/move/close 保存,并在恢复时按需 maximize。

- [ ] **Step 1: 写实现**

Create `electron/window-state.js`:
```js
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
```

- [ ] **Step 2: 接入 main.js**

顶部 require 区加入:
```js
const { createWindowStateKeeper } = require("./window-state");
```
在 `const store = createStore(...)` 之后加入:
```js
  const windowState = createWindowStateKeeper(store);
```
把 `createWindow` 中的 `BrowserWindow` 构造改为使用 `windowState.saved`:
```js
    const s = windowState.saved;
    win = new BrowserWindow({
      width: s.width,
      height: s.height,
      x: s.x,
      y: s.y,
      show: false,
      webPreferences: { contextIsolation: true, nodeIntegration: false },
    });
```
把 WINDOW-STATE-HOOK 注释行替换为(在 `trackLocale` 调用附近):
```js
    windowState.track(win);
```

- [ ] **Step 3: 手动验证**

Run: `yarn electron`
- 调整窗口大小并移动位置,关闭。
- 再 Run: `yarn electron`。Expected: 恢复上次大小与位置。
- 最大化窗口,关闭;再启动。Expected: 以最大化状态打开。

- [ ] **Step 4: 提交**

```bash
git add electron/window-state.js electron/main.js
git commit -m "feat(electron): 记住窗口大小/位置/最大化状态"
```

---

### Task 6: 应用/托盘图标资源

**Files:**
- Create: `build/icon.png`(从 `public/logo.png` 复制,512×512)

**Interfaces:**
- Produces: `build/icon.png` —— electron-builder 的 `win.icon` 与托盘 `nativeImage` 共用。

- [ ] **Step 1: 复制图标**

Run:
```bash
mkdir -p build && cp public/logo.png build/icon.png
```

- [ ] **Step 2: 验证尺寸 ≥ 256(electron-builder Windows 要求)**

Run:
```bash
node -e "const b=require('fs').readFileSync('build/icon.png');console.log(b.readUInt32BE(16)+'x'+b.readUInt32BE(20))"
```
Expected: `512x512`(≥256 即可)。

- [ ] **Step 3: 提交**

```bash
git add build/icon.png
git commit -m "build(electron): 增加应用/托盘图标"
```

---

### Task 7: 系统托盘 + 关闭即最小化到托盘

**Files:**
- Create: `electron/tray.js`
- Modify: `electron/main.js`(TRAY-HOOK 处 + 计算 ICON_PATH)

**Interfaces:**
- Consumes: `app`、当前窗口 getter、图标路径。
- Produces: `setupTray(app, getWin: () => BrowserWindow|null, iconPath: string): Tray`。
  - 设置 `app.isQuitting` 标志;托盘菜单含「显示窗口 / 退出」;拦截窗口 `close` 改为 `hide()`(除非 `app.isQuitting`)。

- [ ] **Step 1: 写实现**

Create `electron/tray.js`:
```js
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
```

- [ ] **Step 2: 接入 main.js**

顶部 require 区加入:
```js
const { setupTray } = require("./tray");
```
在 `OUT_DIR` 定义之后加入图标路径(打包后 `build/icon.png` 经 extraResources 落到 `resources/icon.png`,见 Task 8):
```js
const ICON_PATH = app.isPackaged
  ? path.join(process.resourcesPath, "icon.png")
  : path.join(__dirname, "..", "build", "icon.png");
```
把 `app.whenReady().then(...)` 中的 TRAY-HOOK 注释行替换为(在 `createWindow()` 之后):
```js
    setupTray(app, () => win, ICON_PATH);
```
保留 `tray` 引用避免被 GC:在 `let win = null;` 旁加入 `let tray = null;`,并把上一行改为 `tray = setupTray(app, () => win, ICON_PATH);`。

- [ ] **Step 3: 手动验证**

Run: `yarn electron`
- 任务栏托盘区出现图标。
- 点窗口关闭按钮 → 窗口隐藏,进程仍在(托盘图标还在)。
- 点托盘图标 / 托盘菜单「显示窗口」→ 窗口恢复。
- 托盘菜单「退出」→ 进程结束(托盘图标消失)。

- [ ] **Step 4: 提交**

```bash
git add electron/tray.js electron/main.js
git commit -m "feat(electron): 系统托盘与关闭即最小化到托盘"
```

---

### Task 8: electron-builder 打包为 portable exe

**Files:**
- Create: `electron-builder.yml`
- Modify: `.gitignore`(忽略 `dist-electron/`)

**Interfaces:**
- Consumes: `out/`(`yarn build` 产物)、`build/icon.png`、`electron/**`。
- Produces: `dist-electron/TextDiff-<version>-portable.exe`。

- [ ] **Step 1: 写打包配置**

Create `electron-builder.yml`:
```yaml
appId: top.newzone.textdiff
productName: TextDiff
directories:
  output: dist-electron
files:
  - electron/**
  - package.json
extraResources:
  - from: out
    to: out
  - from: build/icon.png
    to: icon.png
win:
  target: portable
  icon: build/icon.png
portable:
  artifactName: TextDiff-${version}-portable.exe
```

- [ ] **Step 2: 忽略构建输出**

在 `.gitignore` 追加一行:
```
dist-electron/
```

- [ ] **Step 3: 打包**

Run: `yarn electron:build`
Expected: 先 `next build` 生成 `out/`,再由 electron-builder 产出 `dist-electron/TextDiff-3.0.0-portable.exe`(版本号取自 `package.json` 的 `3.0.0`)。

- [ ] **Step 4: 手动验证产物**

双击运行 `dist-electron/TextDiff-3.0.0-portable.exe`(理想情况下在一台未装 WebView2 的干净 Windows 机器/VM 上):
- 应用启动无白屏,text-diff 可用。
- 语言、窗口状态在重启后被记住。
- 单实例、托盘、关闭到托盘均正常。

- [ ] **Step 5: 提交**

```bash
git add electron-builder.yml .gitignore
git commit -m "build(electron): electron-builder 打包 portable exe 配置"
```

---

### Task 9: GitHub Actions CI

**Files:**
- Create: `.github/workflows/electron.yml`

**Interfaces:**
- Consumes: 仓库源码 + `electron:build` 脚本。
- Produces: workflow artifact `TextDiff-portable`(含 `.exe`);打 tag 时附到 GitHub Release。

- [ ] **Step 1: 写 workflow**

Create `.github/workflows/electron.yml`:
```yaml
name: Build Electron (Windows portable)

on:
  push:
    tags:
      - "v*"
  workflow_dispatch:

jobs:
  build:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: yarn

      - name: Install dependencies
        run: yarn install --frozen-lockfile

      - name: Run electron unit tests
        run: yarn test:electron

      - name: Build portable exe
        run: yarn electron:build

      - name: Upload artifact
        uses: actions/upload-artifact@v4
        with:
          name: TextDiff-portable
          path: dist-electron/*.exe

      - name: Publish release on tag
        if: startsWith(github.ref, 'refs/tags/v')
        uses: softprops/action-gh-release@v2
        with:
          files: dist-electron/*.exe
```

- [ ] **Step 2: 验证 workflow 语法**

Run: `node -e "require('fs').readFileSync('.github/workflows/electron.yml','utf8')"` 确认文件存在;并目视检查缩进(YAML 对缩进敏感)。
(如本机装有 `act` 可选地本地试跑;否则推送后在 GitHub Actions 页面用 `workflow_dispatch` 手动触发验证。)

- [ ] **Step 3: 提交**

```bash
git add .github/workflows/electron.yml
git commit -m "ci(electron): GitHub Actions 构建 Windows portable exe"
```

- [ ] **Step 4: 推送分支并手动触发验证**

```bash
git push -u origin feat/electron-desktop
```
然后在 GitHub Actions 页面对 `feat/electron-desktop` 运行 `workflow_dispatch`,确认绿勾且 artifact 中有 `.exe`。

---

## Self-Review

**Spec 覆盖核对:**
- 自定义 `app://` 协议加载 → Task 3 ✓
- 无扩展名回退 `<p>.html`→`<p>/index.html`→`404.html` → Task 1(`resolveAssetPath`)✓
- 语言记忆(startUrl + did-navigate)→ Task 4 ✓
- 窗口状态记忆 → Task 5 ✓
- 单实例 → Task 3 ✓
- 系统托盘 + 关闭到托盘 → Task 7 ✓
- store.js 纯手写无依赖 → Task 2 ✓
- 开发模式 `ELECTRON_DEV=1` → Task 1(脚本)+ Task 3(main 分支)✓
- portable 单 exe / extraResources out / 不带更新 → Task 8 ✓
- GitHub Actions CI → Task 9 ✓
- 图标来自 `public/logo.png` → Task 6 ✓
- Web 源码零改动 → 所有任务仅新增 `electron/`、`build/`、`scripts/electron-dev.js`、配置与 CI;`package.json` 仅加 `main`/scripts/devDeps,不改 Web 逻辑 ✓

**占位符扫描:** 无 TBD/TODO;所有代码步骤含完整代码。

**类型/命名一致性核对:**
- `SCHEME`/`LOCALES` 来自 `electron/constants.js`,被 `resolvePath`(未用)、`protocol`、`locale` 一致引用。
- `resolveAssetPath(outDir, pathname, exists)` 签名:定义于 Task 1,调用于 Task 3 `handleProtocol`(传 `fs.existsSync`)——一致。
- `createStore(dir)` 定义 Task 2,调用 Task 3——一致。
- `startUrl(store)`/`trackLocale(win, store)` 定义 Task 4,接入 Task 4 Step 5——一致。
- `createWindowStateKeeper(store)` 返回 `{ saved, track }`,Task 5 接入一致。
- `setupTray(app, getWin, iconPath)` 定义 Task 7,接入一致;`ICON_PATH` 在 main 中定义。
- main.js 的 HOOK 注释(LOCALE/START-URL/WINDOW-STATE/TRAY)在 Task 3 预留,分别于 Task 4/5/7 替换——无悬空引用。

无遗留问题。
