(() => {
  'use strict';
  if (window.__athaUnifiedWorkspace) return;
  window.__athaUnifiedWorkspace = true;
  const style = document.createElement('link');
  style.id = 'atha-council-workspace-style';
  style.rel = 'stylesheet';
  style.href = location.origin + '/_atha/native-workspace.css';
  document.head.append(style);
  function setupWorkspace() {
    const view=document.getElementById('work-view');
    if (!view || view.dataset.workLayout) return;
    view.dataset.workLayout='true';
    view.classList.add('workspace-view');
    const top=document.querySelector('.chat-topbar');
    const oldActions=document.querySelector('.chat-topbar-actions');if(oldActions){oldActions.hidden=true;document.body.append(oldActions);}
    const title=document.getElementById('chat-title');
    const newChat=document.getElementById('new-chat');
    if(top&&title&&newChat){
      const row=document.createElement('div');row.className='workspace-heading row';
      title.textContent=title.textContent==='Yeni sohbet'?'Yeni çalışma':title.textContent;
      newChat.className='secondary';newChat.textContent='Yeni çalışma';
      row.append(title,newChat);
      const state=document.getElementById('chat-turn-state');if(state){state.classList.add('sr-only');row.append(state);}
      top.replaceChildren(row);
    }
    const empty=document.getElementById('chat-empty');
    if(empty){const heading=document.createElement('h2'),note=document.createElement('p');heading.textContent='Ne üzerinde çalışalım?';note.textContent='Görevini yaz. Çalışma adımlarını ve sonucu burada takip et.';empty.replaceChildren(heading,note);}
    const form=document.getElementById('chat-form'),input=document.getElementById('chat-input'),send=document.getElementById('send-message'),stop=document.getElementById('cancel-turn'),draft=document.getElementById('chat-draft-note');
    if(form&&input&&send){
      form.className='compose workspace-compose';
      input.placeholder='Mesajını yaz...';input.setAttribute('aria-label','Görevin veya mesajın');
      send.className='primary';send.textContent='Gönder';send.setAttribute('aria-label','Mesajı gönder');
      const actions=document.createElement('div');actions.className='workspace-send-actions';
      if(stop){stop.className='secondary';stop.textContent='Durdur';actions.append(stop);}
      actions.append(send);form.replaceChildren(input,actions);if(draft){draft.className='sr-only';form.append(draft);}
    }
    const tools=document.getElementById('chat-tools');
    if(tools){tools.classList.add('workspace-steps');const label=tools.querySelector('summary span');if(label)label.textContent='Çalışma adımları';}
    const drawer=document.getElementById('bottom-nav');const refresh=document.getElementById('refresh-chat');if(drawer&&refresh){refresh.className='workspace-return';refresh.textContent='Çalışmayı yenile';drawer.append(refresh);}
    const headerBrand=document.querySelector('.app-header .brand > span');
    if(headerBrand){headerBrand.replaceChildren();const strong=document.createElement('strong'),small=document.createElement('span');strong.textContent='AthalAI';small.className='muted';small.textContent='Çalışma alanı';headerBrand.append(strong,small);}
    const headerNew=document.getElementById('header-new-chat');if(headerNew){headerNew.textContent='＋';headerNew.setAttribute('aria-label','Yeni çalışma');}
    const menu=document.getElementById('open-menu');if(menu){menu.classList.add('menuToggle');menu.textContent='☰';}
  }
  window.athaApplyTheme = theme => {
    const selected=theme==='light'?'light':'dark';
    document.documentElement.dataset.athaTheme=selected;
    try{localStorage.setItem('athalai.appearance',selected);}catch{}
    const button=document.getElementById('atha-workspace-theme');
    if(button)button.textContent=selected==='dark'?'☀ Açık temaya geç':'☾ Koyu temaya geç';
  };
  function installAppearance() {
    const drawer=document.getElementById('bottom-nav')||document.getElementById('side-menu');
    if(!drawer||document.getElementById('atha-workspace-theme'))return;
    const button=document.createElement('button');button.type='button';button.id='atha-workspace-theme';button.className='workspace-return';
    button.addEventListener('click',()=>{const next=document.documentElement.dataset.athaTheme==='light'?'dark':'light';window.athaApplyTheme(next);location.href='athalai://theme/'+next;});
    drawer.append(button);
    let saved='dark';try{saved=localStorage.getItem('athalai.appearance')||'dark';}catch{}
    window.athaApplyTheme(saved);
  }
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
    setupWorkspace();
    installAppearance();
    for(const row of document.querySelectorAll('.chat-message')){row.classList.add('bubble');if(row.classList.contains('is-user'))row.classList.add('mine');}
    const title=document.getElementById('chat-title');if(title&&title.textContent==='Yeni sohbet')title.textContent='Yeni çalışma';
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
