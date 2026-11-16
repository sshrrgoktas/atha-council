# Atha Council ↔ OpenCode v2 — yerel MCP bağlantısı

> **16 Kasım 2026 – güncel:** OpenCode OAuth bağlantısı tamamlandı. Ayrı OpenCode yanıt kimliği, ücretsiz OpenRouter/Nemotron çalışma testi ve kullanıcı onaylı yerel otomatik dinleyici uygulandı. Dinleyici, 14 saniyede bir yalnızca imzalı olay kontrolü yapar; yeni mesaj yokken hiçbir modele istek göndermez. Özel Ed25519 anahtarı yalnız PC'de, açık anahtar D1'de yetkili oda kaydında bulunur. Windows oturum açılışına eklendi. Teknik ayrıntılar: worker/opencode-companion/README.md. Bu belgedeki eski 'henüz kurulmadı' ifadeleri ilk hazırlık aşamasına aittir.



**16 Kasım 2026** — Kullanıcının Windows bilgisayarında `opencode v2.0.32` doğrulandı. Sadece `C:\Users\seher\Documents\AthalAI-OpenCode-Council-Bridge\opencode.json` proje dosyası oluşturuldu. Global OpenCode yapılandırması, saklanmış sağlayıcı kimlikleri, anahtarlar ve diğer projeler değiştirilmedi. `opencode mcp list` ile `atha-council` **needs authentication**; mevcut Council OAuth sunucusu başlangıçta yalnız ChatGPT redirect'ine izin verdiği için yerel giriş daha tamamlanmadı.

## Kimlikler ve güvenlik sınırı

- Council OAuth, OpenCode'da `http://127.0.0.1:<ephemeral-port>/callback` türündeki yerel OAuth redirect'i için ayrı izin verir. **Sadece 127.0.0.1**, port 1024–65535 ve tam `/callback`. `localhost`, özel ağ IP'leri, query, fragment, şifre veya diğer harici domainler reddedilir. ChatGPT'nin eski sabit redirect'leri korunur.
- OAuth DCR istemcisi `opencode_` ile işaretlenir; ChatGPT `chatgpt_` ile kalır. PKCE S256, state, single-use authorization code, owner-only GitHub giriş ve açık onay korunur.
- OpenCode istemcisinin MCP araçları **şimdilik yalnız okuma**: `council_list_rooms`, `council_read`, `council_connection_status`. OpenCode `council_reply` çağırıp kendini ChatGPT gibi gösteremez, `events/subscribe` başlatamaz veya kullanıcı adına katılım ayarı değiştiremez.
- OpenCode'daki kayıtlı model sağlayıcıları (OpenAI, Copilot, Google, Workers AI, OpenRouter ve OpenCode Console) **yalnızca bağlı hesap listesi**. Ne kullanılabilir kota ne de ücretsiz model yanıtı doğrulandı. Bu kurulumda model inference çağrılmadı ve Work/Codex otomasyonu kapalı.
- OpenCode bir yerel model çalıştırıcı/aracı; tek başına GPT-6 değildir. Modeli ve gerçek sağlayıcısını ayrıca doğrulamadan ona `Atha/ChatGPT` kimliği verilmez. Yerel Atha hazır olunca ayrı adaptörle bağlanacak.

## Yerel OpenCode ile giriş testi

1. Bilgisayar açık ve OpenCode erişilebilir olmalı.
2. Sadece ayrı projenin kökünde (global değil): `opencode mcp list` → `atha-council needs authentication`.
3. `opencode mcp auth atha-council` → resmî Council sayfasına yönlenmeli, GitHub hesabını ve eşitlemesi açık odaları göstermeli. **Bu izni kullanıcı kendisi onaylar**. Tokenlar sohbet veya sunucu loglarına gönderilmez.
4. `opencode mcp list` → `atha-council connected` görünmeli.
5. OpenCode'da `council_read` ile yalnız yetkili odayı sorgula; yazma veya model çalıştırma testine geçme.
6. İzin onaylanmadıysa `needs authentication` olarak bırak. Bir hata varsa OAuth redirect / CSRF / PKCE / CSP yolunu gözden geçir; asla erişim atlatma.

## Modelden Council'a otomatik mesaj — ayrı faz

Henüz **kurulu değil**. Yapılacaklar: sahibin açık katılım izni, PC'de sadece loopback'ye bağlı OpenCode runtime; yetki doğrulayan, tekilleştiren ve modeli gerçekten çalıştıran yerel ajan; sağlayıcı/model kimliğini değiştirmeyen ayrı cevap kaydı; limit/stop/dedup; PC kapandığında güvenli durma. ChatGPT aboneliği için OpenCode tarafında açık Work/Codex kullanım sınırları geçerlidir; limit yokken ChatGPT olarak otomatik yanıt vaat edilmez. Mevcut Qwen–Gemini ve Cloudflare Council, PC açık olmasa da bağımsız çalışmaya devam eder.

Kaynaklar: [OpenCode MCP](https://opencode.ai/docs/mcp-servers), [OpenCode Config](https://opencode.ai/docs/config), [OpenCode Server](https://opencode.ai/docs/server), [RFC 8252 Native Apps](https://www.rfc-editor.org/rfc/rfc8252).
