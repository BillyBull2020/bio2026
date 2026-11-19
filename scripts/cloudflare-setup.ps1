$ErrorActionPreference = "Stop"
$cf = "C:\Program Files (x86)\cloudflared\cloudflared.exe"
$cert = Join-Path $env:USERPROFILE ".cloudflared\cert.pem"
$root = Split-Path $PSScriptRoot -Parent
$log = Join-Path $root "cf-deploy.log"

function Write-Log([string]$message) {
    $line = "$(Get-Date -Format o) $message"
    Add-Content -Path $log -Value $line -Encoding utf8
}

Write-Log "waiting for Cloudflare authorization (cert.pem)"
for ($i = 0; $i -lt 300; $i++) {
    if (Test-Path $cert) { break }
    Start-Sleep -Seconds 2
}
if (-not (Test-Path $cert)) {
    Write-Log "timed out waiting for cert.pem"
    exit 1
}
Write-Log "authorization found"

$create = & $cf tunnel create biodynamx-os 2>&1
Write-Log ($create -join "`n")
$id = ([regex]::Match(($create -join "`n"), '([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})')).Groups[1].Value

if (-not $id) {
    $list = & $cf tunnel list 2>&1
    Write-Log ($list -join "`n")
    $line = ($list -split "`n") | Where-Object { $_ -match "biodynamx-os" } | Select-Object -First 1
    $id = ([regex]::Match($line, '([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})')).Groups[1].Value
}
if (-not $id) {
    Write-Log "could not determine tunnel id"
    exit 1
}
Write-Log "tunnel id $id"

$route = & $cf tunnel route dns biodynamx-os os.biodynamx.com 2>&1
Write-Log ($route -join "`n")

$config = @"
tunnel: $id
credentials-file: $env:USERPROFILE\.cloudflared\$id.json
ingress:
  - hostname: os.biodynamx.com
    service: http://127.0.0.1:4177
  - service: http_status:404
"@
$configPath = Join-Path $env:USERPROFILE ".cloudflared\config.yml"
[IO.File]::WriteAllText($configPath, $config, [Text.UTF8Encoding]::new($false))
Write-Log "config written to $configPath"

$run = Start-Process -FilePath $cf `
    -ArgumentList "tunnel", "--config", $configPath, "run", "biodynamx-os" `
    -PassThru -WindowStyle Hidden `
    -RedirectStandardOutput (Join-Path $root "cf-run.out.log") `
    -RedirectStandardError (Join-Path $root "cf-run.err.log")
Write-Log "tunnel process $($run.Id)"

Start-Sleep -Seconds 6
for ($i = 0; $i -lt 10; $i++) {
    try {
        $r = Invoke-WebRequest "https://os.biodynamx.com/api/health" -UseBasicParsing -TimeoutSec 20
        Write-Log "health $($r.StatusCode) $($r.Content)"
        break
    } catch {
        Write-Log "health attempt $($i + 1) failed: $($_.Exception.Message)"
        Start-Sleep -Seconds 4
    }
}
