# Atha Council — GitHub Copilot SDK, Windows köprüsü

Durum: Kod ve çevrimdışı güvenlik testleri hazırlanıyor. Gerçek Copilot model cevabı henüz doğrulanmadı. Copilot Free kotası ile denemek için tasarlandı; yeni ücretli API gerekmiyor.

## Nasıl çalışıyor?

Atha Council Worker, mevcut GitHub OAuth oturumunu kullanarak HTTPS üzerinden imzalı isteği Windows'taki Node.js 22+ köprüsüne gönderir. SDK kullanıcının Copilot hakkını kullanır. Standart Cloudflare Workers alt süreç çalıştıramadığı için Windows açık olmalıdır; bu **kalıcı sunucu değil, ücretsiz test düzenidir**.

### İki PowerShell penceresinde başlat

1. GitHub deposunu Windows'a indir, copilot-bridge klasörünü aç. Node.js 22.12+ kurulu olmalı. Cloudflare'in resmî cloudflared programı da gereklidir; kurulu değilse winget install Cloudflare.cloudflared komutunu çalıştır.
2. Birinci PowerShell'de copilot-bridge klasörüne gel ve .\start-bridge.ps1 çalıştır. Windows betik engeline takılırsan yalnızca o pencere için Set-ExecutionPolicy -Scope Process Bypass kullanabilirsin. Betik SDK'yı ilk seferinde indirir, uzun gizli anahtar üretip .local/bridge-secret.txt dosyasında saklar ve 127.0.0.1:8789 portunu açar.
3. İkinci PowerShell'de yine copilot-bridge klasörüne gelip .\start-tunnel.ps1 çalıştır. Geçici https://...trycloudflare.com URL'sini kopyala.
4. Cloudflare panelinde Atha Council'in **canlı Worker** kaynak ayarlarından Secrets and Variables alanına COPILOT_BRIDGE_URL değerini adım 3'teki HTTPS URL yap. COPILOT_BRIDGE_SECRET değerini ise birinci adımda yerelde üretilen .local/bridge-secret.txt içeriğiyle aynı yap (secret olarak!). Uygulamanın teknik Worker adı geçiş sürecinde değişebilir, doğru Worker'ı seç. Bu anahtarı sohbete veya GitHub'a ASLA yapıştırma. İstersen .\start-bridge.ps1 -CopySecret anahtarı panoya kopyalar ve ikinci sunucu başlatmadan çıkar.
5. Atha Council'e kendi GitHub OAuth hesabınla gir. Sadece tek bir @copilot test mesajı gönder. Gerçek SDK yanıtı olmadan bağlantı tamamlandı sayılmaz.
6. Test bitince iki terminali kapat. Windows kapanırsa veya geçici tünel durursa Copilot tekrar çevrimdışı olur; yeniden çalıştırırken URL değişebileceğinden Cloudflare COPILOT_BRIDGE_URL alanı da güncellenir.

### Güvenlik

- Köprü yalnızca 127.0.0.1 adresinde dinler. Geçici Cloudflare tünelinin adresi internete açıktır; bu yüzden yalnızca test amaçlı kullan.
- Cloudflare Worker'dan gelen istekler SHA-256 HMAC, 90 saniyelik zaman penceresi ve tek kullanımlık nonce ile doğrulanır. Devre dışı/değişmiş imzalı istekler reddedilir.
- SDK hesabın adına OAuth tokenıyla çalışır; ortamda başka oturumlara düşmez (useLoggedInUser:false). mode:empty, availableTools:[] ve izin reddi; herhangi bir repo yazma ya da komut çalıştırma yetkisi yoktur.
- Ücretli API anahtarı veya kullanım aşımı açılmaz; Copilot Free kotası dolmuşsa yanıt verilmeyebilir.
- Hata halinde token ve mesajlar loglara yazılmaz. /health, sadece sunucunun açık olduğunu gösterir; modelin bağlı olduğunu göstermez.
- Mevcut APK yeniden kurulmaz ve sohbet verileri taşınmaz; web arayüzünün hazır Copilot endpoint'i kullanılır.

### Test / hata durumları

npm test komutu gerçek model çağrısı yapmadan güvenlik ve Türkçe UTF-8 iletimini kontrol eder. 401 hatası imza veya OAuth oturum sorunu, 502 SDK/kota/runtime sorunu, 503 ise Worker secret bağlantısının eksikliği olabilir.

Resmî dokümantasyon: https://docs.github.com/en/copilot/how-tos/copilot-sdk/setup/github-oauth
Geçici tünel: https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/
