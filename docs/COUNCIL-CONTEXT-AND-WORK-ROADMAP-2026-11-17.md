# Atha Konseyi: bağlam, doğru hitap ve gerçek görev merkezi

17 Kasım 2026 — Kaynak: kullanıcının açık izniyle okunan son eşitlenmiş OpenCode Sohbeti, 48 mesaj. Tam özel sohbet dökümü depoya kopyalanmadı.

## Gerçek sohbette tespit edilen hatalar

1. 'OpenCode?' sorusuna Llama 'Opencode nedir?' dedi. Genel konuşma fan-out, kime hitap edildiğini güvenilir takip etmiyor.
2. 'Gemini, bu iki modelin beni anlamasını sağla; sonra değiştirirsem söylerim' talimatı kabul edildi; 'Şimdi dediğimi yap' devamı görev olarak uygulanmadı. Kalıcı oda rolü ve açık hedef eksik.
3. Gemini başka modellere 'müdahale ediyorum/aktarıyorum' dedi, fakat kayıtlı bir gönderim veya uygulama kanıtı yok. Metinsel vaat ile gerçekleşen araç işi karıştırılıyor.
4. QwQ İngilizce iç analizini kullanıcıya döktü; eklenen filtrenin bazı yanıtları tamamen reddetmesi yüzünden Qwen başarısızlık bildirimi verdi. Kontrollü yanıt yedeği ve model kalitesi ölçümü gerekiyor.
5. Llama başka konuşmacının rol etiketini tekrar etti; sunucu modellerin son gerçek konuşma bağlamını düzgün yapısal rollerle iletmiyor.
6. OpenCode sohbet ajanı dosya, test ve iş araçları kapalı olduğu hâlde genel 'hazırım' cümleleriyle göreve başlamış izlenimi veriyor.

## Tasarım ilkeleri

- Kullanıcı yazmadıkça Konsey modelleri kendi aralarında yeni diyalog oluşturmayacak. En fazla kullanıcı isteğiyle bir tur.
- Mesajın hedefi (Gemini/Qwen/Llama/OpenCode/Konsey) görünür. Takip soruları açık oda odağını korur, kullanıcı başka modeli seçince değişir.
- Niyet: sohbet, hata geri bildirimi, analiz, görev, durdurma, onay. Belirsiz komut model çalıştırma yetkisi vermez.
- Konuşma bağlamı, kullanıcı talimatı ve diğer model çıktısı ayrı alanlar. Asistanın yazdığı metin sistem yetkisi değildir.
- Gerçek işlem = kullanıcı onayı + görev ID + araç çağrısı/çıktı + test/kanıt + gözden geçirme. Model sözleri işlem kanıtı sayılmaz.
- Var olan OpenCode sohbet ajanının bütün dosya/sistem araçları kapalı kalacak. Ayrı iş ajanı sadece izinli çalışma kopyasında çalışacak.
- Mevcut sohbet geçmişi, Gemini/Qwen/OpenCode bağlantıları ve Android APK değişmeden korunacak. Canlı Worker için önce sürüm yedeği, sonra test.

## Aşamalı uygulama

### P0 — Hemen
- [ ] Görünür aktif muhatap seçimi (Gemini, Qwen, Llama, OpenCode, Herkes) ve her odada saklanan son hedef.
- [ ] 'Gemini, şunları incele' ardından 'Şimdi dediğimi yap' aynı muhataba gitmeli.
- [ ] Yalnız açık 'Herkes' seçiminde birer cevap; modellerin otomatik birbirini çağırması kapalı.
- [ ] Qwen'in kullanıcıya görünür son metin ayrıştırması; 1 sınırlandırılmış güvenli Qwen model alternatifi; tekrarlar ve hata sebepleri kayıtlı.
- [ ] Analiz/görev isteklerinde iki cümle sınırı yok; gerçek bulgular, kanıtlar, yapılabilen/yapılamayan işlemler ayrılır.
- [ ] 'Onlara aktardım', 'düzelttim', 'video ürettim' gibi araç kanıtsız tamamlandı iddialarını engelle.
- [ ] Son gerçek sohbetten alınan semptomlarla sentetik regresyon testleri; özel metinleri test dosyasına gömme.

### P1 — İşlevsel Görevler
- [ ] Görev Taslak → Kullanıcı Onayı → Çalışıyor → Test → İnceleme → Tamamlandı/Engellendi.
- [ ] Görevte kullanıcı isteği, sorumlu, hedef proje, onay kapsamı, son test, hata nedeni ve çıktıya giden bağlantı.
- [ ] 'Son mesajdan görev oluştur' ve 'Son cevabı incele' UI eylemleri. Görev kaydı işin yapıldığı anlamına gelmez.
- [ ] Başarısız testin aynı içerikle tekrar tekrar kota tüketmesini önleyen test hash, yeniden deneme nedeni ve günlük sınırı.

### P2 — Ayrı OpenCode iş ajanı
- [ ] İzole dosya çalışma alanı, izinli proje kökü, salt erişim → onaylı yazma; silme/yayınlama ayrı onay.
- [ ] Gerçek git diff, test çıktısı ve geri alınabilir PR; sonuç olmadan başarı mesajı yok.
- [ ] İlk görev: Qwen hata düzeltme ve öncesi/sonrası 20 senaryoluk kalite ölçümü.
- [ ] Sonra AthalAI hafıza/karar defteri ve İngilizce Kâşifi Reading Explorer prototipi.

## Kritik kabul testleri

- 'Gemini, diğerlerinin beni neden yanlış anladığını incele' → gerçek analiz; başkasına gönderim yapmadıysa ilettiğini söylemez.
- 'Şimdi dediğimi yap' → aktif Gemini odağını ve önceki görevi hatırlar.
- 'OpenCode?' → Llama veya Qwen araya girmez.
- 'Herkes tek tek görüş bildirsin' → yalnız birer cevap, sonsuz döngü yok.
- 'Bana İngilizce açıklama yapma' → dil tercihi korunur.
- 'Video üretiyorum' (araç yok) → başarı veya işlem iddiası reddedilir.
- Boş Yeni sohbet başlığı geçmişte çoğalmaz; gerçek sohbetler korunur.

Başarı ölçütü: en az %95 doğru hedef belirleme, sıfır onaysız işlem, sıfır kanıtsız başarı iddiası, sıfır iç düşünce sızıntısı.
