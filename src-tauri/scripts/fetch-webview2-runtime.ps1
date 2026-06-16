<#
.SYNOPSIS
  Download + extract the WebView2 *Fixed Version* runtime so the app bundles its
  own copy of WebView2 and runs fully offline (intranet / LTSC / Windows Server),
  with no internet install and no admin rights.

.DESCRIPTION
  tauri.conf.json -> bundle.windows.webviewInstallMode is set to:
      { "type": "fixedRuntime", "path": "./Microsoft.WebView2.FixedVersionRuntime.<Version>.x64/" }
  This script puts that folder in place next to tauri.conf.json (the src-tauri
  "core" folder). It is idempotent: if the folder already exists it does nothing.

  Microsoft does NOT publish a stable, version-independent direct download link
  for the fixed-version runtime (every version has its own GUID'd CDN URL, and
  only the latest two majors stay online). So you must paste the .cab URL once:

    1. Open https://developer.microsoft.com/microsoft-edge/webview2/#download-section
    2. Under "Fixed Version", pick the version, choose x64, right-click the
       download button -> "Copy link".
    3. Pass it as -CabUrl (locally) or set the WEBVIEW2_CAB_URL repo variable (CI).

  When you bump the runtime, update BOTH -Version here (or the WEBVIEW2_VERSION
  variable) AND the version in tauri.conf.json's path.

.EXAMPLE
  pwsh src-tauri/scripts/fetch-webview2-runtime.ps1 `
    -Version 149.0.4022.69 `
    -CabUrl  "https://msedge.sf.dl.delivery.mp.microsoft.com/.../Microsoft.WebView2.FixedVersionRuntime.149.0.4022.69.x64.cab"
#>
[CmdletBinding()]
param(
  [string]$Version = $env:WEBVIEW2_VERSION,
  [string]$CabUrl  = $env:WEBVIEW2_CAB_URL
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($Version)) {
  throw "No version. Pass -Version 149.0.4022.69 or set WEBVIEW2_VERSION. Must match tauri.conf.json's webviewInstallMode.path."
}

# src-tauri is the parent of this scripts/ folder.
$coreDir   = Split-Path -Parent $PSScriptRoot
$folderName = "Microsoft.WebView2.FixedVersionRuntime.$Version.x64"
$targetDir = Join-Path $coreDir $folderName

if (Test-Path (Join-Path $targetDir "msedgewebview2.exe")) {
  Write-Host "WebView2 fixed runtime $Version already present at $targetDir - skipping."
  exit 0
}

if ([string]::IsNullOrWhiteSpace($CabUrl)) {
  throw "Runtime folder missing and no -CabUrl / WEBVIEW2_CAB_URL given. See the header of this script for how to copy the .cab link from Microsoft."
}

$cabPath = Join-Path $coreDir "$folderName.cab"

Write-Host "Downloading WebView2 fixed runtime $Version ..."
# curl.exe ships with Windows 10/11 and Server; follows redirects, shows progress.
& curl.exe -L --fail --retry 3 -o $cabPath $CabUrl
if ($LASTEXITCODE -ne 0) { throw "Download failed (curl exit $LASTEXITCODE) from $CabUrl" }

Write-Host "Extracting to $coreDir ..."
# expand.exe ships with Windows; -F:* extracts all files preserving the
# Microsoft.WebView2.FixedVersionRuntime.<ver>.x64\ folder embedded in the cab.
& expand.exe $cabPath -F:* $coreDir | Out-Null
if ($LASTEXITCODE -ne 0) { throw "expand.exe failed (exit $LASTEXITCODE)" }

Remove-Item $cabPath -Force

if (-not (Test-Path (Join-Path $targetDir "msedgewebview2.exe"))) {
  throw "Extraction did not produce $targetDir\msedgewebview2.exe. Check that -Version matches the .cab contents."
}

Write-Host "Done: $targetDir"
