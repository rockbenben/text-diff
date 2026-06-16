/* eslint-disable @typescript-eslint/no-require-imports */
// Sync src-tauri/tauri.conf.json's version from the root package.json so the
// installed app version, bundle name, and updater all share one source of truth.
const fs = require("fs");
const path = require("path");

const packageJsonPath = path.resolve(__dirname, "../package.json");
const tauriConfigPath = path.resolve(__dirname, "tauri.conf.json");

const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
const tauriConfig = JSON.parse(fs.readFileSync(tauriConfigPath, "utf8"));

tauriConfig.version = packageJson.version;

fs.writeFileSync(tauriConfigPath, JSON.stringify(tauriConfig, null, 2) + "\n", "utf8");
console.log(`Updated tauri.conf.json version -> ${packageJson.version}`);
