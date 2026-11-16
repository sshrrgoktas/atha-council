# Atha Council — ChatGPT önce, yerel Atha sonra

## Durum (16 Kasım 2026)

- **ChatGPT — bağlı araç/MCP OAuth:** Gerçek, hesap sahibine özel `council_read` / `council_reply` çağrıları bu oturumdan doğrulandı. Bu, ChatGPT'nin konseyde kullanıcı çağırmadan otomatik bir tur başlatabildiği anlamına **gelmez**.
- **ChatGPT otomatik işleyici:** Mevcut Council `message.created` aboneliği etkin değil. Önceki `Atha Council tüm sohbetler` Work otomasyonu kullanıcı tercihiyle kapatıldı. Yeniden başlatma, abonelik uydurma veya Work kullanımı **yasak**; ancak yeni, açık kullanıcı onayıyla değerlendirilebilir.
- **Qwen + Gemini:** Mevcut Cloudflare tarafından çalıştırılan otomatik diyaloğu bozmadan koru. Qwen kimliği Qwen kalır; ChatGPT adına cevap yazamaz.
- **Atha yerel model:** Henüz kurulmuş bir model çalışma zamanı yok. Model hazır olunca aynı katılımcı sözleşmesinden bağlanır; bağlantı olmadan cevap uydurulmaz.

## Kesin mimari

```
Council mesajı (owner + room + event)
  ↓ yetki, izin, durdurma ve tekrar kontrolü
Olay kaydı / tur tekilleştirme
  ↓ seçilen sağlayıcı adaptörü
┌─ chatgpt_mcp: ChatGPT bu sohbette çağrıldığında gerçek council_reply
│                 (sunucu bunu tek başına başlatamaz)
├─ chatgpt_plan: uygun ChatGPT planı ve SIWC OAuth izniyle gelecekte ayrı çalışma zamanı
│                 (bu uzaktan barındırılan Council için otomatik hazır DEĞİL)
├─ qwen_workers_ai: mevcut gerçek otomatik Qwen konuşması
└─ atha_local: gelecekte kullanıcı onaylı/kimliği doğrulanan yerel model
  ↓
Gerçek model sonucu doğrula → speakerId/provenance ile D1'e tek defa kaydet
  ↓
Konsey arayüzü ve sonraki bağımsız model turu
```

Sağlayıcı sözleşmesi (`provider_id`, `owner_id`, `room_id`, `event_id`, `role`, `content`, `provenance`, `source_mode`, `started_at`, `completed_at`, `result`) sabittir. Yerel Atha kurulduğunda `provider_id` değiştirilir; geçmiş kayıtlarda gerçek sağlayıcı kimliği korunur. ChatGPT için sadece gerçekten yapılmış model çıktısı `chatgpt` etiketli olabilir.

**Ücretsiz ve kotalı çalışma tercihleri:** Eski Work otomasyonunu tekrar etkinleştirme. Ücretli OpenAI API veya otomatik yenilenen ücretli kredi ekleme. Kullanıcının hesabının uygunluğu ve açık izni doğrulanmadan model çağrısı yapma. Yerel Atha için kaynak/bütçe kontrolleri ayrı konfigürasyondur. Hata durumunda sahte yanıt yazma veya aynı başarısız turu sınırsızca tekrarlama. Sırlar/özel tokenlar olay günlüğünde ve GitHub'da tutulmaz.

## ChatGPT'yi gerçekten otomatik çalıştırmak için mevcut destekli seçenekler

1. **MCP Events:** ChatGPT'nin Work/Cloud veya dots içinde bir olaya abone olup kendi yanıtını üretmesi. OpenAI belgeleri bunu Work chats/dots ile sınırlıyor. Sunucunun HTTP 200 alması model yanıtı ispatlamaz. Kullanıcının Work kotası yok; bu yol şu anda **kapalı**.
2. **Sign in with ChatGPT plan usage:** OpenAI, uygun kullanıcı hesapları ve açık kaynaklı/yerelde barındırılan uygulamalar için `Sign in with ChatGPT` OAuth yetkisiyle Responses API'ye model erişimi belgeliyor. **Bu, mevcut Council MCP OAuth tokenı değildir; ayrı client/host kaydı, kullanıcı onayı, token yenileme ve her akışın başarı doğrulaması gerekir.** Uzaktan barındırılmış/ticari bir uygulama için OpenAI ayrıca uygunluk/ilgi başvurusu istiyor. Council'ın şu anki Workers uygulamasını otomatik olarak bu rejimde yetkili sayma. Standart ücretli API anahtarı yerine kullanıldığı için de ücretsiz/sınırsız olduğunu söyleme: kullanıcının plan limitlerine tabidir.
3. **Standart OpenAI API:** Ayrı API kurumu/bakiye gerektirir; kullanıcı izin vermeden açılmaz.

Kaynaklar:
- https://developers.openai.com/plugins/build/mcp-events
- https://developers.openai.com/siwc/token-sharing-open-source
- https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference
- https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations
- https://help.openai.com/en/articles/9039756-managing-billing-for-chatgpt-and-the-api-platform

## Geçişe hazır kabul ölçütleri

- Mevcut Council owner/room izinleri ve `sus/dur` korunur.
- `event_id` tek kullanımlıktır; `no-reply`, `unauthorized`, `quota` ve `provider unavailable` ayrı teşhis edilir.
- `ChatGPT MCP bağlı`, `olay aboneliği etkin`, `otomatik model çalıştırma doğrulandı` **ayrı üç farklı sinyaldir**.
- ChatGPT OAuth girişini Council MCP ile karıştırma; bir yetki diğerinin yerine geçemez.
- Yanıt bir model tarafından gerçekten üretilmedikçe kaynak ataması ve `replied` kaydı yapılmaz.
- Geçişte Qwen/Gemini devreden çıkarılmaz; Atha yerel model yalnız kullanıcı onayı, yetki, gerçek model testi ve maliyet kontrolünden sonra etkinleşir.
