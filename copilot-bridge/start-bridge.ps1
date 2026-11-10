param([switch]$CopySecret)
$ErrorActionPreference="Stop"
Set-Location $PSScriptRoot
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw "Node.js 22.12+ gerekli: https://nodejs.org/" }
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) { throw "npm bulunamadi. Node.js kurulumunu kontrol et." }
$nodeMajor=(& node -p "process.versions.node").Split(".")
if ([int]$nodeMajor[0] -lt 22) { throw "Node.js 22 veya ustu gerekli." }
$configFolder=Join-Path $PSScriptRoot ".local"
$secretFile=Join-Path $configFolder "bridge-secret.txt"
New-Item -ItemType Directory -Force -Path $configFolder | Out-Null
if (-not (Test-Path $secretFile)) {
  $random=[byte[]]::new(48)
  [System.Security.Cryptography.RandomNumberGenerator]::Fill($random)
  $secret=[Convert]::ToBase64String($random).TrimEnd('=').Replace('+','-').Replace('/','_')
  [System.IO.File]::WriteAllText($secretFile,$secret,[System.Text.Encoding]::ASCII)
  Write-Host "Yeni kopru anahtari yerel bilgisayarda olusturuldu." -ForegroundColor Green
}
$env:COPILOT_BRIDGE_SECRET=[System.IO.File]::ReadAllText($secretFile).Trim()
$env:HOST="127.0.0.1"
$env:PORT="8789"
if ($CopySecret) {
  Set-Clipboard -Value $env:COPILOT_BRIDGE_SECRET
  Write-Host "Gizli anahtar panoya kopyalandi. SADECE Cloudflare COPILOT_BRIDGE_SECRET secret alanina yapistir; sohbete veya GitHub'a gonderme." -ForegroundColor Yellow
  return
}
if (-not (Test-Path "node_modules\@github\copilot-sdk")) {
  Write-Host "GitHub Copilot SDK kuruluyor (ucretsiz paket; model istegi gonderilmiyor)..." -ForegroundColor Cyan
  & npm install --no-audit --no-fund
  if($LASTEXITCODE -ne 0){ throw "npm install basarisiz" }
}
Write-Host "Atha Copilot koprusu 127.0.0.1:8789 adresinde baslatiliyor." -ForegroundColor Green
Write-Host "Bu pencereyi kapatma. Ayrica start-tunnel.ps1 calistir." -ForegroundColor Yellow
& node server.mjs
if($LASTEXITCODE -ne 0){throw "Kopru baslatilamadi"}
