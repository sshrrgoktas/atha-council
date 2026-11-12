(() => {
  if (location.origin !== 'https://atlas-council.sshrrgoktas.workers.dev' || location.pathname !== '/council-v2') return;
  const appearance=document.createElement('style');appearance.textContent="html[data-atha-theme=light] body{background:#f7f9fb;color:#132b3a}html[data-atha-theme=light] header,html[data-atha-theme=light] .drawer{background:#fff;border-color:#cedce4}html[data-atha-theme=light] .bubble{background:#e9f0f5;color:#132b3a}html[data-atha-theme=light] .bubble.mine{background:#d2eee8}html[data-atha-theme=light] .bubble small{color:#067e74}html[data-atha-theme=light] .card{background:#fff;border-color:#cedce4}html[data-atha-theme=light] .card p,html[data-atha-theme=light] .muted{color:#526d7c}html[data-atha-theme=light] .drawer button,html[data-atha-theme=light] .secondary{background:#eaf0f4;color:#244555}html[data-atha-theme=light] .compose{background:#fff;border-color:#a8c2c8}html[data-atha-theme=light] .compose textarea{color:#132b3a}html[data-atha-theme=light] .primary{background:#087e74;color:#fff}html[data-atha-theme=light] .menuToggle{color:#244555;border-color:#b5c9d4}html[data-atha-theme=light] input,html[data-atha-theme=light] .profileInput{background:#fff;color:#132b3a}html[data-atha-theme=light] .thinking{color:#526d7c}html[data-atha-theme=light] .chatActionPanel{background:#fff;color:#132b3a;border-color:#cedce4}";document.head.append(appearance);
  window.athaApplyTheme=theme=>{document.documentElement.dataset.athaTheme=theme==='light'?'light':'dark';const button=document.getElementById('atha-council-theme');if(button)button.textContent=theme==='light'?'☾ Koyu temaya geç':'☀ Açık temaya geç';};
  const drawer = document.getElementById('drawer');
  if (!drawer || document.getElementById('atha-pc-workspace')) return;
  const workSection=document.createElement('section');workSection.id='atha-workspace-menu';
  const workHeading=document.createElement('h3');workHeading.textContent='AthalAI Çalışmaları';workSection.append(workHeading);
  function openWork(view){
    document.getElementById('closeDrawer')?.click();
    if(window.AtlasNative&&typeof window.AtlasNative.openWorkspaceView==='function')window.AtlasNative.openWorkspaceView(view);
    else if(window.AtlasNative&&typeof window.AtlasNative.openWorkspace==='function')window.AtlasNative.openWorkspace();
  }
  const button=document.createElement('button');button.id='atha-pc-workspace';button.type='button';button.textContent='＋ Yeni çalışma';button.addEventListener('click',()=>openWork('new'));workSection.append(button);
  const list=document.createElement('button');list.id='atha-workspace-list';list.type='button';list.textContent='☷ Çalışma sohbetleri';list.addEventListener('click',()=>openWork('chats'));workSection.append(list);
  const profile=document.getElementById('profileLabel');if(profile)profile.before(workSection);else drawer.append(workSection);
  const exportIds=['exportCurrent','exportCurrentJson','drawerBackup','importChats'];
  const first=document.getElementById(exportIds[0]);
  if(first){
    const group=document.createElement('section');group.id='atha-backup-menu';
    const toggle=document.createElement('button');toggle.type='button';toggle.textContent='↗ Yedekleme ve dışa aktarma';toggle.setAttribute('aria-expanded','false');toggle.setAttribute('aria-controls','atha-backup-actions');
    const actions=document.createElement('div');actions.id='atha-backup-actions';actions.hidden=true;actions.setAttribute('role','group');actions.setAttribute('aria-label','Yedekleme ve dışa aktarma seçenekleri');
    toggle.addEventListener('click',()=>{actions.hidden=!actions.hidden;toggle.setAttribute('aria-expanded',String(!actions.hidden));});
    first.before(group);group.append(toggle,actions);
    for(const id of exportIds){const action=document.getElementById(id);if(action)actions.append(action);}
  }
  const themeButton=document.createElement('button');themeButton.id='atha-council-theme';themeButton.type='button';themeButton.addEventListener('click',()=>{const next=document.documentElement.dataset.athaTheme==='light'?'dark':'light';window.athaApplyTheme(next);if(window.AtlasNative&&typeof window.AtlasNative.setTheme==='function')window.AtlasNative.setTheme(next);});drawer.append(themeButton);
  window.athaApplyTheme(window.AtlasNative&&typeof window.AtlasNative.theme==='function'?window.AtlasNative.theme():'dark');
  const heading = Array.from(drawer.querySelectorAll('h3')).find(node => node.textContent === 'Çalışma alanı');
  if(heading)heading.textContent='Konsey';
  const newCouncil=document.getElementById('drawerNewChat');if(newCouncil)newCouncil.textContent='＋ Yeni konsey sohbeti';
})();
