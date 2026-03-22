$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

$envFile = ""
if (Test-Path ".env.local") {
  $envFile = ".env.local"
} elseif (Test-Path ".env.local.example") {
  $envFile = ".env.local.example"
}

if (-not $envFile) {
  Write-Output "找不到 .env.local 或 .env.local.example"
  exit 1
}

$map = @{}
foreach ($rawLine in Get-Content $envFile) {
  $line = $rawLine.Trim()
  if (-not $line) { continue }
  if ($line.StartsWith("#")) { continue }

  $idx = $line.IndexOf("=")
  if ($idx -lt 1) { continue }

  $key = $line.Substring(0, $idx).Trim()
  $value = $line.Substring($idx + 1).Trim()
  $map[$key] = $value
}

$base = "https://junchengstone.synology.me:5001"
if ($map.ContainsKey("SYNO_BASE_URL") -and $map["SYNO_BASE_URL"]) {
  $base = $map["SYNO_BASE_URL"]
}

$user = ""
$pass = ""
if ($map.ContainsKey("SYNO_USERNAME")) { $user = $map["SYNO_USERNAME"] }
if ($map.ContainsKey("SYNO_PASSWORD")) { $pass = $map["SYNO_PASSWORD"] }

if (-not $user -or -not $pass) {
  Write-Output "檔案 $envFile 缺少 SYNO_USERNAME 或 SYNO_PASSWORD"
  exit 1
}

Add-Type -AssemblyName System.Web
$encodedUser = [System.Web.HttpUtility]::UrlEncode($user)
$encodedPass = [System.Web.HttpUtility]::UrlEncode($pass)

$loginBuilder = New-Object System.UriBuilder("$base/webapi/auth.cgi")
$loginQuery = [System.Web.HttpUtility]::ParseQueryString([string]::Empty)
$loginQuery["api"] = "SYNO.API.Auth"
$loginQuery["version"] = "6"
$loginQuery["method"] = "login"
$loginQuery["account"] = $encodedUser
$loginQuery["passwd"] = $encodedPass
$loginQuery["session"] = "FileStation"
$loginQuery["format"] = "sid"
$loginBuilder.Query = $loginQuery.ToString()
$loginUrl = $loginBuilder.Uri.AbsoluteUri

try {
  $resp = Invoke-RestMethod -Method Get -Uri $loginUrl -TimeoutSec 20

  if ($resp.success -and $resp.data.sid) {
    Write-Output "帳密驗證成功（來源: $envFile）"

    $sid = $resp.data.sid
    $logoutBuilder = New-Object System.UriBuilder("$base/webapi/auth.cgi")
    $logoutQuery = [System.Web.HttpUtility]::ParseQueryString([string]::Empty)
    $logoutQuery["api"] = "SYNO.API.Auth"
    $logoutQuery["version"] = "6"
    $logoutQuery["method"] = "logout"
    $logoutQuery["session"] = "FileStation"
    $logoutQuery["_sid"] = $sid
    $logoutBuilder.Query = $logoutQuery.ToString()
    $logoutUrl = $logoutBuilder.Uri.AbsoluteUri
    try {
      Invoke-RestMethod -Method Get -Uri $logoutUrl -TimeoutSec 20 | Out-Null
    } catch {
    }

    exit 0
  }

  $errorCode = "unknown"
  if ($resp.error -and $resp.error.code) {
    $errorCode = $resp.error.code
  }

  Write-Output "帳密驗證失敗（來源: $envFile，錯誤碼: $errorCode）"
  exit 2
}
catch {
  Write-Output "連線或驗證失敗: $($_.Exception.Message)"
  exit 3
}
