# Android üzerinden ücretsiz GitHub Codespaces testi

Bu yapılandirma Node.js 22 ve Copilot SDK'yı mevcut `feature/copilot-free-bridge` dalında çalıştırmak için hazırlanmıştır. Hazır olduğu **veya Copilot'un bağlandığı** anlamına gelmez.

1. Android telefonun Chrome tarayıcısında https://github.com/sshrrgoktas/atlas-council/tree/feature/copilot-free-bridge adresini aç.
2. Code → Codespaces → Create codespace on feature/copilot-free-bridge. Varsa 2 çekirdekli en küçük ücretsiz makineyi seç. İşlem süreni GitHub Billing ekranından denetle.
3. Terminalde `cd copilot-bridge && npm test` çalıştır. Başarılıysa protokol güvenlik testleri geçmiştir; bu henüz Copilot model testi değildir.
4. Cloudflare ile aynı rastgele, 32+ karakterli `COPILOT_BRIDGE_SECRET` değerini güvenli terminal ortamına yükle. Bu değeri sohbet kayıtlarına, GitHub dosyalarına veya kod tabanına yazma.
5. `npm start` ile 8789 portunu başlat. **Private port** GitHub giriş ister; Worker bu bağlantıyı otomatik geçemez. Gerçek Worker testinde portu public yapmak gerekirse, sunucu yalnızca geçerli HMAC imzalı isteklere cevap vermelidir; Codespaces portu internete açılır, bu bir güvenlik tavizidir. Bu adımı kişisel verilerle testten önce yeniden değerlendir.
6. GitHub OAuth App Client ID ve Client Secret, Worker'a **secret binding** olarak kaydedilmelidir. OAuth App oluşturulmadı; kullanıcı GitHub Developer Settings üzerinden bu kaydı onaylamalıdır.
7. Worker önizleme sürümü hazırlanıp eşdeğer secret'lar bağlandıktan sonra Android Chrome ile GitHub OAuth girişini yap; /api/copilot/status ve yalnızca bir gerçek Copilot yanıtıyla test et.
8. Codespace kullanmadığında mutlaka durdur. Ücretsiz kişisel GitHub hesaplarında Codespaces işlem süresi sınırlıdır; sürekli sunucu değildir.

**Henüz yapılmayanlar:** OAuth App oluşturma, Codespace açma, Worker gizli anahtarları, tunnel/port bağlantısı, Android giriş testi ve gerçek model cevabı. Bunları tamamlamadan Copilot bir konsey üyesi olarak “bağlı” gösterilmemelidir.

Resmi kaynaklar: https://docs.github.com/en/copilot/how-tos/copilot-sdk/setup/github-oauth ; https://docs.github.com/en/billing/concepts/product-billing/github-codespaces ; https://docs.github.com/en/codespaces/reference/security-in-github-codespaces .
