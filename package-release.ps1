# package-release.ps1
# Crea un .zip pronto per essere caricato su una GitHub Release.
#
# Cosa fa:
#   1. Legge la versione da plugin/manifest.json
#   2. Verifica che il build sia stato fatto (esistono main.js + manifest.json nel TestVault)
#   3. Crea cartella temporanea 'release-temp/antinomia/' con i 3 file (main.js, manifest.json, styles.css se esiste)
#   4. Comprime in 'releases/antinomia-vX.X.X.zip'
#   5. Allega anche BETA-INSTALL.md come istruzioni
#
# Uso:
#   .\package-release.ps1
#
# Pre-requisito: aver eseguito `npm run build` prima.

$ErrorActionPreference = "Stop"

# Posizione assoluta dello script (root del progetto)
$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Definition
Set-Location $projectRoot

Write-Host "=== Antinomia release packager ===" -ForegroundColor Cyan
Write-Host "Project root: $projectRoot"
Write-Host ""

# --- 1) Leggi versione da manifest ---
$manifestPath = Join-Path $projectRoot "plugin\manifest.json"
if (-not (Test-Path $manifestPath)) {
    Write-Host "ERRORE: manifest.json non trovato in plugin/" -ForegroundColor Red
    exit 1
}
$manifest = Get-Content $manifestPath -Raw | ConvertFrom-Json
$version = $manifest.version
$pluginId = $manifest.id
Write-Host "Plugin id: $pluginId"
Write-Host "Version:   $version"
Write-Host ""

# --- 2) Verifica artefatti del build ---
$buildDir = Join-Path $projectRoot "TestVault\.obsidian\plugins\antinomia"
$builtMain = Join-Path $buildDir "main.js"
$builtManifest = Join-Path $buildDir "manifest.json"

if (-not (Test-Path $builtMain)) {
    Write-Host "ERRORE: main.js non trovato in $buildDir" -ForegroundColor Red
    Write-Host "Esegui prima: cd plugin; npm run build" -ForegroundColor Yellow
    exit 1
}
if (-not (Test-Path $builtManifest)) {
    Write-Host "ERRORE: manifest.json non trovato in $buildDir" -ForegroundColor Red
    Write-Host "Esegui prima: cd plugin; npm run build" -ForegroundColor Yellow
    exit 1
}

# Verifica che il manifest buildato abbia la stessa versione del sorgente
$builtManifestObj = Get-Content $builtManifest -Raw | ConvertFrom-Json
if ($builtManifestObj.version -ne $version) {
    Write-Host "ATTENZIONE: versione build ($($builtManifestObj.version)) != versione sorgente ($version)." -ForegroundColor Yellow
    Write-Host "Rifai il build prima di pacchettizzare." -ForegroundColor Yellow
    exit 1
}

$mainSize = (Get-Item $builtMain).Length
Write-Host "main.js: $([math]::Round($mainSize/1KB, 1)) KB" -ForegroundColor Green
Write-Host ""

# --- 3) Prepara cartella temporanea ---
$tempDir = Join-Path $projectRoot "release-temp"
if (Test-Path $tempDir) {
    Remove-Item -Recurse -Force $tempDir
}
$pluginStaging = Join-Path $tempDir "antinomia"
New-Item -ItemType Directory -Path $pluginStaging | Out-Null

Copy-Item $builtMain $pluginStaging
Copy-Item $builtManifest $pluginStaging

# styles.css e' opzionale (se non c'e' lo saltiamo)
$stylesSrc = Join-Path $buildDir "styles.css"
if (Test-Path $stylesSrc) {
    Copy-Item $stylesSrc $pluginStaging
    Write-Host "styles.css incluso" -ForegroundColor Green
}

Write-Host "Staging pronto: $pluginStaging"

# --- 4) Crea cartella 'releases' se non esiste ---
$releasesDir = Join-Path $projectRoot "releases"
if (-not (Test-Path $releasesDir)) {
    New-Item -ItemType Directory -Path $releasesDir | Out-Null
}

# --- 5) Comprimi in zip ---
$zipName = "antinomia-v$version.zip"
$zipPath = Join-Path $releasesDir $zipName
if (Test-Path $zipPath) {
    Write-Host "Sovrascrivo zip esistente: $zipName" -ForegroundColor Yellow
    Remove-Item $zipPath
}

# Compress-Archive include la cartella 'antinomia/' come root, cosi' l'utente
# scompatta e ottiene direttamente antinomia/main.js
Compress-Archive -Path (Join-Path $tempDir "antinomia") -DestinationPath $zipPath -CompressionLevel Optimal

$zipSize = (Get-Item $zipPath).Length
Write-Host ""
Write-Host "Zip creato: $zipPath" -ForegroundColor Green
Write-Host "Dimensione: $([math]::Round($zipSize/1KB, 1)) KB"
Write-Host ""

# --- 6) Copia anche BETA-INSTALL.md accanto al zip per facilita' upload ---
$betaInstallSrc = Join-Path $projectRoot "BETA-INSTALL.md"
if (Test-Path $betaInstallSrc) {
    $betaInstallDst = Join-Path $releasesDir "BETA-INSTALL-v$version.md"
    Copy-Item $betaInstallSrc $betaInstallDst -Force
    Write-Host "Istruzioni copiate: $betaInstallDst" -ForegroundColor Green
}

# --- 7) Pulisci la cartella temporanea ---
Remove-Item -Recurse -Force $tempDir
Write-Host ""
Write-Host "=== Pacchettizzazione completata ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "Prossimi passi suggeriti:"
Write-Host "  1. Vai su GitHub -> tuo repo Antinomia -> Releases -> Draft a new release"
Write-Host "  2. Tag version: v$version"
Write-Host "  3. Release title: Antinomia v$version (beta)"
Write-Host "  4. Description: copia il CHANGELOG della versione + sezione 'Come installare'"
Write-Host "  5. Carica i 2 file da releases/:"
Write-Host "     - $zipName"
Write-Host "     - BETA-INSTALL-v$version.md"
Write-Host "  6. Spunta 'This is a pre-release' (cosi' i beta tester sanno che e' una beta)"
Write-Host "  7. Publish release"
Write-Host ""
