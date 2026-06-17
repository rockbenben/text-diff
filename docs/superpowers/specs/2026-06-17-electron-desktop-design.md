# Electron 桌面版设计文档

**日期**: 2026-06-17
**分支**: `feat/electron-desktop`(基于 `main`)
**目标**: 将 Next.js 16 静态导出站点打包为可在内网完整离线运行的 Windows 桌面应用,替代 Tauri 方案。

## 背景与动机

`feat/tauri-desktop` 分支基于 Tauri 实现桌面版,但 Tauri 依赖操作系统的 WebView2 运行时。内网/受限机器常常缺少 WebView2,导致应用无法启动(白屏/报错)。

Electron 自带 Chromium,不依赖任何系统 WebView 运行时,因此能在缺少 WebView2 的内网机器上稳定运行。本设计放弃 Tauri,从 `main` 重新开出 `feat/electron-desktop` 分支。

## 应用特征(已确认)

- 核心 text-diff 工具**完全客户端、可离线运行**。
- 唯一的网络引用是指向其他站点的外链(`src/app/components/projects.tsx`),离线时不可用但无害。
- 静态导出为 `trailingSlash: false`:页面是扁平文件(`en.html`、`zh.html`、`index.html`),资源使用绝对路径 `/_next/...`。
- 静态导出没有 middleware,根 `index.html` 每次启动都会重定向到默认语言。

## 范围(已确认)

**包含的桌面功能**:语言记忆、窗口状态记忆、单实例、系统托盘。
**打包方式**:portable 单 `.exe`,免安装、免管理员、**不带自动更新**。
**构建方式**:GitHub Actions CI 构建并产出 `.exe`(本地不作为主要构建路径)。

## 架构决策:加载方式

采用**自定义 `app://` 协议**(对比 `file://` 与本地 HTTP 服务器后选定):

- 在主进程注册标准/安全协议,用 `protocol.handle()` 把请求映射到打包进去的 `out/` 目录。
- 绝对资源路径 `/_next/...` 正常工作。
- 拥有稳定 origin → `localStorage` 可靠持久化(语言/主题记忆受益)。
- 行为等同真实 Web 服务器,规避 `file://` 的白屏陷阱(next-intl 静态导出经典问题)。

被否决的方案:
- `file://`:绝对资源路径解析到文件系统根目录 → 白屏;localStorage origin 不稳定 → 破坏语言记忆。
- 本地 HTTP 服务器:多依赖、需管理端口、内网可能触发防火墙弹窗,过度设计。

## 目录结构(全部为新增,不改动 Web 源码)

```
electron/
  main.js              主进程:协议、窗口、托盘、单例、状态恢复
  store.js             userData 下的 JSON 读写(locale + 窗口状态)
electron-builder.yml   打包配置(portable 单 exe)
build/
  icon.ico             应用/托盘图标(由现有 public/logo.png 生成)
.github/workflows/electron.yml   CI 构建
```

`src/`、`messages/`、`next.config.ts` **零改动**。所有桌面行为都在主进程旁路完成。

## 组件设计

### `electron/main.js`

- **单实例**:`app.requestSingleInstanceLock()`;未取得锁则退出,`second-instance` 事件中聚焦/恢复已有窗口。
- **协议注册**:ready 之前
  `protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } }])`。
- **协议处理**:ready 之后 `protocol.handle('app', handler)`:
  - 解析 `app://local/<path>`,`<path>` 去掉前导斜杠后相对 `OUT_DIR`(= `process.resourcesPath/out`,开发态为仓库 `out/`)解析。
  - `/` → `index.html`。
  - 无扩展名路径回退顺序:`<path>.html` → `<path>/index.html` → `404.html`。
  - 命中文件以流式 `Response` 返回,带正确 `Content-Type`。
- **窗口**:`BrowserWindow`,`webPreferences: { contextIsolation: true, nodeIntegration: false }`,**不需要 preload**(无 IPC 需求)。
- **语言记忆**:
  - 启动读取 store,`loadURL('app://local/' + (storedLocale || ''))`。
  - 监听 `webContents` 的 `did-navigate`,从 URL 解析 locale 段并写回 store。
- **窗口状态**:`resize`/`move`/`close` 时把 `bounds` 与 `maximized` 写入 store;启动时按 store 恢复(无记录则用默认尺寸)。
- **系统托盘**:`Tray` + 上下文菜单(显示窗口 / 退出);拦截窗口 `close` 改为 `hide()` 到托盘(由 `app.isQuitting` 标志区分真正退出),托盘点击恢复窗口。
- **开发模式**:`ELECTRON_DEV=1` 时 `loadURL('http://localhost:3000')` 配合 `next dev`;否则走 `app://` 协议。

### `electron/store.js`

- 路径:`app.getPath('userData')/app-state.json`。
- 字段:`{ locale, bounds, maximized }`。
- 纯手写读写(`fs.readFileSync`/`writeFileSync` + try/catch),不引第三方依赖,贴合内网离线要求。

## 打包(electron-builder)

`electron-builder.yml` 要点:

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
win:
  target: portable
  icon: build/icon.ico
portable:
  artifactName: TextDiff-${version}-portable.exe
```

- `out/` 以 `extraResources` 放进 `resources/out`(真实文件,协议处理器直接读)。
- 单个自包含 portable `.exe`,免安装、免管理员、自带 Chromium。

`package.json` 改动:

- 新增 devDep:`electron`、`electron-builder`。
- 新增 `"main": "electron/main.js"`(对 Next 构建无影响)。
- 新增脚本:
  - `electron:dev` —— 设 `ELECTRON_DEV=1` 启动 electron(配合另开的 `yarn dev`)。
  - `electron:build` —— `next build`(默认 export 静态导出)后 `electron-builder --win portable`。

## CI(`.github/workflows/electron.yml`)

- 触发:推送 `v*` tag 或 `workflow_dispatch`。
- `windows-latest` → `setup-node@v4`(Node 20)→ `yarn install --frozen-lockfile` → `yarn build`(静态导出,默认 export 模式)→ `electron-builder --win portable`。
- 上传 `dist-electron/*.exe` 为 workflow artifact;打 tag 时同时创建 GitHub Release 并附 `.exe`。

## 图标

由现有 `public/logo.png` 生成 256×256 的 `build/icon.ico`,同时用作应用图标与托盘图标。

## 交互确认

- 点窗口关闭按钮 = 最小化到托盘(不退出);仅托盘菜单「退出」真正结束进程。

## 非目标(YAGNI)

- 不做自动更新。
- 不做 NSIS 安装包。
- 不做 macOS / Linux 打包(内网目标为 Windows)。
- 不改动 Web 应用源码逻辑。

## 验证策略

- 本地:`yarn build` 后 `yarn electron:build`,运行产出的 portable `.exe`,验证:
  - 应用启动无白屏,text-diff 功能可用。
  - 切换语言后重启,语言被记住。
  - 调整/最大化窗口后重启,窗口状态被记住。
  - 二次启动聚焦已有窗口(单实例)。
  - 关闭按钮最小化到托盘,托盘菜单可恢复/退出。
- 在缺少 WebView2 的环境(或干净 Windows VM)中确认可直接运行。
