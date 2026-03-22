param(
  [switch]$Deploy
)

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

function Read-EnvFile {
  param([string]$Path)

  if (!(Test-Path $Path)) {
    throw "找不到檔案: $Path"
  }

  $map = @{}
  Get-Content $Path | ForEach-Object {
    $line = $_.Trim()
    if (-not $line) { return }
    if ($line.StartsWith("#")) { return }
    $idx = $line.IndexOf("=")
    if ($idx -lt 1) { return }

    $key = $line.Substring(0, $idx).Trim()
    $value = $line.Substring($idx + 1).Trim()
    $map[$key] = $value
  }
  return $map
}

$localFile = ".env.local"
$config = Read-EnvFile -Path $localFile

if (-not $config.ContainsKey("SYNO_USERNAME") -or [string]::IsNullOrWhiteSpace($config["SYNO_USERNAME"])) {
  throw "缺少 SYNO_USERNAME，請先填寫 .env.local"
}
if (-not $config.ContainsKey("SYNO_PASSWORD") -or [string]::IsNullOrWhiteSpace($config["SYNO_PASSWORD"])) {
  throw "缺少 SYNO_PASSWORD，請先填寫 .env.local"
}

if (Get-Command firebase -ErrorAction SilentlyContinue) {
  Write-Host "Firebase CLI 已找到，開始設定 secrets..."
} else {
  throw "找不到 firebase CLI，請先安裝並登入 (npm i -g firebase-tools; firebase login)"
}

$userTemp = Join-Path $PSScriptRoot ".tmp-syno-username.txt"
$passTemp = Join-Path $PSScriptRoot ".tmp-syno-password.txt"

try {
  Set-Content -Path $userTemp -Value $config["SYNO_USERNAME"] -Encoding UTF8 -NoNewline
  Set-Content -Path $passTemp -Value $config["SYNO_PASSWORD"] -Encoding UTF8 -NoNewline

  firebase functions:secrets:set SYNO_USERNAME --data-file $userTemp
  firebase functions:secrets:set SYNO_PASSWORD --data-file $passTemp

  $baseUrl = if ($config.ContainsKey("SYNO_BASE_URL")) { $config["SYNO_BASE_URL"] } else { "https://junchengstone.synology.me:5001" }
  $enableNasTest = if ($config.ContainsKey("ENABLE_NAS_TEST")) { $config["ENABLE_NAS_TEST"] } else { "1" }

  @"
SYNO_BASE_URL=$baseUrl
ENABLE_NAS_TEST=$enableNasTest
"@ | Set-Content -Path ".env" -Encoding UTF8

  Write-Host "已完成："
  Write-Host "- Secret: SYNO_USERNAME"
  Write-Host "- Secret: SYNO_PASSWORD"
  Write-Host "- .env: SYNO_BASE_URL / ENABLE_NAS_TEST"

  if ($Deploy) {
    Write-Host "開始部署 functions..."
    firebase deploy --only functions
  } else {
    Write-Host "如需部署，請執行: firebase deploy --only functions"
  }
}
finally {
  if (Test-Path $userTemp) { Remove-Item $userTemp -Force }
  if (Test-Path $passTemp) { Remove-Item $passTemp -Force }
}
