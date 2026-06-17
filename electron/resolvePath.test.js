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
