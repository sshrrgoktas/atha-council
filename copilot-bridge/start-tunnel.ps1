$ErrorActionPreference="Stop"
Set-Location $PSScriptRoot
if (-not (Get-Command cloudflared -ErrorAction SilentlyContinue)) {
  Write-Host "cloudflared bulunamadi. Resmi Cloudflare Tunnel aracini kur:" -ForegroundColor Yellow
  Write-Host "winget install Cloudflare.cloudflared"
  Write-Host "Kurulumdan sonra terminali yeniden ac."
  exit 1
}
Write-Host "Atha Copilot test tuneli baslatiliyor. Bu adres GECICIDIR ve internetten erisilebilir." -ForegroundColor Cyan
Write-Host "Yalnizca imzali kopru istekleri Copilot'a erisebilir. Adresi guvenilir ortam disinda paylasma." -ForegroundColor Yellow
Write-Host "Olusan https://...trycloudflare.com adresini Cloudflare'daki COPILOT_BRIDGE_URL secret alanina ekle."
Write-Host "Atha Council Worker'in mevcut adi degismis olabilir; canli Worker'i sec."
Write-Host "Tunel veya PC kapanirsa baglanti kesilir. Bu test duzeni kalici hosting degildir."
& cloudflared tunnel --url http://127.0.0.1:8789
