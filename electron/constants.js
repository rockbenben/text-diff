// 无 electron 依赖,可被 node --test 直接加载。
const SCHEME = "app";
// 顺序无关紧要(用 includes 精确匹配),但与 messages/ 下的语言一一对应。
const LOCALES = ["ar", "bn", "de", "en", "es", "fr", "hi", "id", "it", "ja", "ko", "pt", "ru", "th", "tr", "vi", "zh-hant", "zh"];
module.exports = { SCHEME, LOCALES };
