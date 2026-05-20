$token = gcloud auth print-access-token 2>$null
if (-not $token) { Write-Host "No gcloud token"; exit 1 }

$body = @"
{"structuredQuery":{"from":[{"collectionId":"Orders"}],"where":{"fieldFilter":{"field":{"fieldPath":"`訂單號碼`"},"op":"EQUAL","value":{"stringValue":"27381"}}},"limit":1}}
"@

$uri = "https://firestore.googleapis.com/v1/projects/jh-stone/databases/(default)/documents:runQuery"
$headers = @{ Authorization = "Bearer $token" }

try {
  $bodyBytes = [System.Text.Encoding]::UTF8.GetBytes($body)
  $resp = Invoke-RestMethod -Uri $uri -Method POST -Headers $headers -ContentType "application/json; charset=utf-8" -Body $bodyBytes
} catch {
  Write-Host "Error: $($_.Exception.Message)"
  # Try reading the response
  $reader = [System.IO.StreamReader]::new($_.Exception.Response.GetResponseStream())
  Write-Host $reader.ReadToEnd()
  exit 1
}

if (-not $resp -or -not $resp[0].document) {
  Write-Host "NOT FOUND"
  exit 0
}

$doc = $resp[0].document
$f = $doc.fields
Write-Host "id: $($doc.name)"
Write-Host "顏色: $($f.'顏色'.stringValue)"
Write-Host "客戶名稱: $($f.'客戶名稱'.stringValue)"
Write-Host "安裝地點: $($f.'安裝地點'.stringValue)"
Write-Host "地址: $($f.'地址'.stringValue)"

$kwValues = $f.searchKeywords.arrayValue.values
$kwCount = if ($kwValues) { $kwValues.Count } else { 0 }
Write-Host "searchKeywords count: $kwCount"

if ($kwValues) {
  $kwArr = $kwValues | ForEach-Object { $_.stringValue }
  Write-Host "has 中壢: $($kwArr -contains '中壢')"
  Write-Host "has cl-803: $($kwArr -contains 'cl-803')"
  Write-Host "has 精淦: $($kwArr -contains '精淦')"
  Write-Host "has 精淦809bet: $($kwArr -contains '精淦809bet')"
}
