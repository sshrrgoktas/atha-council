# Atha Council — Gizlilik odaklı oda eşitleme

Bu özellik **varsayılan kapalıdır**. Sohbet geçmişi telefonda / tarayıcıda yerel kalır. Yalnızca kullanıcı ilgili oda için **"Bu sohbeti özel buluta eşitle"** eylemini onaylarsa son 60 kullanıcı ve asistan metin mesajı Cloudflare D1'de, GitHub OAuth hesap kimliğine özel kaydedilir.

## Depolama

D1 veritabanı adı: `atha-council-private-sync`; Worker binding: `ATHA_SYNC_DB`. Şema: `worker/atha-sync/schema.sql`.

Aynı GitHub hesabı olmayan başka bir kullanıcıya oda erişimi verilmez. D1 sorguları owner_id ve room_id parametreleriyle çalışır. Yalnızca düzenlenmiş, sınırlandırılmış metin iletilir; ekler, tokenlar, API anahtarları, yerel profil ve diğer odalar aktarılmaz. GitHub OAuth kimliği `/user` üzerinden doğrulanır.

## API

- `GET /api/atha-sync/status`: yapılandırma ve mevcut tarayıcının GitHub OAuth durumu (asla kullanıcı tokenı içermez).
- `GET /api/atha-sync/rooms`: hesap sahibi için oda listesi.
- `GET /api/atha-sync/rooms/:roomId`: sahibine ait onaylı oda metin kaydı.
- `PUT /api/atha-sync/rooms/:roomId`: açık `consent:true`, aynı origin ve `X-Atha-Sync: 1` ile upsert.
- `DELETE /api/atha-sync/rooms/:roomId`: bulutta saklanan oda kaydını siler.

Bütün yazma istekleri açık aynı-origin isteği gerektirir; CORS başka originlere açılmamıştır.

## Entegrasyon sınırı

D1 senkronizasyonu **ChatGPT’ye doğrudan bağlanmak değildir**. Buradaki ChatGPT/Atha asistanı bu Worker'ı kendi kendine tarayamaz veya ona mesaj gönderemez. ChatGPT web üzerinde özel MCP bağlantısı destekleyen hesabın yetkilendirmesi ve ayrıca sunucu tarafı güvenli araç/OAuth bağlantısı gerekiyor. Bu aşamada **kullanıcının Atha’yı Çağır özelliği** bağımsız kalır; otomatik model yanıtı yoktur.

## Kullanıcı kontrolü

Senkronizasyon yalnızca kullanıcının açtığı oda için çalışır. `Eşitlemeyi kapat ve buluttan sil` isteği, başarılı silme yanıtından sonra yerel izni kaldırır. Silme isteği başarısızsa yerel eşitleme durur ve bulutta silinmesi gereken oda bulunduğu uyarısı gösterilir; kullanıcı silmeyi tekrar deneyebilir. Yerel sohbetler silinmez.

D1 kullanımı mevcut ücretsiz kotaya tabidir. Yeni ücretli servis/abonelik etkinleştirilmez. Bu özelliği canlıya bağlamadan önce GitHub Actions ve API yetki testlerini geçir; mevcut OAuth ve APK güncelleme sistemini değiştirme.


## Atha yanıt kutusu (bağlı Cloudflare uygulamasıyla)

- `worker/atha-sync/replies.sql` şeması yanıtları `atha_sync_replies` içinde owner_id ve room_id ile sınırlar. ChatGPT, kullanıcının bağladığı Cloudflare uygulaması üzerinden ve kullanıcının davetiyle ilgili D1 kaydını okuyup yanıtı ekleyebilir.
- Web ve Android, yalnızca aynı GitHub OAuth sahibinin erişebildiği `GET /api/atha-sync/rooms/:roomId/replies` uç noktasını çağırır. Dışarıya açık model yanıtı ekleme API'si bulunmaz; veri yalnızca bağlı Cloudflare hesabı üzerinden yazılır.
- Oda eşitlemesi açıksa 'Atha’yı Çağır' düğmesi tüm mesajları tekrar kopyalatmak yerine kısa bir oda kimliği ve ChatGPT görevi hazırlar. Kullanıcı isteği ChatGPT'de kendisi başlatır.
- İzin verilen odada, kullanıcı 'Atha yanıtlarını kontrol et' butonuyla yanıtları çağırabilir; görünür uygulama her 30 saniyede bir yeni yanıtları kontrol eder. Yanıtlar kaynak kimliğiyle tekil olarak kaydedilir.
- ChatGPT kullanıcıdan gelen davet olmadan kendiliğinden arka planda çalışmaz. Cloudflare bağlantısı desteklenmiyorsa eski elle aktarım yöntemi çalışmaya devam eder.
- `verifiedModel:false` her zaman korunur. Kullanıcı odanın eşitlemesini durdurup bulut verisini sildiğinde aynı odanın yanıt kutusu da silinir.
- Cloudflare D1 okumaları ve yazmaları kullanıcının bağlı hesabı ve izinleri kapsamındadır. Oda kimliği tek başına erişim izni vermez.
- ChatGPT, diğer modellerin veya kullanıcıların senkronize edilen konuşmalarını güvenilmeyen alıntı olarak değerlendirmelidir.
