/* eslint-disable @typescript-eslint/no-require-imports */
// Message-file parity gate.
//
// The app renders every locale from messages/{locale}.json. A locale that
// misses a key renders the bare "Namespace.key" text instead of the string,
// and a locale that renames an ICU placeholder throws at render time —
// neither shows up in a type check or a lint run, so both need a gate.
//
//   node scripts/checkMessages.js
//
// The judgments come from the same upstream test the sibling repos carry
// (web-tools-by-ai: src/app/lib/__tests__/localeKeyParity.test.ts):
//   1. every locale listed in src/i18n/routing.ts has a message file, and
//      every message file belongs to a listed locale;
//   2. every locale has exactly the same key set as the default locale —
//      no missing keys, no orphans left behind by a rename;
//   3. every locale keeps the same ICU placeholder set, so {version} in one
//      locale cannot become {ver} in another;
//   4. no locale carries an empty string, which would render as blank UI.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const messagesDir = path.join(root, "messages");

// The routing file is the single source of truth for the locale set.
const routingSource = fs.readFileSync(path.join(root, "src", "i18n", "routing.ts"), "utf8");
const localesMatch = routingSource.match(/locales:\s*\[([^\]]*)\]/);
assert(localesMatch, "locales array not found in src/i18n/routing.ts");
const locales = [...localesMatch[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
assert(locales.length > 0, "no locales found in src/i18n/routing.ts");

const defaultMatch = routingSource.match(/defaultLocale:\s*"([^"]+)"/);
assert(defaultMatch, "defaultLocale not found in src/i18n/routing.ts");
const defaultLocale = defaultMatch[1];

const flatten = (obj, prefix = "", out = {}) => {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) flatten(v, key, out);
    else out[key] = v;
  }
  return out;
};

// ICU argument names: both {name} and {name, plural/select, …} start with the
// same identifier.
const icuArgs = (value) => {
  const args = new Set();
  if (typeof value !== "string") return args;
  for (const m of value.matchAll(/\{\s*([a-zA-Z0-9_]+)\s*[,}]/g)) args.add(m[1]);
  return args;
};

const read = (locale) => {
  const file = path.join(messagesDir, `${locale}.json`);
  assert(fs.existsSync(file), `missing message file: messages/${locale}.json`);
  return flatten(JSON.parse(fs.readFileSync(file, "utf8")));
};

const onDisk = fs
  .readdirSync(messagesDir)
  .filter((f) => f.endsWith(".json"))
  .map((f) => f.replace(/\.json$/, ""));

const problems = [];

for (const locale of locales) {
  if (!onDisk.includes(locale)) problems.push(`messages/${locale}.json is missing but routing lists "${locale}"`);
}
for (const file of onDisk) {
  if (!locales.includes(file)) problems.push(`messages/${file}.json exists but routing does not list "${file}"`);
}

if (problems.length === 0) {
  const reference = read(defaultLocale);
  const referenceKeys = Object.keys(reference);

  for (const locale of locales.filter((l) => l !== defaultLocale)) {
    const data = read(locale);
    const keys = new Set(Object.keys(data));

    const missing = referenceKeys.filter((k) => !keys.has(k));
    const extra = [...keys].filter((k) => !(k in reference));
    if (missing.length) problems.push(`${locale}: missing ${missing.join(", ")}`);
    if (extra.length) problems.push(`${locale}: orphan ${extra.join(", ")}`);

    const mismatched = [];
    for (const key of referenceKeys) {
      if (!(key in data)) continue;
      const a = icuArgs(reference[key]);
      const b = icuArgs(data[key]);
      if (a.size !== b.size || [...a].some((x) => !b.has(x))) {
        mismatched.push(`${key} (${defaultLocale}: {${[...a].join(",")}} vs ${locale}: {${[...b].join(",")}})`);
      }
    }
    if (mismatched.length) problems.push(`${locale}: ICU placeholder mismatch — ${mismatched.join("; ")}`);

    const empties = Object.entries(data)
      .filter(([, v]) => typeof v === "string" && v.trim() === "")
      .map(([k]) => k);
    if (empties.length) problems.push(`${locale}: empty value ${empties.join(", ")}`);
  }
}

if (problems.length) {
  console.error("Message parity check failed:");
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}

console.log(`messages: ${locales.length} locales share the same key set as ${defaultLocale}`);
