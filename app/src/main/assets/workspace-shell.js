(() => {
  'use strict';
  if (window.__athaUnifiedWorkspace) return;
  window.__athaUnifiedWorkspace = true;
  const style = document.createElement('link');
  style.id = 'atha-council-workspace-style';
  style.rel = 'stylesheet';
  style.href = location.origin + '/_atha/native-workspace.css';
  document.head.append(style);
  function menuLink(id, label, destination) {
    const drawer = document.getElementById('bottom-nav') || document.getElementById('side-menu');
    if (!drawer || document.getElementById(id)) return;
    const button = document.createElement('button'); button.id=id;button.type='button';button.className='workspace-return';button.textContent=label;
    button.addEventListener('click', () => { location.href=destination; });
    drawer.prepend(button);
  }
  function summarizeTool(raw) {
    const first = String(raw).split('\n')[0].trim();
    const names = { bridge_status:'Bilgisayar bağlantısı kontrol edildi', bridge_list_files:'Proje dosyaları incelendi', bridge_read_file:'Dosya okundu', bridge_write_file:'Dosya düzenlendi', bridge_inspect_file:'Çıktı dosyası kontrol edildi', bridge_list_apps:'Kurulu uygulamalar kontrol edildi', bridge_launch_app:'Uygulama açma isteği gönderildi', bridge_fetch_web:'Web sayfası incelendi', bridge_make_directory:'Proje klasörü oluşturuldu', bridge_cancel_job:'İşlemin durdurulması istendi', bridge_undo_file:'Dosya değişikliği geri alındı' };
    if (first === 'bridge_start_job' || first === 'bridge_read_job') {
      const state = /"state"\s*:\s*"([a-z-]+)"/.exec(raw)?.[1];
      const task = /\b(?:tests?|pytest|vitest|jest)\b/i.test(raw) ? 'Test' : /\b(?:build|compile|gradle)\b/i.test(raw) ? 'Derleme' : /\brender\b/i.test(raw) ? 'Render' : 'Bilgisayar işlemi';
      return task + ({queued:' sırada',running:' sürüyor',succeeded:' tamamlandı',failed:' hata verdi',cancelled:' durduruldu','timed-out':' süre sınırına ulaştı'}[state] || ' durumu kontrol edildi');
    }
    return names[first] || 'Bilgisayardaki işlem kontrol edildi';
  }
  window.athaWorkspaceToolSummary = summarizeTool;
  let scheduled=false;
  function render() {
    scheduled=false;
    menuLink('atha-return-council','◉ Konsey sohbeti','athalai://council');
    menuLink('atha-change-computer','⌘ Bilgisayar bağlantısını değiştir','athalai://connection');
    for (const pre of document.querySelectorAll('.chat-tool-row pre')) {
      const row=pre.closest('.chat-tool-row'), summary=document.createElement('p');
      summary.textContent=row.classList.contains('is-error')?'Bilgisayar işlemi tamamlanamadı':summarizeTool(pre.textContent);
      pre.replaceWith(summary);
    }
    const scroll=document.getElementById('chat-scroll'), state=document.getElementById('chat-turn-state');
    if (scroll && state) {
      let status=document.getElementById('workspace-progress');
      if (!status) { status=document.createElement('div');status.id='workspace-progress';status.setAttribute('role','status');scroll.append(status); }
      const label=state.hidden?'':state.textContent.trim();
      const next=label==='Yanıt hazırlanıyor'?'Düşünüyor…':label==='Mesaj iletiliyor'?'Mesaj iletiliyor…':label==='Onayın bekleniyor'?'İşlem için onayın bekleniyor':label==='Durdurma istendi'?'İşlem durduruluyor…':'';
      if(status.textContent!==next)status.textContent=next;
      status.hidden=!next;
    }
  }
  const observer=new MutationObserver(() => { if(!scheduled){scheduled=true;requestAnimationFrame(render);} });
  observer.observe(document.body,{childList:true,subtree:true,characterData:true});
  render();
})();
