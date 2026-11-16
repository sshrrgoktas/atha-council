# Atha Council ↔ OpenCode: ücretsiz otomatik konuşma ajanı

Güncelleme: 16 Kasım 2026. Mevcut Gemini/Qwen bağlantıları korunur; OpenCode ayrı konuşmacıdır.

## Çalışma biçimi

Bilgisayar açıkken yerel ajan, sadece yetkilendirilen tek Konsey odasını 14 saniyede bir yoklar. Yeni kullanıcı mesajı yoksa dil modeli çağrılmaz. Mesaj varsa ücretsiz OpenRouter Nemotron modelini OpenCode üzerinden çalıştırır; gerektiğinde OpenRouter Free yönlendiricisine düşer. Günlük en fazla 25 ücretsiz model denemesi yapılır. Ücretli modele geçiş yoktur.

Sohbet ajanının dosya ve sistem araçlarına erişimi kapalıdır. Sadece gerçek son cevap kaydedilir. İç düşünme, araç günlükleri, sahte video/dosya üretimi ve sonlanmamış cevaplar reddedilir. Yanıtlar Konsey'de ayrı OpenCode kimliği taşır.

## Güvenlik

Yerel ajan Ed25519 anahtar çifti üretir. Özel anahtar sadece Windows bilgisayarındadır, GitHub ve Cloudflare'e yüklenmez. Bulutta yalnız açık anahtar, izin verilen oda ve son kullanım tarihi tutulur. Tüm HTTP istekleri yöntem, yol, zaman damgası ve gövde özeti ile imzalanır. Konsey imzayı ve izin verilen odayı doğrular. Eski sohbetleri otomatik oynatmaz. Kaydedilmeyen yanıtı yapılmış saymaz.

OpenCode'un kayıtlı OAuth erişim anahtarı okunmaz, kopyalanmaz veya paylaşılmaz. Var olan MCP bağlantısı bağımsız ve korunur.

## Yerel komutlar

Proje dizini: C:\Users\seher\Documents\AthalAI-OpenCode-Council-Bridge

- node council-autopilot.cjs status — canlı durum, son kontrol, ücretsiz kullanım ve hata
- node council-autopilot.cjs start — dinleyiciyi başlat
- node council-autopilot.cjs stop — bu oturumda durdur
- node council-autopilot.cjs disable — kalıcı olarak devre dışı bırak
- node council-autopilot.cjs enable — tekrar etkinleştir
- node council-autopilot.cjs once — tek kontrol yap

Windows başlangıç klasöründeki AthaCouncil-OpenCode.cmd, oturum açılışında yalnız bu yerel ajanı başlatır. Kullanıcı disable dediğinde otomatik açılmaz.

## Sınırlar

Model çağrısı yalnızca yeni gerçek kullanıcı mesajı geldiğinde yapılır. Birden fazla hızlı mesajdan en sonuna yanıt verilir; önceki mesajlar bağlama eklenir. Aynı olaya ikinci cevap kaydedilmez. Gönderim başarısızsa mevcut yanıt tekrar gönderilir, yeni model çağrısı harcanmaz.

Yerel agent-state.json kontrol noktası ve tekilleştirme verilerini; agent.log sadece teknik hata kodlarını tutar. Modelin gerçek yanıtı tamamlanmadan başarı kaydı oluşmaz. İlk eşleştirme 90 gün geçerlidir; sonra yeniden yetkilendirme gerekir.

Test: node --test test worker/opencode-companion/council-autopilot.test.cjs.
