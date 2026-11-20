'use strict';
const $ = (id) => document.getElementById(id);
const audio = $('soundtrack');
const VOICE_END = 120.3;
let photos = [], cues = [], sceneIndex = -1, captionIndex = -1, selectedPhoto = 0;
let starting = false, started = false, finished = false, dataReady = false, raf = 0;
const picked = ['2367ac94-e6b7-43d6-a345-f6b892683c45','IMG_0394','IMG_3381','IMG_9757','IMG_2732','IMG_1475','019a54f8-70cf-4e3d-aad5-abe55c7260b1','19b1eeb6-8fdf-45e4-85e0-da127a119696','IMG_0394','IMG_3446','IMG_2642','IMG_3424','IMG_3381','6c9a67f0-3fcf-4f7a-94bf-0f601bfe9dce','IMG_2564','IMG_1743','IMG_9636','2367ac94-e6b7-43d6-a345-f6b892683c45','IMG_1493','IMG_9150','IMG_1077','19b1eeb6-8fdf-45e4-85e0-da127a119696','IMG_3381','019a54f8-70cf-4e3d-aad5-abe55c7260b1'];
const sceneTimes = [0,5.5,11,18,23,27,33,40,47,51,55,61,66,71,77,83,87,91,96,100,103,108,112,116];
const chapterMarks = [
  [0,5,'Hoje é o seu dia.'],[27,33,'Olhar para frente.'],[40,46,'Tudo o que ainda vamos viver.'],
  [66,71,'Uma nova história.'],[91,97,'Você merece ser feliz.'],[112,120.3,'Eu te amo, mãe.']
];
const sceneSources = picked.map(name => `assets/imgs/${name}.webp`);
const motionPreference = matchMedia('(prefers-reduced-motion: reduce)');
const frames = new Map();
const TRANSITION_SECONDS = 1.45;
let controlsTimer = 0, noticeTimer = 0, keyboardNavigation = false, sharing = false;
const canFullscreen = !!((document.fullscreenEnabled && document.documentElement.requestFullscreen) || (document.webkitFullscreenEnabled && document.documentElement.webkitRequestFullscreen));
$('fullscreen').hidden = !canFullscreen;
function requestFullscreen() {
  if (!canFullscreen || document.fullscreenElement || document.webkitFullscreenElement) return;
  try {
    const root = document.documentElement;
    const request = root.requestFullscreen ? root.requestFullscreen({navigationUI:'hide'}) : root.webkitRequestFullscreen();
    Promise.resolve(request).catch(() => {}); // Permission refusal must not interrupt the gift.
  } catch (error) { /* Normal viewport remains available. */ }
}
function fullscreenUi() {
  const active = !!(document.fullscreenElement || document.webkitFullscreenElement);
  $('fullscreen').setAttribute('aria-label',active ? 'Sair da tela cheia' : 'Entrar em tela cheia');
  $('fullscreen').querySelector('use').setAttribute('href',active ? '#icon-exit-fullscreen' : '#icon-fullscreen');
  showControls();
}
$('fullscreen').addEventListener('click',() => {
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  else if (document.webkitFullscreenElement) document.webkitExitFullscreen?.();
  else requestFullscreen();
});
document.addEventListener('fullscreenchange',fullscreenUi);
document.addEventListener('webkitfullscreenchange',fullscreenUi);

