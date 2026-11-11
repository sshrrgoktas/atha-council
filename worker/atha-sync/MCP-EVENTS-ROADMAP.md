# Atha Council — olay tabanlı katılım köprüsü

**Durum:** Hazırlık PR'ı. Bu değişiklik tek başına ChatGPT'yi kendi kendine çalıştırmaz. Kullanıcının özel bulut eşitlemesi çalışmaya devam eder.

## Hazır olan
- Kullanıcı bir kez özel oda eşitleme izni verir; mesajları her seferinde tekrar onaylatmayız.
- Yeni **insan** mesajı uygulamadan D1'e eşitlenince aynı istek içinde bir `pending` olay kaydı oluşur.
- İlk eşitleme geçmiş konuşmaları tekrar oynatmaz.
- Gemini / Atha / Copilot cevaplarının kendileri yeni çağrı tetiklemez, böylece sonsuz karşılıklı yanıt döngüsü oluşmaz.
- Aynı oda sürümü tekrar gönderilirse aynı olay bir daha yazılmaz; kullanıcı odasını sildiğinde olayları da silinir.
- Kayda yalnızca kimlik, oda kimliği ve zaman yazılır; mesaj metni zaten sahip sınırındaki oda kaydında kalır.

## Etkinleştirme kontrol listesi
1. `worker/atha-sync/events.sql` şemasını aynı `ATHA_SYNC_DB` veritabanına **bir kez** uygula; tablo kurulmadan yeni Worker sürümünü dağıtma.
2. `test/atha-private-sync.test.mjs`, diğer mevcut testler ve Android doğrulaması geçsin.
3. Değişikliği önce önizleme Worker'ında ve ayrı test odasında dene. Canlıya geçişte mevcut OAuth, sırlar, D1 ve sohbet geçmişi korunur.
4. OpenAI'nin [MCP Events](https://developers.openai.com/plugins/build/mcp-events) sözleşmesine uygun, OAuth 2.1 ile kimliği doğrulayan özel MCP sunucusu kur. Kullanıcının izin verdiği odada `message.created` olayını destekle. `events/list`, `events/subscribe`, `events/unsubscribe`, imzalı webhook doğrulaması, kalıcı abonelik ve idempotent yanıt yazma gerekir.
5. Yalnızca ChatGPT'nin desteklenen Work/dot oturumunda kullanıcının açık abonelik onayından sonra `pending` kayıtları webhook ile ilet. Gönderimi doğrulanan olayları `delivered` yap, geçici hatalarda tekrar dene.
6. Modelin oluşturduğu gerçek yanıtın kaynağını karıştırmadan `atha_sync_replies` veya kaynak kimliği bulunan genişletilmiş ortak yanıt tablosuna yaz. Her olayda en fazla bir Atha yanıtı üret; kullanıcıya spam atma.

## Önemli sınırlar
- Normal ChatGPT sohbeti Cloudflare cron ile zorla uyandırılamaz; dış uygulama ChatGPT içindeki mevcut kullanıcı oturumunu devralamaz.
- MCP Events şu an ChatGPT Work ve desteklenen dot kullanımına bağlıdır; hesap erişimi kontrol edilmeden otomatik katılım vaat edilmez.
- Kullanıcı ücretli OpenAI API istemiyor: API anahtarı gerektiren çözümü varsayılan olarak açma.
- Bu olay kuyruğu **anında tetiklenir**, dolayısıyla dakikalık cron'a ihtiyaç duymaz; cron yalnızca gelecekteki webhook teslimatında başarısız işlemleri yeniden denemek için düşünülebilir.
- Her türlü callback URL'si SSRF için doğrulanmalı, abonelik anahtarları şifrelenmeli; doğrulanmış kullanıcı izni geri çekilince teslimat durmalı.

Önce ChatGPT Work özel MCP bağlantısı yetkisinin mevcut olup olmadığını kontrol et; yoksa bu taslağı güvenli şekilde beklemede tut. Yetkisiz veya sahte model adıyla mesaj gönderme.
