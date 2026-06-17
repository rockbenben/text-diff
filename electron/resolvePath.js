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
