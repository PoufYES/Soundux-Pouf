(() => {
  let dialog, poll, opening=false;
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  async function call(path, body={}) {
    const result=await window.remoteControlRequest(path,body);
    if(result.error)throw Error(result.error);
    return result;
  }
  function close(){clearInterval(poll);dialog?.remove();dialog=null;}
  async function showPairing(){
    if(dialog){dialog.querySelector('button').focus();return;}
    if(opening)return;
    opening=true;
    dialog=document.createElement('dialog');
    dialog.style.cssText='background:#121719;color:#eef4f2;border:1px solid #40574b;border-radius:18px;width:640px;max-width:95vw;max-height:90vh;padding:26px;font:15px system-ui';
    dialog.innerHTML='<button type="button" data-close style="float:right">Fechar</button><h2 style="margin-top:0">Conectar celular</h2><p>Na mesma rede Wi-Fi, escaneie o QR Code com a câmera do celular.</p><p data-status role="status" aria-live="polite">Preparando conexão… Autorize o Windows se solicitado.</p><div data-ready hidden><label>Conexão <select data-address></select></label> <button type="button" data-refresh>Novo QR Code</button><img data-qr alt="QR Code para conectar o celular" style="display:block;width:260px;max-width:100%;margin:18px auto"><p>Depois de conectar, salve o controlador nos favoritos. O endereço da rede física é selecionado automaticamente. Use o nome local somente se seu celular oferecer suporte.</p><h3>Dispositivos autorizados</h3><ul data-devices></ul></div>';
    const q=selector=>dialog?.querySelector(selector);
    const status=text=>{const node=q('[data-status]');if(node)node.textContent=text;};
    q('[data-close]').onclick=close;
    dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
    document.body.append(dialog);dialog.showModal();
    const devices=async()=>{
      const list=await call('devices'),ul=q('[data-devices]');if(!ul)return;
      ul.replaceChildren();
      if(!list.length){const li=document.createElement('li');li.textContent='Nenhum celular conectado.';ul.append(li);}
      for(const device of list){const li=document.createElement('li');li.textContent=device.name+' ';const b=document.createElement('button');b.type='button';b.textContent='Desconectar';b.onclick=async()=>{try{await call('revoke',{id:device.id});await devices();}catch(e){status(e.message);}};li.append(b);ul.append(li);}
    };
    const invite=async()=>{try{const data=await call('invite',{address:q('[data-address]').value});const img=q('[data-qr]');if(!img)return;img.src=data.qr;status('Escaneie até '+new Date(data.expires).toLocaleTimeString('pt-BR')+'. O QR Code pode ser usado uma vez.');await devices();}catch(e){status(e.message);}};
    try{
      if(!await window.startRemoteControl())throw Error('Não foi possível iniciar o controle.');
      let addresses,lastError;
      for(let attempt=0;attempt<120&&dialog;attempt++){
        try{addresses=await call('addresses');break;}catch(e){lastError=e;await wait(1000);}
      }
      if(!dialog)return;
      if(!addresses)throw lastError||Error('O controle não iniciou. Tente novamente.');
      for(const address of addresses){const o=document.createElement('option');o.value=address;o.textContent=address+(address.includes('.local')?' — nome local (opcional)':' — rede local');q('[data-address]').append(o);}
      q('[data-ready]').hidden=false;q('[data-address]').onchange=invite;q('[data-refresh]').onclick=invite;
      await invite();if(dialog)poll=setInterval(()=>devices().catch(e=>status(e.message)),5000);
    }catch(e){status(e.message);}finally{opening=false;}
  }
  setInterval(()=>{if(typeof window.saveRemoteState==='function')window.saveRemoteState().catch(()=>{});},2000);
  function install() {
    const favorite = document.querySelector('button .mdi-heart');
    if (!favorite || typeof window.startRemoteControl !== 'function') return;
    const original = favorite.closest('button');
    const parent = original.parentElement;
    if (parent.querySelector('[data-soundux-remote]')) return;
    for (const [label, icon, command] of [
      ['CONECTAR CELULAR', 'mdi-cellphone-link', 'startRemoteControl']
    ]) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = original.className;
      button.dataset.sounduxRemote = command;
      button.title = 'Mostrar QR Code e gerenciar celulares conectados';
      const content = document.createElement('span');
      content.className = 'v-btn__content';
      const glyph = document.createElement('i');
      glyph.className = 'v-icon notranslate v-icon--left mdi ' + icon + ' theme--dark';
      glyph.setAttribute('aria-hidden', 'true');
      content.append(glyph, document.createTextNode(label));
      button.append(content);
      button.addEventListener('click', async () => {
        button.disabled = true;
        try { await showPairing(); }
        catch (error) { window.alert('Nao foi possivel abrir o controle: ' + error.message); }
        finally { button.disabled = false; }
      });
      original.after(button);
    }
  }
  const observer = new MutationObserver(install);
  observer.observe(document.documentElement, {childList: true, subtree: true});
  install();
})();