function notify(text, timeout = 0) {
  clearTimeout(noticeTimer); $('notice').textContent = text; $('notice').hidden = !text;
  if (timeout) noticeTimer = setTimeout(() => { $('notice').hidden = true; },timeout);
}
function showControls() {
  clearTimeout(controlsTimer); $('experience').classList.remove('controls-hidden');
  if (!audio.paused && started && !document.querySelector('dialog[open]')) {
    controlsTimer = setTimeout(() => {
      if (keyboardNavigation && document.activeElement?.closest('.auto-controls')) return;
      $('experience').classList.add('controls-hidden');
    },3500);
  }
}
function parseTime(value) { const [h,m,s] = value.replace(',','.').split(':').map(Number); return h*3600+m*60+s; }
function parseSrt(text) {
  const result = [];
  for (const block of text.trim().split(/\r?\n\s*\r?\n/)) {
    const lines = block.split(/\r?\n/);
    const range = lines[1].split(' --> ').map(parseTime);
    const words = lines.slice(2).join(' ').split(/\s+/);
    const chunks = []; let current = '';
    for (const word of words) {
      if ((current + ' ' + word).length > 72 && current) { chunks.push(current); current = ''; }
      current += (current ? ' ' : '') + word;
      if (/[.!?:]$/.test(word) && current.length > 34) { chunks.push(current); current = ''; }
    }
    if (current) chunks.push(current);
    const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    let position = range[0];
    chunks.forEach((chunk, i) => {
      const end = i === chunks.length-1 ? range[1] : position + (range[1]-range[0])*chunk.length/total;
      result.push({start:position,end,text:chunk}); position = end;
    });
  }
  return result;
}
async function loadData() {
  try {
    const responses = await Promise.all([fetch('photo-list.json'),fetch('assets/transcript/narracao.srt')]);
    if (responses.some(response => !response.ok)) throw new Error('Conteúdo indisponível');
    photos = await responses[0].json(); cues = parseSrt(await responses[1].text());
    await getFrame(0).loaded;
    getFrame(1);
    dataReady = true;
    $('gallery-count').textContent = `${photos.length} lembranças para guardar`;
    $('start-label').textContent = 'Iniciar homenagem'; $('start').disabled = false;
  } catch (error) {
    $('start-label').textContent = 'Tentar carregar novamente'; $('start').disabled = false;
    notify('Não foi possível carregar seu presente. Confira a conexão e toque para tentar novamente.');
  }
}
function getFrame(index) {
  if (frames.has(index)) return frames.get(index);
  const node = document.createElement('div');
  const duet = [4,15,19].includes(index);
  node.className = 'scene-frame' + (duet ? ' duet' : ''); node.dataset.scene = index;
  const mat = document.createElement('div'); mat.className = 'photo-mat'; node.append(mat);
  const light = document.createElement('div'); light.className = 'scene-light'; node.append(light);
  const entry = {node,mat,light,ready:false,loaded:null}; frames.set(index,entry);
  const sources = duet ? [sceneSources[index],sceneSources[(index+1)%sceneSources.length]] : [sceneSources[index]];
  entry.loaded = Promise.all(sources.map(source => new Promise(resolve => {
    const img = new Image(); img.className = 'scene-photo'; img.alt = 'Uma lembrança especial de Elieth e sua família'; img.decoding = 'async';
    img.onload = () => {
      const decoded = img.decode ? img.decode().catch(() => {}) : Promise.resolve();
      decoded.then(resolve);
    };
    img.onerror = () => { img.alt = 'Esta lembrança não carregou. Confira sua conexão.'; resolve(); };
    img.src = source;
    if (duet) { const card = document.createElement('div'); card.className = 'photo-card'; card.append(img); mat.append(card); }
    else mat.append(img);
  }))).then(() => { entry.ready = true; if (started) update(); });
  return entry;
}
const clamp = value => Math.max(0,Math.min(1,value));
function ease(value) { const n = clamp(value); return n*n*(3-2*n); }
function positionPhoto(entry,index,t) {
  const duration = (sceneTimes[index+1] || VOICE_END)-sceneTimes[index];
  const phase = clamp((t-sceneTimes[index])/duration);
  const direction = index%2 ? -1 : 1;
  const scale = motionPreference.matches ? 1 : .955 + .04*phase;
  const angle = motionPreference.matches ? 0 : direction*(-.25+.5*phase);
  entry.mat.style.transform = `scale(${scale}) rotate(${angle}deg)`;
}
function renderScene(t) {
  let index = 0;
  for (let i = 0; i < sceneTimes.length; i++) if (t >= sceneTimes[i]) index = i;
  const current = getFrame(index);
  if (index+1 < sceneTimes.length) getFrame(index+1);
  // Keep the last fully decoded photo visible while the next one loads.
  if (!current.ready) return;
  const transition = motionPreference.matches ? 1 : ease((t-sceneTimes[index])/TRANSITION_SECONDS);
  const previous = index>0 && transition<1 ? getFrame(index-1) : null;
  const active = [];
  if (previous?.ready) {
    active.push(previous.node); previous.node.style.opacity = '1'; previous.node.style.clipPath = 'none'; previous.light.style.opacity = '0';
    positionPhoto(previous,index-1,t);
  }
  active.push(current.node);
  for (const child of [...$('scene').children]) if (!active.includes(child)) child.remove();
  for (const node of active) if (node.parentNode !== $('scene')) $('scene').append(node);
  // A node reused after a backward seek must still be above its predecessor.
  if ($('scene').lastElementChild !== current.node) $('scene').append(current.node);
  const reveal = previous?.ready ? transition : 1;
  current.node.style.opacity = String(index%4 === 0 ? reveal : Math.min(1,reveal*2));
  switch (index%4) {
    case 1: current.node.style.clipPath = reveal>=1 ? 'none' : `inset(0 ${(1-reveal)*100}% 0 0)`; break;
    case 2: current.node.style.clipPath = reveal>=1 ? 'none' : `circle(${reveal*75}% at 50% 50%)`; break;
    case 3: current.node.style.clipPath = reveal>=1 ? 'none' : `inset(${(1-reveal)*50}% 0 ${(1-reveal)*50}% 0)`; break;
    default: current.node.style.clipPath = 'none';
  }
  current.light.style.opacity = motionPreference.matches ? '0' : String(Math.sin(reveal*Math.PI)*.8);
  current.light.style.transform = `translateX(${-80+reveal*160}%)`;
  positionPhoto(current,index,t);
  if (sceneIndex !== index) sceneIndex = index;
  for (const [key,entry] of frames) if (key<index-1 || key>index+1) { entry.node.remove(); frames.delete(key); }
}
function playbackUi() {
  $('pause').querySelector('use').setAttribute('href',audio.paused ? '#icon-play' : '#icon-pause');
  $('pause').setAttribute('aria-label',audio.paused ? 'Continuar homenagem' : 'Pausar homenagem');
  $('stage-toggle').setAttribute('aria-label',audio.paused ? 'Continuar homenagem' : 'Pausar homenagem');
  document.querySelector('.tap-hint').textContent = audio.paused ? 'toque na foto para continuar' : 'toque na foto para pausar';
  $('experience').classList.toggle('is-paused',audio.paused);
  showControls();
}
function update() {
  const t = audio.currentTime;
  const end = t >= VOICE_END;
  if (end !== finished) {
    finished = end; $('ending').hidden = !end; $('caption-area').hidden = end;
    $('chapter').hidden = end; $('stage-toggle').hidden = end;
    showControls();
  }
  if (!end) {
    renderScene(t);
    const cueIndex = cues.findIndex(cue => t >= cue.start && t < cue.end);
    if (cueIndex !== captionIndex) {
      captionIndex = cueIndex; $('caption').textContent = cues[cueIndex]?.text || '';
      if (!motionPreference.matches) $('caption').animate([{opacity:0,transform:'translateY(4px)'},{opacity:1,transform:'translateY(0)'}],{duration:300});
    }
    $('chapter').textContent = chapterMarks.find(([start,end]) => t >= start && t < end)?.[2] || '';
  }
  const progress = Math.min(t,VOICE_END);
  $('progress-fill').style.width = `${progress/VOICE_END*100}%`;
  $('player').querySelector('[role=progressbar]').setAttribute('aria-valuenow',Math.floor(progress));
  const timeLabel = end ? '♫ <span>A música continua</span>' : `${Math.floor(t/60)}:${String(Math.floor(t%60)).padStart(2,'0')} <span>/ 2:00</span>`;
  if ($('time').innerHTML !== timeLabel) $('time').innerHTML = timeLabel;
}
function tick() { update(); if (!audio.paused) raf = requestAnimationFrame(tick); }
async function start() {
  if (!dataReady) { $('start').disabled = true; return loadData(); }
  if (starting) return;
  starting = true; $('start').disabled = true; $('start-label').textContent = 'Abrindo seu presente…';
  try {
    // play() runs directly from the tap, before any network-dependent await.
    if (audio.error) audio.load();
    const playback = audio.play();
    requestFullscreen(); // Same tap as playback; do not await before requesting fullscreen.
    await playback;
    started = true; $('cover').hidden = true; $('presentation').hidden = false; notify('');
    update(); playbackUi();
  } catch (error) {
    notify('O som não iniciou. Confira o volume do iPhone e toque em “Iniciar homenagem” para tentar novamente.');
  } finally { starting = false; $('start').disabled = false; $('start-label').textContent = 'Iniciar homenagem'; }
}
$('start').addEventListener('click',start);
audio.addEventListener('play',() => { cancelAnimationFrame(raf); tick(); playbackUi(); });
audio.addEventListener('pause',() => { cancelAnimationFrame(raf); update(); playbackUi(); });
audio.addEventListener('timeupdate',update);
audio.addEventListener('seeked',update);
audio.addEventListener('error',() => { notify('O áudio não carregou. Confira sua conexão e toque para tentar novamente.'); $('start-label').textContent = 'Tentar novamente'; });
audio.addEventListener('ended',() => {
  // Only the instrumental section repeats; the spoken letter never restarts itself.
  audio.currentTime = 126;
  audio.play().catch(() => notify('Toque no botão de continuar para ouvir a música.'));
});
function togglePlayback() {
  showControls();
  if (audio.paused) audio.play().then(() => notify('')).catch(() => notify('Toque novamente para continuar o áudio.'));
  else audio.pause();
}
$('pause').addEventListener('click',togglePlayback);
$('stage-toggle').addEventListener('click',togglePlayback);
$('ending').addEventListener('click',event => { if (!event.target.closest('button,a')) togglePlayback(); });
$('presentation').addEventListener('pointermove',event => { if (event.pointerType === 'mouse') showControls(); },{passive:true});
$('presentation').addEventListener('pointerdown',() => { keyboardNavigation = false; showControls(); },{passive:true});
$('presentation').addEventListener('focusin',showControls);
document.addEventListener('keydown',event => {
  if (event.key === 'Tab') { keyboardNavigation = true; showControls(); }
  if (event.code === 'Space' && started && !document.querySelector('dialog[open]') && !event.target.closest('button,input,a')) { event.preventDefault(); togglePlayback(); }
});
$('music').addEventListener('click',() => {
  audio.muted = !audio.muted;
  $('music').querySelector('use').setAttribute('href',audio.muted ? '#icon-muted' : '#icon-volume');
  $('music').setAttribute('aria-pressed',String(audio.muted));
  $('music').setAttribute('aria-label',audio.muted ? 'Ligar o som' : 'Desligar o som');
  showControls();
});
$('captions').addEventListener('change',() => {
  const enabled = $('captions').checked;
  $('captions-label').textContent = enabled ? 'Desativar legendas' : 'Ativar Legendas';
  $('caption').style.visibility = enabled ? 'visible' : 'hidden';
  showControls();
});
$('replay').addEventListener('click',() => {
  audio.currentTime = 0; sceneIndex = -1; captionIndex = -1; update();
  audio.play().catch(() => notify('Toque em continuar para recomeçar.'));
});
document.addEventListener('visibilitychange',() => { if (document.hidden && started) audio.pause(); });
motionPreference.addEventListener?.('change',update);

