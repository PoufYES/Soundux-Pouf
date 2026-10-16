(() => {
  function commandPath(name) {
    const url = new URL('../' + name, location.href);
    if (url.protocol !== 'file:') throw new Error('Abra o aplicativo Soundux instalado.');
    return decodeURIComponent(url.pathname).replace(/^\/(?=[A-Za-z]:)/, '').replace(/\//g, '\\');
  }
  function install() {
    const favorite = document.querySelector('button .mdi-heart');
    if (!favorite || typeof window.openUrl !== 'function') return;
    const original = favorite.closest('button');
    const parent = original.parentElement;
    if (parent.querySelector('[data-soundux-remote]')) return;
    for (const [label, icon, command] of [
      ['INICIAR WEB', 'mdi-cellphone-link', 'remote-start.vbs'],
      ['COPIAR LINK', 'mdi-content-copy', 'remote-copy.vbs']
    ]) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = original.className;
      button.dataset.sounduxRemote = command;
      button.title = label === 'INICIAR WEB' ? 'Iniciar e abrir o controle de audios no navegador' : 'Copiar o link completo para o celular com o IP atual';
      const content = document.createElement('span');
      content.className = 'v-btn__content';
      const glyph = document.createElement('i');
      glyph.className = 'v-icon notranslate v-icon--left mdi ' + icon + ' theme--dark';
      glyph.setAttribute('aria-hidden', 'true');
      content.append(glyph, document.createTextNode(label));
      button.append(content);
      button.addEventListener('click', async () => {
        button.disabled = true;
        try { await window.openUrl(commandPath(command)); }
        catch (error) { window.alert('Nao foi possivel abrir o controle: ' + error.message); }
        finally { button.disabled = false; }
      });
      original.after(button);
    }
    const start = parent.querySelector('[data-soundux-remote="remote-start.vbs"]');
    const copy = parent.querySelector('[data-soundux-remote="remote-copy.vbs"]');
    start.after(copy);
  }
  const observer = new MutationObserver(install);
  observer.observe(document.documentElement, {childList: true, subtree: true});
  install();
})();
