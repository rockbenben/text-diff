// 以 ELECTRON_DEV=1 启动 electron,指向 `next dev`(localhost:3000)。
// 用 node 脚本设置环境变量,避免引入 cross-env 依赖(贴合内网最小依赖)。
process.env.ELECTRON_DEV = "1";
const { spawn } = require("child_process");
const electron = require("electron"); // 在普通 node 下 require 返回 electron 可执行文件路径
spawn(electron, ["."], { stdio: "inherit" }).on("close", (code) => process.exit(code ?? 0));