async function sharePage() {
  if (sharing) return;
  const data = {title:'Feliz aniversário, Elieth!',text:'21 de novembro. Um presente feito com todo o meu amor.',url:document.querySelector('link[rel=canonical]').href};
  sharing = true;
  try {
    // Keep the native share call within the original user gesture on iPhone.
    if (navigator.share) await navigator.share(data);
    else {
      $('share-fallback').showModal(); $('share-url').value = data.url;
      $('share-url').focus(); $('share-url').select();
    }
  } catch (error) {
    if (error.name !== 'AbortError') { $('share-fallback').showModal(); $('share-url').select(); }
  } finally { sharing = false; showControls(); }
}
document.querySelectorAll('.share-page').forEach(button => button.addEventListener('click',sharePage));
$('copy-link').addEventListener('click',async () => {
  try {
    if (navigator.clipboard?.writeText) await navigator.clipboard.writeText($('share-url').value);
    else { $('share-url').select(); if (!document.execCommand('copy')) throw new Error('Copy unavailable'); }
    $('share-fallback').close(); notify('Link copiado com carinho. ♡',3500);
  } catch (error) { $('share-url').focus(); $('share-url').select(); $('copy-link').textContent = 'Selecione o link e copie'; }
});
$('close-share').addEventListener('click',() => $('share-fallback').close());
$('share-fallback').addEventListener('close',showControls);
document.querySelectorAll('.download-video').forEach(link => link.addEventListener('click',() => { showControls(); }));

