'use strict';
const $ = (s) => document.querySelector(s);
const config = window.HEART_CONFIG || {};
const configured = Boolean(config.supabaseUrl && config.supabaseAnonKey);
const base = (config.supabaseUrl || '').replace(/\/$/, '');
let session = null, admin = false, episodes = [], editingId = null, selectedFile = null;
let localStudioPreview = false;
let serverBaseline = Date.now(), monotonicBaseline = performance.now(), releaseRefreshAt = 0;
const serverNow = () => serverBaseline + performance.now() - monotonicBaseline;
const isReleased = e => e.available !== undefined ? e.available : e.status === 'published' && new Date(e.release_at).getTime() <= serverNow();
let previewUrl = null, currentEpisode = null, deletingId = null, saving = false, toastTimer;
const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const displayDate = (date) => new Intl.DateTimeFormat('de-DE', {dateStyle:'medium',timeStyle:'short'}).format(new Date(date));
const durationText = (value) => value ? `${Math.floor(value / 60)}:${String(Math.floor(value % 60)).padStart(2,'0')} Min.` : 'Hörspiel';
const statusOf = e => e.status === 'draft' ? 'Entwurf' : new Date(e.release_at).getTime() > serverNow() ? 'Geplant' : 'Veröffentlicht';
function message(text, error = false) { $('#form-message').textContent = text; $('#form-message').classList.toggle('error',error); }
function toast(text) { clearTimeout(toastTimer); $('#toast').textContent=text; $('#toast').hidden=false; toastTimer=setTimeout(()=>$('#toast').hidden=true,4500); }
async function request(path, {method='GET', body, token, headers={}}={}) {
  if(!configured) throw new Error('Bitte verbinde zuerst den Online-Speicher.');
  const response = await fetch(`${base}${path}`, {method, headers:{apikey:config.supabaseAnonKey, Authorization:`Bearer ${token || session?.access_token || config.supabaseAnonKey}`, ...(body ? {'Content-Type':'application/json'} : {}), ...headers}, body:body ? JSON.stringify(body) : undefined});
  const text=await response.text(); let data; try {data=text?JSON.parse(text):null;} catch {data=null;}
  if(!response.ok) {
    if(response.status===401) throw new Error('Deine Anmeldung ist abgelaufen. Bitte melde dich erneut an.');
    if(response.status===403) throw new Error('Du hast dafür keine Berechtigung. Bitte prüfe die Studio-Freigabe.');
    if(response.status===413) throw new Error('Die Datei ist für deinen Online-Speicher zu groß.');
    throw new Error(data?.message || data?.error_description || data?.error || 'Die Verbindung ist fehlgeschlagen. Bitte versuche es erneut.');
  }
  return data;
}
function setView(view, updateHash=true) {
  if(typeof view === 'boolean')view = view ? 'studio' : 'library';
  const studio = view === 'studio', home = view === 'home';
  $('#hero').hidden=!home; $('.header').hidden=home; $('#main').hidden=home;
  $('#library').hidden=view!=='library'; $('#studio').hidden=!studio;
  document.body.classList.toggle('on-home',home);
  $('#library-nav').classList.toggle('active',view==='library');
  $('#library-nav').setAttribute('aria-current',view==='library'?'page':'false');
  $('#profile-label').textContent=admin?'Mein Studio':'Admin-Login';
  if(updateHash){ const hash=home?'':studio?'#studio':'#folgen'; if(location.hash!==hash)history.pushState(null,'',location.pathname+location.search+hash); }
  $('#setup-note').hidden=configured;
  // The unconfigured site offers a clearly labelled preview, never a fake admin login.
  $('#login-form').hidden=admin || (!configured && localStudioPreview);
  $('#preview-studio').hidden=configured;
  $('#login-form button[type="submit"]').disabled=!configured;
  $('#login-form button[type="submit"]').textContent=configured?'Anmelden →':'Anmeldung nach Einrichtung verfügbar';
  $('#login-form input[name="email"]').disabled=!configured;$('#login-form input[name="password"]').disabled=!configured;
  $('#editor-area').hidden=!admin && (configured || !localStudioPreview); $('#logout').hidden=!admin;
  if(updateHash){window.scrollTo({top:0,behavior:'instant'}); if(!home)$('#main').focus({preventScroll:true});}
  if(studio && admin)refreshEpisodes();
}
function currentView(){return location.hash==='#studio'?'studio':location.hash==='#folgen'?'library':'home';}
function renderLibrary(){
  const visible=episodes.filter(e=>e.status==='published').sort((a,b)=>new Date(a.release_at)-new Date(b.release_at));
  const released=visible.filter(isReleased);
  $('#episode-count').textContent=released.length;
  $('#episodes').innerHTML=visible.length ? visible.map((e,i)=>{
    const ready=isReleased(e);
    return `<article class="episode-card ${ready?'':'upcoming'}"><div class="episode-art" aria-hidden="true">${String(i+1).padStart(2,'0')}<small>FOLGE</small></div><div class="episode-body"><div class="episode-meta">${durationText(e.duration)} · ${ready?'Für dich bereit':`Ab ${displayDate(e.release_at)}`}</div><h3>${escapeHtml(e.title)}</h3>${e.description?`<p>${escapeHtml(e.description)}</p>`:''}</div>${ready?`<div class="episode-actions"><button class="primary" data-play="${e.id}" aria-label="${escapeHtml(e.title)} abspielen"><span aria-hidden="true">▶</span> Abspielen</button><button class="outline" data-download="${e.id}" aria-label="${escapeHtml(e.title)} herunterladen"><span aria-hidden="true">↓</span> Download</button></div>`:'<span class="release-label">Bald für dich da<br>Noch nicht abspielbar</span>'}</article>`;
  }).join('') : `<div class="empty-library"><div class="empty-icon" aria-hidden="true">♡</div><div><p class="eyebrow">BALD GIBT ES ETWAS ZU HÖREN</p><h3>Deine erste Geschichte kommt bald.</h3><p>Sobald eine Folge bereit ist, findest du sie hier.<br>Zum Anhören, Herunterladen und Immer-wieder-Hören.</p></div></div>`;
  const next=visible.find(e=>!isReleased(e));
  $('#next-release').hidden=!next;
  if(next){$('#next-title').textContent=next.title;$('#next-date').textContent=`Für dich ab ${displayDate(next.release_at)} Uhr`;$('#next-release').dataset.release=next.release_at;}
  else delete $('#next-release').dataset.release;
  tickCountdown();
}
function tickCountdown(){
  const date=$('#next-release').dataset.release;if(!date)return;
  const remaining=Math.max(0,Math.ceil((new Date(date).getTime()-serverNow())/1000));
  const parts=[Math.floor(remaining/86400),Math.floor(remaining%86400/3600),Math.floor(remaining%3600/60),remaining%60];
  ['days','hours','minutes','seconds'].forEach((part,i)=>{$(`#count-${part}`).textContent=String(parts[i]).padStart(2,'0');});
  $('#release-pending').hidden=remaining>0;
  if(remaining===0 && configured && performance.now()-releaseRefreshAt>5000){releaseRefreshAt=performance.now();refreshEpisodes(true);}
}
function renderManage(){
  $('#manage-list').innerHTML=episodes.length ? episodes.map(e=>`<div class="manage-row"><div><strong>${escapeHtml(e.title)}</strong><small>${e.status==='draft'?'Noch nicht veröffentlicht':displayDate(e.release_at)} · ${durationText(e.duration)}</small></div><span class="badge">${statusOf(e)}</span><div class="row-actions"><button class="text-button" data-play="${e.id}" aria-label="${escapeHtml(e.title)} probehören">Anhören</button><button class="text-button" data-edit="${e.id}">Bearbeiten</button><button class="text-button" data-delete="${e.id}">Löschen</button></div></div>`).join('') : '<div class="empty-manage">Hier erscheinen deine Aufnahmen, sobald du dein erstes Hörspiel gespeichert hast.</div>';
}
async function refreshEpisodes(silent=false){
  if(!configured){renderLibrary();renderManage();return;}
  try {
    const feed=await request('/rest/v1/rpc/library_feed',{method:'POST',body:{}});
    serverBaseline=new Date(feed.server_now).getTime();monotonicBaseline=performance.now();
    episodes=admin ? await request('/rest/v1/episodes?select=*&order=release_at.desc.nullslast,created_at.desc') : feed.episodes;
    $('#connection-note').hidden=true;renderLibrary();renderManage();
  }catch(e){ if(!silent){$('#connection-note').textContent='Die Hörspiele konnten nicht geladen werden. '+e.message;$('#connection-note').hidden=false;if(!$('#studio').hidden)toast(e.message);} }
}
async function playEpisode(id){
  const e=episodes.find(e=>e.id===id);if(!e)return;
  if(!admin && (!isReleased(e)||!e.storage_path)){toast('Diese Folge ist noch nicht freigegeben.');return;}
  try {
    const data=await request(`/storage/v1/object/sign/audio/${encodeURIComponent(e.storage_path)}`,{method:'POST',body:{expiresIn:14400}});
    const url=data.signedURL || data.signedUrl;
    if(!url)throw new Error('Der Player konnte die Aufnahme nicht öffnen.');
    $('#upload-preview').pause();
    currentEpisode=e;$('#audio').src=url.startsWith('http')?url:`${base}/storage/v1${url}`;
    $('#playing-title').textContent=e.title;$('#player-error').textContent='';$('#player').hidden=false;document.body.classList.add('has-player');
    try {await $('#audio').play();} catch {toast('Tippe im Player auf Play, um zuzuhören.');}
    if('mediaSession' in navigator){navigator.mediaSession.metadata=new MediaMetadata({title:e.title,artist:'Herzfrequenz'});}
  }catch(err){toast(err.message);}
}
async function downloadEpisode(id,button){
  const e=episodes.find(e=>e.id===id);if(!e || !isReleased(e) || !e.storage_path)return;
  button.disabled=true;
  try{
    const data=await request(`/storage/v1/object/sign/audio/${encodeURIComponent(e.storage_path)}`,{method:'POST',body:{expiresIn:600}});
    const signed=data.signedURL || data.signedUrl;if(!signed)throw new Error('Der Download konnte nicht vorbereitet werden.');
    const url=new URL(signed.startsWith('http')?signed:`${base}/storage/v1${signed}`);
    const name=e.title.replace(/[\\/:*?"<>|]/g,'-').slice(0,110)+'.mp3';url.searchParams.set('download',name);
    const link=document.createElement('a');link.href=url.href;link.download=name;link.rel='noopener';document.body.append(link);link.click();link.remove();
    toast('Dein Download wurde angefordert.');
  }catch(err){toast(err.message);}finally{button.disabled=false;}
}
function updateRelease(){
  const mode=$('input[name="release"]:checked').value;
  $('#schedule-field').hidden=mode!=='scheduled';$('#release-date').required=mode==='scheduled';
  $('#save-button').textContent=editingId?'Änderungen speichern':mode==='draft'?'Entwurf speichern':mode==='scheduled'?'Hörspiel einplanen →':'Hörspiel veröffentlichen →';
}
async function selectFile(file){
  if(!file || saving)return;
  if(!/\.mp3$/i.test(file.name) || (file.type && !['audio/mpeg','audio/mp3','application/octet-stream'].includes(file.type))){message('Bitte wähle eine MP3-Datei aus.',true);return;}
  if(file.size>50*1024*1024){message('Die MP3 darf höchstens 50 MB groß sein.',true);return;}
  if(file.size===0){message('Diese Datei ist leer.',true);return;}
  selectedFile=file;if(previewUrl)URL.revokeObjectURL(previewUrl);previewUrl=URL.createObjectURL(file);
  $('#upload-preview').src=previewUrl;$('#upload-preview').hidden=false;$('#file-name').textContent=file.name;
  $('#file-hint').textContent=`${(file.size/1024/1024).toFixed(1)} MB · Zum Austauschen klicken`;
  if(!$('#episode-title').value)$('#episode-title').value=file.name.replace(/\.mp3$/i,'').replace(/[_-]/g,' ');
  message(configured?'':'Vorschau bereit. Die Aufnahme ist noch nicht online gespeichert.');
}
function resetEditor(){
  editingId=null;selectedFile=null;if(previewUrl){URL.revokeObjectURL(previewUrl);previewUrl=null;}
  $('#upload-preview').pause();$('#upload-preview').removeAttribute('src');$('#upload-preview').load();$('#upload-preview').hidden=true;
  $('#episode-form').reset();$('#file-name').textContent='Deine Geschichte beginnt hier';$('#file-hint').textContent='MP3 hier ablegen oder Datei auswählen';
  $('#editor-title').textContent='Ein neues Hörspiel';$('#cancel-edit').hidden=true;$('#audio-file').disabled=false;$('#dropzone').hidden=false;
  $('#upload-progress').hidden=true;message('');updateRelease();
}
function editEpisode(id){
  if(saving)return;
  const e=episodes.find(e=>e.id===id);if(!e)return;resetEditor();editingId=id;
  $('#editor-title').textContent='Hörspiel bearbeiten';$('#episode-title').value=e.title;$('#episode-description').value=e.description || '';
  const mode=e.status==='draft'?'draft':new Date(e.release_at)>new Date()?'scheduled':'now';
  $(`input[name="release"][value="${mode}"]`).checked=true;
  if(e.release_at){const date=new Date(e.release_at);$('#release-date').value=new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,16);}
  $('#dropzone').hidden=true;$('#audio-file').disabled=true;$('#cancel-edit').hidden=false;updateRelease();$('#episode-form').scrollIntoView({behavior:'smooth',block:'start'});$('#episode-title').focus({preventScroll:true});
}
function uploadAudio(path,file){
  return new Promise((resolve,reject)=>{
    const xhr=new XMLHttpRequest();xhr.open('POST',`${base}/storage/v1/object/audio/${encodeURIComponent(path)}`);
    xhr.setRequestHeader('apikey',config.supabaseAnonKey);xhr.setRequestHeader('Authorization',`Bearer ${session.access_token}`);xhr.setRequestHeader('Content-Type','audio/mpeg');xhr.setRequestHeader('x-upsert','false');
    xhr.timeout=20*60*1000;xhr.upload.onprogress=e=>{if(e.lengthComputable){$('#upload-progress').value=e.loaded/e.total*100;}};
    xhr.onload=()=>xhr.status>=200&&xhr.status<300?resolve():reject(new Error('Der Upload ist fehlgeschlagen. Bitte prüfe deine Verbindung und die Speicher-Einrichtung.'));
    xhr.onerror=()=>reject(new Error('Verbindung unterbrochen. Bitte versuche den Upload erneut.'));xhr.ontimeout=()=>reject(new Error('Der Upload hat zu lange gedauert. Bitte versuche es erneut.'));xhr.send(file);
  });
}
async function saveEpisode(event){
  event.preventDefault();if(saving)return;
  if(!configured){message('Zum Speichern muss dein Online-Speicher noch verbunden werden. Deine Datei kannst du oben bereits probehören.',true);return;}
  if(!admin){message('Bitte melde dich zuerst im Studio an.',true);return;}
  const mode=$('input[name="release"]:checked').value;
  const title=$('#episode-title').value.trim();if(!title){message('Bitte gib einen Titel ein.',true);return;}
  let date=mode==='scheduled'?new Date($('#release-date').value):new Date(serverNow());
  if(mode==='scheduled' && (!Number.isFinite(date.getTime()) || date.getTime()<=serverNow())){message('Wähle einen Zeitpunkt in der Zukunft.',true);return;}
  if(!editingId&&!selectedFile){message('Bitte wähle eine MP3-Datei aus.',true);return;}
  if(!editingId && (!Number.isFinite($('#upload-preview').duration) || $('#upload-preview').duration<=0)){message('Die MP3 wird noch geprüft oder ist nicht abspielbar. Bitte höre sie kurz zur Probe an.',true);return;}
  const original=episodes.find(e=>e.id===editingId);
  const id=editingId || crypto.randomUUID();const path=`${id}.mp3`;
  const record={title,description:$('#episode-description').value.trim(),status:mode==='draft'?'draft':'published',release_at:mode==='draft'?null:(editingId && mode==='now' && original?.status==='published' && new Date(original.release_at)<=new Date()?original.release_at:date.toISOString())};
  const uploadFile=selectedFile, uploadDuration=Math.max(1,Math.round($('#upload-preview').duration));
  let uploaded=false;let stored=false;saving=true;$('#episode-form').inert=true;$('#save-button').disabled=true;$('#episode-form').setAttribute('aria-busy','true');
  try {
    if(!editingId){
      message('Deine Aufnahme wird hochgeladen …');$('#upload-progress').hidden=false;$('#upload-progress').value=0;
      await uploadAudio(path,uploadFile);uploaded=true;
      Object.assign(record,{id,storage_path:path,duration:uploadDuration,file_size:uploadFile.size});
    }
    message('Dein Hörspiel wird gespeichert …');
    await request(`/rest/v1/episodes${editingId?`?id=eq.${id}`:''}`,{method:editingId?'PATCH':'POST',body:record,headers:{Prefer:'return=minimal'}});stored=true;
    resetEditor();await refreshEpisodes();toast(mode==='draft'?'Dein Entwurf ist gespeichert.':mode==='scheduled'?'Dein Hörspiel ist eingeplant.':'Dein Hörspiel ist jetzt in der Bibliothek.');
  }catch(e){
    // A timed-out POST may still have committed. Check before removing its audio.
    if(uploaded&&!stored){try{const existing=await request(`/rest/v1/episodes?id=eq.${id}&select=id`);if(existing.length){stored=true;resetEditor();await refreshEpisodes();message('Die Aufnahme wurde gespeichert. Du findest sie unter „Deine Aufnahmen“.');return;}await request('/storage/v1/object/audio',{method:'DELETE',body:{prefixes:[path]}});}catch{/* Keep inaccessible orphan rather than delete audio belonging to a committed record. */}}
    message(e.message,true);
  }finally{saving=false;$('#episode-form').inert=false;$('#save-button').disabled=false;$('#episode-form').removeAttribute('aria-busy');$('#upload-progress').hidden=true;}
}
async function deleteEpisode(){
  const e=episodes.find(e=>e.id===deletingId);if(!e)return;$('#delete-episode').disabled=true;
  try{
    // Hide first, then remove the binary, then the record. A failed operation remains retryable.
    await request(`/rest/v1/episodes?id=eq.${e.id}`,{method:'PATCH',body:{status:'draft',release_at:null}});
    await request('/storage/v1/object/audio',{method:'DELETE',body:{prefixes:[e.storage_path]}});
    await request(`/rest/v1/episodes?id=eq.${e.id}`,{method:'DELETE'});
    if(editingId===e.id)resetEditor();if(currentEpisode?.id===e.id)closePlayer();
    $('#confirm-dialog').close();toast('Das Hörspiel wurde gelöscht.');await refreshEpisodes();
  }catch(err){$('#confirm-dialog').close();toast(err.message);await refreshEpisodes();}finally{$('#delete-episode').disabled=false;deletingId=null;}
}
function closePlayer(){$('#audio').pause();$('#audio').removeAttribute('src');$('#audio').load();$('#player').hidden=true;document.body.classList.remove('has-player');currentEpisode=null;}
function publicUrl(){
  if(config.publicUrl)return config.publicUrl;
  if(['localhost','127.0.0.1',''].includes(location.hostname))return '';
  return location.origin+location.pathname;
}
function renderQR(){
  const input=$('#share-url').value.trim();let valid=false;
  try{const u=new URL(input);valid=['https:','http:'].includes(u.protocol) && !['localhost','127.0.0.1'].includes(u.hostname) && !u.username && !u.password;}catch{}
  $('#copy-link').disabled=!valid;$('#download-qr').disabled=!valid;$('#qr-code').innerHTML='';$('#share-message').textContent='';
  if(!valid)return;
  try{const qr=qrcode(0,'M');qr.addData(unescape(encodeURIComponent(input)));qr.make();$('#qr-code').innerHTML=qr.createSvgTag({cellSize:6,margin:24,scalable:true});$('#qr-code svg').setAttribute('aria-label','QR-Code zur Hörbibliothek');$('#qr-code svg').setAttribute('role','img');}
  catch{$('#share-message').textContent='Dieser Link ist zu lang für einen QR-Code.';$('#download-qr').disabled=true;}
}
function openShare(){
  $('#share-url').value=publicUrl();$('#share-note').textContent=publicUrl()?'Der Link bleibt gleich, auch wenn neue Hörspiele dazukommen.':'Sobald deine Website online ist, trägst du hier ihre öffentliche Adresse ein.';renderQR();$('#share-dialog').showModal();
}
$('#hero-play').onclick=()=>setView('library');$('#home-nav').onclick=()=>setView('home');
$('#library-nav').onclick=()=>setView('library');$('.brand').onclick=e=>{e.preventDefault();setView('home');};$('#studio-nav').onclick=()=>setView('studio');
window.addEventListener('hashchange',()=>setView(currentView(),false));
window.addEventListener('popstate',()=>setView(currentView(),false));
$('#audio-file').onchange=e=>selectFile(e.target.files[0]);
$('#dropzone').ondragover=e=>{e.preventDefault();$('#dropzone').classList.add('dragover');};
$('#dropzone').ondragleave=()=>$('#dropzone').classList.remove('dragover');
$('#dropzone').ondrop=e=>{e.preventDefault();$('#dropzone').classList.remove('dragover');selectFile(e.dataTransfer.files[0]);};
document.querySelectorAll('[name="release"]').forEach(el=>el.onchange=updateRelease);
$('#timezone-note').textContent=`Zeitzone: ${Intl.DateTimeFormat().resolvedOptions().timeZone}. Der Zeitpunkt wird weltweit eindeutig gespeichert.`;
$('#episode-form').onsubmit=saveEpisode;$('#cancel-edit').onclick=resetEditor;
$('#refresh-button').onclick=()=>refreshEpisodes();$('#share-button').onclick=openShare;$('#studio-share').onclick=openShare;
$('#preview-studio').onclick=()=>{localStudioPreview=true;setView('studio');};
$('#setup-details').onclick=()=>$('#setup-dialog').showModal();$('#close-player').onclick=closePlayer;
$('#upload-preview').onplay=()=>$('#audio').pause();
$('#upload-preview').onerror=()=>message('Die Datei konnte nicht als Audio geöffnet werden. Bitte wähle eine gültige MP3.',true);
$('#audio').onerror=()=>{if(currentEpisode)$('#player-error').textContent='Die Aufnahme konnte nicht geladen werden. Bitte öffne sie erneut über die Bibliothek.';};
$('#audio').onloadedmetadata=()=>{if(!currentEpisode)return;try{const time=Number(localStorage.getItem(`heart-progress-${currentEpisode.id}`));if(time>0&&time<$('#audio').duration-5)$('#audio').currentTime=time;}catch{}};
let lastProgress=0;$('#audio').ontimeupdate=()=>{if(currentEpisode&&Date.now()-lastProgress>5000){lastProgress=Date.now();try{localStorage.setItem(`heart-progress-${currentEpisode.id}`,String($('#audio').currentTime));}catch{}}};
$('#audio').onended=()=>{if(currentEpisode)try{localStorage.removeItem(`heart-progress-${currentEpisode.id}`);}catch{}};
document.addEventListener('click',e=>{const target=e.target.closest('button');if(!target)return;if(target.dataset.play)playEpisode(target.dataset.play);if(target.dataset.download)downloadEpisode(target.dataset.download,target);if(target.dataset.edit)editEpisode(target.dataset.edit);if(target.dataset.delete){deletingId=target.dataset.delete;$('#confirm-dialog').showModal();}});
$('#keep-episode').onclick=()=>$('#confirm-dialog').close();$('#delete-episode').onclick=deleteEpisode;
$('#share-url').oninput=renderQR;
$('#download-qr').onclick=()=>{const svg=$('#qr-code svg');if(!svg)return;const blob=new Blob([new XMLSerializer().serializeToString(svg)],{type:'image/svg+xml'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='herzfrequenz-qr-code.svg';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
$('#copy-link').onclick=async()=>{try{await navigator.clipboard.writeText($('#share-url').value.trim());$('#share-message').textContent='Link kopiert.';}catch{$('#share-url').select();$('#share-message').textContent='Markierten Link bitte kopieren.';}};
$('#login-form').onsubmit=async event=>{
  event.preventDefault();const button=$('#login-form button[type="submit"]');button.disabled=true;$('#login-error').textContent='';
  try{
    const fields=new FormData(event.target);session=await request('/auth/v1/token?grant_type=password',{method:'POST',body:{email:fields.get('email'),password:fields.get('password')}});
    admin=await request('/rest/v1/rpc/is_admin',{method:'POST',body:{}});
    if(!admin){session=null;throw new Error('Dieses Konto ist noch nicht für das Studio freigeschaltet.');}
    event.target.reset();setView(true);await refreshEpisodes();toast('Willkommen in deinem Studio.');
  }catch(err){session=null;admin=false;$('#login-error').textContent=err.message;}finally{button.disabled=false;}
};
$('#logout').onclick=async()=>{try{await request('/auth/v1/logout',{method:'POST'});}catch{}session=null;admin=false;resetEditor();closePlayer();episodes=[];renderManage();setView(true);await refreshEpisodes();};
setInterval(async()=>{if(session?.refresh_token){try{session=await request('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:{refresh_token:session.refresh_token}});}catch{session=null;admin=false;setView(true);toast('Bitte melde dich erneut an.');}}},40*60*1000);
setInterval(()=>{if(!document.hidden)refreshEpisodes(true);},30000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshEpisodes(true);});
setInterval(tickCountdown,1000);
setView(currentView(),false);renderLibrary();renderManage();refreshEpisodes();

// One welcome per tab visit. Navigation and the admin login stay immediate.
(() => {
  const intro = document.querySelector('#heart-intro');
  let seen = false;
  try { seen = sessionStorage.getItem('heart-welcome-v2') === 'seen'; } catch {}
  if (seen || location.hash === '#studio' || typeof intro.showModal !== 'function') return;
  let started = false, done = false, context, exitTimer;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finish = () => {
    if (done) return;
    done = true; clearTimeout(exitTimer);
    try { sessionStorage.setItem('heart-welcome-v2', 'seen'); } catch {}
    if (context) context.close().catch(() => {});
    intro.classList.add('leaving');
    setTimeout(() => { intro.close(); document.body.style.overflow = ''; (document.querySelector(location.hash === '#folgen' ? '#library-nav' : '#hero-play')).focus({preventScroll:true}); }, reduced ? 0 : 750);
  };
  document.querySelector('#intro-start').onclick = () => {
    if (started) return;
    started = true; intro.classList.add('beating');
    document.querySelector('#intro-caption').textContent = 'Meine Stimme. Ganz nah bei dir.';
    document.querySelector('#intro-skip').textContent = 'Direkt zur Seite →';
    exitTimer = setTimeout(finish, reduced ? 1100 : 2850);
    try {
      const AudioEngine = window.AudioContext || window.webkitAudioContext;
      if (!AudioEngine) return;
      context = new AudioEngine();
      context.resume().then(() => {
        if (done || context.state !== 'running') return;
        const now = context.currentTime;
        for (let beat = 0; beat < (reduced ? 1 : 3); beat++) {
          for (const [offset, loudness] of [[0,.20],[.19,.12]]) {
            const t = now + beat * .9 + offset;
            const tone = context.createOscillator(), volume = context.createGain();
            tone.type = 'sine'; tone.frequency.setValueAtTime(88,t); tone.frequency.exponentialRampToValueAtTime(42,t+.18);
            volume.gain.setValueAtTime(.0001,t); volume.gain.exponentialRampToValueAtTime(loudness,t+.018); volume.gain.exponentialRampToValueAtTime(.0001,t+.24);
            tone.connect(volume); volume.connect(context.destination); tone.start(t); tone.stop(t+.26);
          }
        }
      }).catch(() => {});
    } catch { /* The visual welcome also works without audio support. */ }
  };
  document.querySelector('#intro-skip').onclick = finish;
  intro.addEventListener('cancel', event => { event.preventDefault(); finish(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && started) finish(); });
  intro.showModal(); document.body.style.overflow = 'hidden';
})();
