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
