/* Supabase publishable key: public browser credential, restricted to the mural RPCs. */
(() => {
  'use strict';
  const API = 'https://zhvucrwjavgzbqmmphqu.supabase.co/rest/v1/rpc/';
  const PUBLIC_KEY = 'sb_publishable_OyynTnn3RMqbM9wMa-qB1g_YPkp7J5v';
  const OWNER_STORAGE = 'niverelieth:mural:owner:v1';
  const NAME_STORAGE = 'niverelieth:mural:name:v1';
  const PAGE_SIZE = 16;
  const get = id => document.getElementById(id);
  const dialog = get('mural'), form = get('mural-form'), nameField = get('mural-name'), messageField = get('mural-message');
  const audio = get('soundtrack');
  let ownerToken = null, editingId = null, submitting = false, loading = false, cursor = null;
  let resumeAfterClose = false, requestGeneration = 0, listController = null;
  const messages = new Map();
  function fitViewport() {
    const viewport = window.visualViewport;
    if (!dialog.open || !viewport || viewport.scale>1.05) return;
    dialog.style.bottom = `${Math.max(0,innerHeight-viewport.height-viewport.offsetTop)}px`;
    dialog.style.maxHeight = `${Math.floor(viewport.height-12)}px`;
    dialog.style.height = `${Math.floor(Math.min(820,viewport.height*(viewport.height<500 ? .98 : .92)))}px`;
    dialog.style.setProperty('--mural-bottom-safe',viewport.height<innerHeight-100 ? '8px' : 'var(--safe-bottom)');
  }
  window.visualViewport?.addEventListener('resize',fitViewport,{passive:true});
  window.visualViewport?.addEventListener('scroll',fitViewport,{passive:true});
  window.addEventListener('resize',fitViewport,{passive:true});
  try {
    const saved = localStorage.getItem(OWNER_STORAGE);
    if (/^[0-9a-f]{64}$/.test(saved || '')) ownerToken = saved;
    nameField.value = localStorage.getItem(NAME_STORAGE) || '';
  } catch (error) { /* Reading remains available without browser storage. */ }
  function ensureOwnerToken() {
    if (ownerToken) return ownerToken;
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    ownerToken = Array.from(bytes,byte => byte.toString(16).padStart(2,'0')).join('');
    try { localStorage.setItem(OWNER_STORAGE,ownerToken); }
    catch (error) { get('mural-owner-hint').textContent = 'Este navegador não está salvando dados. A edição ficará disponível apenas enquanto esta página estiver aberta.'; }
    return ownerToken;
  }
  async function rpc(action,params,signal) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(),18000);
    const abort = () => controller.abort();
    signal?.addEventListener('abort',abort,{once:true});
    if (signal?.aborted) controller.abort();
    try {
      const response = await fetch(API+action,{method:'POST',headers:{apikey:PUBLIC_KEY,'Content-Type':'application/json'},body:JSON.stringify(params),signal:controller.signal});
      const data = await response.json();
      if (!response.ok) throw Object.assign(new Error(data.message || 'Não foi possível concluir.'),{code:data.code,status:response.status});
      return data;
    } finally { clearTimeout(timer); signal?.removeEventListener('abort',abort); }
  }
  function status(text,type = 'success') {
    const element = get('mural-status'); element.textContent = text; element.hidden = !text; element.dataset.type = type;
  }
  function friendlyError(error) {
    if (error.code === '23505') return 'Esse carinho já está no mural. Não é preciso enviar de novo. ♡';
    if (error.code === '42501') return 'Você só pode alterar recados publicados neste navegador.';
    if (['23514','23502','22023'].includes(error.code)) return 'Preencha seu nome e uma mensagem de até 1000 caracteres.';
    return 'Não foi possível concluir agora. Confira a conexão e tente novamente. Seu texto continua aqui.';
  }
  function updateCounter() { get('mural-counter').textContent = `${messageField.value.length} / 1000`; }
  function cancelEdit() {
    editingId = null; messageField.value = ''; updateCounter();
    get('mural-form-title').textContent = 'Deixe seu carinho ♡';
    get('mural-submit').textContent = 'Publicar carinho ♡'; get('mural-cancel-edit').hidden = true;
  }
  function beginEdit(message) {
    if (submitting || !message.is_mine) return;
    editingId = message.id; nameField.value = message.nome; messageField.value = message.mensagem; updateCounter(); status('');
    get('mural-form-title').textContent = 'Editar seu carinho'; get('mural-submit').textContent = 'Salvar alterações'; get('mural-cancel-edit').hidden = false;
    form.scrollIntoView({block:'start',behavior:'smooth'}); messageField.focus({preventScroll:true});
  }
  async function deleteMessage(message,button) {
    if (submitting || !message.is_mine || !window.confirm('Apagar seu recado? Essa ação não pode ser desfeita.')) return;
    button.disabled = true; button.textContent = 'Apagando…';
    try {
      await rpc('mural_delete_recado',{p_id:message.id,p_owner_token:ownerToken});
      if (editingId === message.id) cancelEdit();
      status('Seu recado foi apagado.'); await loadMessages(true);
    } catch (error) { status(friendlyError(error),'error'); button.disabled = false; button.textContent = 'Excluir'; }
  }
  const dateFormat = new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit',timeZone:'America/Sao_Paulo'});
  function renderMessage(message) {
    const card = document.createElement('article'); card.className = 'mural-card' + (message.is_mine ? ' is-mine' : ''); card.dataset.id = message.id;
    const heading = document.createElement('div'); heading.className = 'mural-card-heading';
    const avatar = document.createElement('span'); avatar.className = 'mural-avatar'; avatar.textContent = Array.from(message.nome.trim())[0]?.toLocaleUpperCase('pt-BR') || '♡'; avatar.setAttribute('aria-hidden','true');
    const author = document.createElement('strong'); author.textContent = message.nome;
    heading.append(avatar,author);
    if (message.is_mine) { const badge = document.createElement('span'); badge.className = 'mural-mine'; badge.textContent = 'Seu recado'; heading.append(badge); }
    const text = document.createElement('p'); text.className = 'mural-card-text'; text.textContent = message.mensagem;
    const footer = document.createElement('div'); footer.className = 'mural-card-footer';
    const date = document.createElement('time'); date.dateTime = message.created_at; date.textContent = dateFormat.format(new Date(message.created_at));
    if (new Date(message.updated_at)-new Date(message.created_at)>1000) date.textContent += ' · editado';
    footer.append(date);
    if (message.is_mine) {
      const actions = document.createElement('div'); actions.className = 'mural-card-actions';
      const edit = document.createElement('button'); edit.type = 'button'; edit.textContent = 'Editar'; edit.addEventListener('click',() => beginEdit(message));
      const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = 'Excluir'; remove.addEventListener('click',() => deleteMessage(message,remove));
      actions.append(edit,remove); footer.append(actions);
    }
    card.append(heading,text,footer); get('mural-list').append(card);
  }
  async function loadMessages(reset = false) {
    if (loading && !reset) return;
    const generation = ++requestGeneration;
    listController?.abort(); listController = new AbortController(); loading = true;
    if (reset) { cursor = null; messages.clear(); get('mural-list').replaceChildren(); }
    const listStatus = get('mural-list-status'); listStatus.textContent = 'Carregando os carinhos…'; listStatus.hidden = false;
    get('mural-more').disabled = true; get('mural-refresh').disabled = true;
    try {
      const rows = await rpc('mural_list_recados',{p_owner_token:ownerToken,p_before:cursor?.created_at || null,p_before_id:cursor?.id || null,p_limit:PAGE_SIZE},listController.signal);
      if (generation !== requestGeneration) return;
      for (const row of rows) if (!messages.has(row.id)) { messages.set(row.id,row); renderMessage(row); }
      cursor = rows[rows.length-1] || cursor;
      listStatus.textContent = messages.size ? '' : 'O primeiro carinho pode ser o seu. Escreva uma mensagem para Elieth. ♡';
      listStatus.hidden = messages.size>0; get('mural-more').hidden = rows.length<PAGE_SIZE;
    } catch (error) {
      if (generation !== requestGeneration) return;
      listStatus.textContent = 'Os recados não carregaram. Toque em “Atualizar” para tentar novamente.'; listStatus.hidden = false;
    } finally {
      if (generation === requestGeneration) { loading = false; get('mural-more').disabled = false; get('mural-refresh').disabled = false; }
    }
  }
  form.addEventListener('submit',async event => {
    event.preventDefault(); if (submitting) return;
    const nome = nameField.value.trim().replace(/\s+/g,' '), mensagem = messageField.value.trim();
    nameField.setCustomValidity(nome ? '' : 'Escreva seu nome.'); messageField.setCustomValidity(mensagem ? '' : 'Escreva uma mensagem.');
    if (!form.reportValidity()) return;
    submitting = true; get('mural-submit').disabled = true; get('mural-cancel-edit').disabled = true; nameField.readOnly = messageField.readOnly = true;
    get('mural-submit').textContent = editingId ? 'Salvando…' : 'Enviando seu carinho…'; status('');
    const wasEditing = !!editingId;
    try {
      const params = {p_nome:nome,p_mensagem:mensagem,p_owner_token:ensureOwnerToken()};
      if (editingId) params.p_id = editingId;
      await rpc(editingId ? 'mural_update_recado' : 'mural_create_recado',params);
      try { localStorage.setItem(NAME_STORAGE,nome); } catch (error) { /* Optional convenience. */ }
      cancelEdit(); status(wasEditing ? 'Seu carinho foi atualizado. ♡' : 'Seu carinho já está no mural. Obrigado por celebrar Elieth! ♡');
      document.activeElement?.blur(); await loadMessages(true);
    } catch (error) {
      status(friendlyError(error),error.code === '23505' ? 'success' : 'error');
      if (error.code === '23505') await loadMessages(true);
    } finally {
      submitting = false; get('mural-submit').disabled = false; get('mural-cancel-edit').disabled = false; nameField.readOnly = messageField.readOnly = false;
      get('mural-submit').textContent = editingId ? 'Salvar alterações' : 'Publicar carinho ♡';
    }
  });
  nameField.addEventListener('input',() => nameField.setCustomValidity(''));
  messageField.addEventListener('input',() => { messageField.setCustomValidity(''); updateCounter(); });
  get('mural-cancel-edit').addEventListener('click',() => { cancelEdit(); status(''); });
  get('mural-refresh').addEventListener('click',() => loadMessages(true));
  get('mural-more').addEventListener('click',() => loadMessages());
  document.querySelectorAll('.mural-open').forEach(button => button.addEventListener('click',() => {
    resumeAfterClose = !audio.paused; if (resumeAfterClose) audio.pause();
    dialog.showModal(); fitViewport(); window.showControls?.(); loadMessages(true);
  }));
  get('close-mural').addEventListener('click',() => dialog.close());
  dialog.addEventListener('close',() => {
    window.showControls?.();
    if (resumeAfterClose && !document.hidden) audio.play().catch(() => window.showControls?.());
    resumeAfterClose = false;
  });
})();
