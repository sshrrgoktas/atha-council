(() => {
  if (location.origin !== 'https://atlas-council.sshrrgoktas.workers.dev' || location.pathname !== '/council-v2') return;
  const drawer = document.getElementById('drawer');
  if (!drawer || document.getElementById('atha-pc-workspace')) return;
  const button = document.createElement('button');
  button.id = 'atha-pc-workspace';
  button.type = 'button';
  button.textContent = '⌘ Bilgisayarda çalış';
  button.addEventListener('click', () => {
    if (window.AtlasNative && typeof window.AtlasNative.openWorkspace === 'function') window.AtlasNative.openWorkspace();
  });
  const heading = Array.from(drawer.querySelectorAll('h3')).find(node => node.textContent === 'Çalışma alanı');
  if (heading) heading.after(button); else drawer.prepend(button);
})();
