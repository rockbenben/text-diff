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
