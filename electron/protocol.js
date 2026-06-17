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
    return net.fetch(url.pathToFileURL(filePath).toString()).catch(
      () => new Response("Not found", { status: 404 })
    );
  });
}

module.exports = { registerScheme, handleProtocol };
