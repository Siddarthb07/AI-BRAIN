# Expose JARVIS on the internet (HTTPS) so another laptop / phone can test.
# Requires: backend on :8002, frontend on :3000 (already running locally).
#
# Usage (from repo root):
#   powershell -ExecutionPolicy Bypass -File .\scripts\expose-public.ps1
#
# Same Wi-Fi only (no tunnel):
#   powershell -ExecutionPolicy Bypass -File .\scripts\expose-public.ps1 -LanOnly

param(
  [switch]$LanOnly,
  [int]$FrontendPort = 3000,
  [int]$BackendPort = 8002
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

function Get-LanIPv4 {
  try {
    $ip = Get-NetIPAddress -AddressFamily IPv4 |
      Where-Object {
        $_.IPAddress -notlike "127.*" -and
        $_.IPAddress -notlike "169.254.*" -and
        $_.PrefixOrigin -ne "WellKnown"
      } |
      Sort-Object -Property InterfaceMetric |
      Select-Object -First 1 -ExpandProperty IPAddress
    return $ip
  } catch {
    return $null
  }
}

$lan = Get-LanIPv4

Write-Host ""
Write-Host "=================================================="
Write-Host "  JARVIS — share with another device"
Write-Host "=================================================="
Write-Host ""

if ($LanOnly) {
  if (-not $lan) {
    Write-Host "[ERROR] Could not detect LAN IP. Check Wi-Fi."
    exit 1
  }
  Write-Host "[LAN] Same Wi-Fi only (HTTP — camera/mic may be blocked off-localhost)."
  Write-Host ""
  Write-Host "  On this PC:     http://localhost:$FrontendPort"
  Write-Host "  On other device: http://${lan}:$FrontendPort"
  Write-Host ""
  Write-Host "Make sure you started:"
  Write-Host "  Backend:  uvicorn with --host 0.0.0.0 --port $BackendPort"
  Write-Host "  Frontend: npm run dev -- -H 0.0.0.0 -p $FrontendPort"
  Write-Host "  And PUBLIC_MODE=1 in .env (optional; same-origin /backend proxy usually enough)"
  Write-Host ""
  exit 0
}

# Ensure PUBLIC_MODE for any direct API hits
$envFile = Join-Path $Root ".env"
if (Test-Path $envFile) {
  $raw = Get-Content $envFile -Raw
  if ($raw -notmatch "(?m)^PUBLIC_MODE=") {
    Add-Content $envFile "`nPUBLIC_MODE=1"
    Write-Host "[INFO] Added PUBLIC_MODE=1 to .env"
  } elseif ($raw -match "(?m)^PUBLIC_MODE=0") {
    $raw = $raw -replace "(?m)^PUBLIC_MODE=0", "PUBLIC_MODE=1"
    Set-Content $envFile $raw -NoNewline
    Write-Host "[INFO] Set PUBLIC_MODE=1 in .env (restart backend if it was already running)"
  }
}

Write-Host "[INFO] Starting Cloudflare quick tunnel → http://127.0.0.1:$FrontendPort"
Write-Host "[INFO] Keep this window open. Share the https://*.trycloudflare.com URL."
Write-Host "[INFO] Camera + mic need HTTPS — this tunnel provides it."
Write-Host ""
Write-Host "Prereqs on THIS machine (already running):"
Write-Host "  1) Backend :8002"
Write-Host "  2) Frontend :$FrontendPort  (API via /backend proxy)"
if ($lan) {
  Write-Host ""
  Write-Host "Same Wi-Fi fallback (no tunnel): http://${lan}:$FrontendPort"
}
Write-Host ""
Write-Host "--------------------------------------------------"
Write-Host ""

# Prefer cloudflared if installed; else npx
$cloudflared = Get-Command cloudflared -ErrorAction SilentlyContinue
if ($cloudflared) {
  & cloudflared tunnel --url "http://127.0.0.1:$FrontendPort"
} else {
  Write-Host "[INFO] cloudflared not in PATH — using npx (first run may download)..."
  npx --yes cloudflared tunnel --url "http://127.0.0.1:$FrontendPort"
}