// Windowed grid: rows outside the viewport + overscan are removed from the DOM.
const gallery = $('gallery'), scroller = $('gallery-scroll'), grid = $('gallery-grid');
let galleryRange = '', galleryFrame = 0;
function renderGallery(force = false) {
  if (!gallery.open || !photos.length) return;
  const gap = 10, columns = 2, width = scroller.clientWidth;
  const cellWidth = (width-gap)/columns, cellHeight = Math.round(cellWidth*1.26), rowHeight = cellHeight+gap;
  const rows = Math.ceil(photos.length/columns);
  const first = Math.max(0,Math.floor(scroller.scrollTop/rowHeight)-2);
  const last = Math.min(rows,Math.ceil((scroller.scrollTop+scroller.clientHeight)/rowHeight)+2);
  const key = `${first}:${last}:${width}`;
  if (!force && key === galleryRange) return;
  galleryRange = key; grid.style.height = `${rows*rowHeight-gap}px`;
  const wanted = new Set();
  for (let index=first*columns; index<Math.min(last*columns,photos.length); index++) {
    wanted.add(String(index));
    let button = grid.querySelector(`[data-index="${index}"]`);
    if (!button) {
      button = document.createElement('button'); button.className = 'gallery-item'; button.dataset.index = index;
      button.setAttribute('aria-label',`Ampliar lembrança ${index+1} de ${photos.length}`);
      const image = document.createElement('img'); image.src = photos[index]; image.alt = `Lembrança ${index+1}`;
      image.loading = 'lazy'; image.decoding = 'async'; button.append(image);
      button.addEventListener('click',() => openPhoto(index)); grid.append(button);
    }
    Object.assign(button.style,{width:`${cellWidth}px`,height:`${cellHeight}px`,left:`${(index%columns)*(cellWidth+gap)}px`,top:`${Math.floor(index/columns)*rowHeight}px`});
  }
  for (const item of [...grid.children]) if (!wanted.has(item.dataset.index)) item.remove();
}
scroller.addEventListener('scroll',() => { cancelAnimationFrame(galleryFrame); galleryFrame = requestAnimationFrame(() => renderGallery()); },{passive:true});
new ResizeObserver(() => renderGallery(true)).observe(scroller);
document.querySelectorAll('.gallery-open').forEach(button => button.addEventListener('click',() => { gallery.showModal(); showControls(); renderGallery(true); }));
$('close-gallery').addEventListener('click',() => gallery.close());
gallery.addEventListener('close',() => { grid.replaceChildren(); galleryRange = ''; showControls(); });
function openPhoto(index) { selectedPhoto = (index+photos.length)%photos.length; $('full-photo').src = photos[selectedPhoto]; $('full-photo').alt = `Lembrança ${selectedPhoto+1} de Elieth e sua família`; $('photo-count').textContent = `${selectedPhoto+1} / ${photos.length}`; if (!$('lightbox').open) $('lightbox').showModal(); }
$('close-photo').addEventListener('click',() => $('lightbox').close());
$('previous-photo').addEventListener('click',() => openPhoto(selectedPhoto-1));
$('next-photo').addEventListener('click',() => openPhoto(selectedPhoto+1));
$('lightbox').addEventListener('keydown',event => { if (event.key === 'ArrowLeft') openPhoto(selectedPhoto-1); if (event.key === 'ArrowRight') openPhoto(selectedPhoto+1); });
let touchStart = 0;
$('full-photo').addEventListener('touchstart',event => { touchStart = event.changedTouches[0].clientX; },{passive:true});
$('full-photo').addEventListener('touchend',event => { const delta = event.changedTouches[0].clientX-touchStart; if (Math.abs(delta)>60) openPhoto(selectedPhoto+(delta<0 ? 1 : -1)); },{passive:true});
loadData();
