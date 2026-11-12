(() => {
  if (location.origin !== 'https://atlas-council.sshrrgoktas.workers.dev' || location.pathname !== '/council-v2') return;
  const appearance=document.createElement('style');appearance.textContent="html[data-atha-theme=light] body{background:#f7f9fb;color:#132b3a}html[data-atha-theme=light] header,html[data-atha-theme=light] .drawer{background:#fff;border-color:#cedce4}html[data-atha-theme=light] .bubble{background:#e9f0f5;color:#132b3a}html[data-atha-theme=light] .bubble.mine{background:#d2eee8}html[data-atha-theme=light] .bubble small{color:#067e74}html[data-atha-theme=light] .card{background:#fff;border-color:#cedce4}html[data-atha-theme=light] .card p,html[data-atha-theme=light] .muted{color:#526d7c}html[data-atha-theme=light] .drawer button,html[data-atha-theme=light] .secondary{background:#eaf0f4;color:#244555}html[data-atha-theme=light] .compose{background:#fff;border-color:#a8c2c8}html[data-atha-theme=light] .compose textarea{color:#132b3a}html[data-atha-theme=light] .primary{background:#087e74;color:#fff}html[data-atha-theme=light] .menuToggle{color:#244555;border-color:#b5c9d4}html[data-atha-theme=light] input,html[data-atha-theme=light] .profileInput{background:#fff;color:#132b3a}html[data-atha-theme=light] .thinking{color:#526d7c}";document.head.append(appearance);
  window.athaApplyTheme=theme=>{document.documentElement.dataset.athaTheme=theme==='light'?'light':'dark';const button=document.getElementById('atha-council-theme');if(button)button.textContent=theme==='light'?'☾ Koyu temaya geç':'☀ Açık temaya geç';};
  const drawer = document.getElementById('drawer');
  if (!drawer || document.getElementById('atha-pc-workspace')) return;
  const button = document.createElement('button');
  button.id = 'atha-pc-workspace';
  button.type = 'button';
  button.textContent = '⌘ Bilgisayarda çalış';
  button.addEventListener('click', () => {
    if (window.AtlasNative && typeof window.AtlasNative.openWorkspace === 'function') window.AtlasNative.openWorkspace();
  });
  const themeButton=document.createElement('button');themeButton.id='atha-council-theme';themeButton.type='button';themeButton.addEventListener('click',()=>{const next=document.documentElement.dataset.athaTheme==='light'?'dark':'light';window.athaApplyTheme(next);if(window.AtlasNative&&typeof window.AtlasNative.setTheme==='function')window.AtlasNative.setTheme(next);});drawer.append(themeButton);
  window.athaApplyTheme(window.AtlasNative&&typeof window.AtlasNative.theme==='function'?window.AtlasNative.theme():'dark');
  const heading = Array.from(drawer.querySelectorAll('h3')).find(node => node.textContent === 'Çalışma alanı');
  if (heading) heading.after(button); else drawer.prepend(button);
})();
