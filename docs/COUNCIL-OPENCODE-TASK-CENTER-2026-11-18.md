# Atha Council → OpenCode Görev Merkezi

**Amaç:** Konsey yalnız kullanıcı mesajlarıyla konuşur. Konsey üyelerinin fikirleri, mobil Görev Merkezi'nde düzenlenebilir bir **taslağa** aktarılabilir. Taslak tek başına işlem başlatmaz. Kullanıcı GitHub hesabıyla **İş emrini onayla** dediğinde kayıt `approved` olur; Windows PC'deki bağımsız işçi imzalı istekte bu işi bir kez sahiplenir.

## Gerçek iş akışı

1. Konseyde konuş ve teknik kararı netleştir.
2. **Görev Merkezi → Konseyin son görüşlerinden taslak oluştur** düğmesiyle öneri metnini al. Bu metin otomatik olarak onaylı karar sayılmaz; kontrol et, açık başarı ölçütü yaz, **Taslağı kaydet**.
3. **İş emrini onayla**. Bu ayrı kullanıcı etkileşimi olmadan PC'de model çalışmaz.
4. PC açık ve yerel `council-work-agent.cjs` çalışıyor ise, mevcut Ed25519 eşlemesi ile yalnız bu odadaki onaylı işleri alır. İzinli repo başlangıçta **sshrrgoktas/atha-council** ile sınırlıdır. Model `work/ct_...` dalında, her görev için ayrı yeni bir çalışma kopyasında yalnız kaynak dosyası düzenler.
5. İşçi güvenilir `git status` ve `git diff --check` çıktısından dosya listesini oluşturur; kodu otomatik çalıştırmaz. Sonuç `review` veya `failed` olarak kaydedilir. Telefonda dosyalar, kontrol sonucu ve işçi raporu görünür.
6. Yalnız kullanıcı **Çıktıyı kabul et** ile işi `done` yapabilir. Bunun anlamı GitHub PR/merge/yayın değildir. Dağıtım ayrıca onaylanmalı, CI ve kod incelemesi gerekir.

## Yerel kurulum

- Eski sohbet dinleyicisi `council-autopilot-handoff-v1.cjs` çalışıyorsa durdurulur; geçmiş sohbetler ve eski yedekler silinmez.
- Aynı yetkili klasöre `council-work-agent.cjs` kopyalanır: `C:\Users\seher\Documents\AthalAI-OpenCode-Council-Bridge`. Var olan `agent-config.json` ve özel Ed25519 anahtarı **yerinden oynatılmaz, hiçbir yere yüklenmez**.
- `node council-work-agent.cjs status` yalnız durum okur; `start` yeni işçi başlatır, `stop` durdurma işareti koyar. İşyeri: kullanıcının Documents klasöründe `AthalAI-OpenCode-Work/tasks/<task-id>`.
- Başlangıçta yalnız mevcut eşleştirilmiş Council odası kullanılır. Bilgisayar kapalıyken görev `approved` kalır, sahte sonuç üretilmez.

## İzin ve sınırlar

- OpenCode'un sohbet için açılan eski `poll/reply` yolları yeni model turu açmaz; cevap yazma kaldırılır, kayıtlar korunur.
- İşçi ayrı özel `council-worker` ajanı kullanır. OpenCode V2 politikası **shell, web, harici klasör, subagent, execute, yetki dosyası düzenlemesini** reddeder; yalnız çalışma kopyası içinde kaynak `read/edit/glob/grep` kullanır.
- Bu bir tam işletim sistemi sanal alanı değildir. Shell üzerinde model tarafından üretilen kod veya otomatik test çalıştırılmaz. Gelişmiş izolasyon için ileride Windows Sandbox/VM kullanılabilir.
- Model yalnız kendi eylemiyle başarı iddia edemez. Sunucu dosya farkı raporu ve tekil görev durumunu birbirinden ayırır. `approved → running → review/failed → done` kayıtları yetki/oda/işçi kimliğine bağlıdır.
- 15 dakikadan uzun takılan `running` işleri `WORKER_INTERRUPTED` olarak başarısız durumuna düşer; **otomatik yeniden çalıştırılmaz**, kullanıcı yeni görev oluşturabilir.
- Ücretli API, farklı repo, Windows'un tüm diskine erişim, otomatik merge veya yayın bu sürümde yoktur.

## Test koşulları

`node --test test/council-task-center.test.mjs test/council-followup-regression.test.mjs worker/opencode-companion/council-work-agent.test.cjs`

Birim testleri gerçek kullanıcı adına Konsey mesajı göndermez, dış model çağırmaz, canlı D1 değiştirmez. Canlı kabul: yetkili kullanıcı taslak oluşturur → onaylar → PC işçisi işi alır → gerçek dosya farkı ve inceleme kaydı görülür. Son aşamada iPhone Safari ve mevcut Android WebView ayrıca doğrulanır.
