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
