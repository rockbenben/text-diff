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
