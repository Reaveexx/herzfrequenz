'use strict';
/* Kopfnuss – Handy als Controller. Zeigt, was der große Bildschirm diesem Handy schickt, und meldet Eingaben zurück. */

const phone = document.getElementById('phone');
const params = new URLSearchParams(location.search);
const cleanRoom = s => String(s || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);

let room = cleanRoom(params.get('raum'));
let name = (() => { try { return localStorage.getItem('kopfnuss-name') || ''; } catch { return ''; } })();
const cid = (() => {
  const make = () => Math.random().toString(36).slice(2, 10);
  try { let c = sessionStorage.getItem('kopfnuss-cid'); if (!c) { c = make(); sessionStorage.setItem('kopfnuss-cid', c); } return c; } catch { return make(); }
})();

let conn = null, me = null, viewId = null, pending = null, netStatus = 'idle', lastState = 0;
let pad = null, raf = 0, wakeLock = null;

/* ---------- Querformat ---------- */
function goLandscape() {
  const el = document.documentElement;
  const lock = () => { try { const o = screen.orientation; if (o && o.lock) return o.lock('landscape').catch(() => {}); } catch { /* egal */ } };
  if (el.requestFullscreen && !document.fullscreenElement) el.requestFullscreen({ navigationUI: 'hide' }).then(lock).catch(() => {});
  else lock();
}
$('#rotate-ok').addEventListener('click', () => { document.body.classList.add('allow-portrait'); });
$('#rotate-full').addEventListener('click', goLandscape);

/* ---------- Grundgerüst ---------- */
function frame(body, { head = true } = {}) {
  cancelAnimationFrame(raf);
  if (pad) { pad.destroy(); pad = null; }
  phone.innerHTML = `
    ${head ? `<header class="ph-head">
      <span class="pchip">${esc(me ? me.name : name || 'Kopfnuss')}</span>
      <span class="ph-room">Raum ${esc(room)}</span>
      <span class="ph-dot is-${netStatus}" title="Verbindung"></span>
    </header>` : ''}
    <section class="ph-body">${body}</section>`;
  return $('.ph-body', phone);
}

function joinScreen(error = '') {
  frame(`
    <div class="ph-join">
      <h1 class="wordmark wordmark-small">Kopf<span>nuss</span></h1>
      <p class="ph-text">Mitspielen mit dem Handy</p>
      <form id="join" class="ph-form" novalidate>
        <label for="room">Raumcode</label>
        <input id="room" inputmode="text" autocapitalize="characters" autocomplete="off" maxlength="4" value="${esc(room)}" placeholder="z. B. KXTR">
        <label for="name">Dein Name</label>
        <input id="name" maxlength="14" autocomplete="nickname" value="${esc(name)}" placeholder="Wie sollen wir dich nennen?">
        ${error ? `<p class="ph-error">${esc(error)}</p>` : ''}
        <button class="btn btn-go btn-wide" type="submit">Mitspielen</button>
      </form>
    </div>`, { head: false });
  const roomInput = $('#room'), nameInput = $('#name');
  (room ? nameInput : roomInput).focus();
  $('#join').addEventListener('submit', e => {
    e.preventDefault();
    Sound.init();
    const r = cleanRoom(roomInput.value);
    const n = nameInput.value.trim().slice(0, 14);
    if (r.length !== 4) return joinScreen('Der Raumcode hat vier Buchstaben. Er steht auf dem großen Bildschirm.');
    if (!n) return joinScreen('Bitte gib einen Namen ein.');
    room = r; name = n;
    try { localStorage.setItem('kopfnuss-name', name); } catch { /* egal */ }
    start();
  });
}

function info(title, text = '') {
  frame(`<div class="ph-wait"><h2 class="ph-title">${esc(title)}</h2>${text ? `<p class="ph-text">${esc(text)}</p>` : ''}</div>`);
}

/* ---------- Verbindung ---------- */
function start() {
  if (conn) conn.close();
  me = null; viewId = null; pending = null;
  info('Verbinde …', 'Einen Moment.');
  conn = Net.connect(room, onMessage, s => {
    netStatus = s;
    const dot = $('.ph-dot', phone); if (dot) dot.className = 'ph-dot is-' + s;
    if (s === 'open') sendJoin();
    if (s === 'error' && !me) info('Keine Verbindung', 'Das Handy erreicht den Server nicht. Prüfe das Internet und versuche es nochmal.');
  });
  if (navigator.wakeLock && !wakeLock) navigator.wakeLock.request('screen').then(l => { wakeLock = l; l.addEventListener('release', () => { wakeLock = null; }); }).catch(() => {});
}

function send(msg) { if (conn) conn.send({ ...msg, room, cid }); }
function sendJoin() { if (!me) send({ t: 'join', name }); }

setInterval(() => {
  if (!conn) return;
  if (!me) sendJoin();
  if (pending && pending.id === viewId) send({ t: 'in', id: pending.id, val: pending.val });   // nochmal senden, bis der Bildschirm reagiert
  if (Date.now() - lastState > 4000) send({ t: 'hello' });
}, 1200);

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && conn) {
    send({ t: 'hello' });
    if (navigator.wakeLock && !wakeLock) navigator.wakeLock.request('screen').then(l => { wakeLock = l; }).catch(() => {});
  }
});

function onMessage(m) {
  if (!m || m.t !== 'state' || m.room !== room) return;
  lastState = Date.now();
  const found = (m.players || []).find(p => p.cid === cid);
  if (!found) {
    if (me) { me = null; viewId = null; document.body.classList.remove('joined'); info('Du wurdest entfernt', 'Frag am großen Bildschirm nach, ob du wieder mitspielen kannst.'); return; }
    if (!m.open) info('Das Spiel läuft schon', 'Warte, bis die Runde vorbei ist und alle zurück in der Lobby sind.');
    else if ((m.players || []).length >= 4) info('Der Raum ist voll', 'Es können höchstens vier Leute mitspielen.');
    return;
  }
  const wasNew = !me;
  me = found;
  document.body.classList.add('joined');
  document.documentElement.style.setProperty('--pc', me.color);
  const v = m.views && m.views[cid];
  if (!v) return;
  if (v.id !== viewId || wasNew) {
    viewId = v.id;
    pending = null;
    render(v);
  }
}

/* Eingabe an den Bildschirm schicken; wird bis zur Antwort wiederholt */
function input(val) {
  pending = { id: viewId, val };
  send({ t: 'in', id: viewId, val });
  if (navigator.vibrate) navigator.vibrate(25);
  Sound.click();
}

/* ---------- Ansichten ---------- */
function goButton(v) {
  return v.go ? `<button class="btn btn-go btn-wide ph-go" id="go">${esc(v.go)}</button>` : '';
}
function bindGo() {
  const b = $('#go');
  if (b) b.addEventListener('click', () => { b.disabled = true; b.textContent = 'Geht gleich weiter …'; input('go'); });
}

function render(v) {
  if (v.k === 'lobby') {
    frame(`
      <div class="ph-wait">
        <p class="kicker">Du bist dabei</p>
        <h2 class="ph-title ph-name">${esc(me.name)}</h2>
        <p class="ph-text">Warte, bis das Spiel am großen Bildschirm startet. Halte dein Handy quer.</p>
        <div class="btn-row">
          ${document.documentElement.requestFullscreen ? '<button class="btn btn-go" id="full">Vollbild</button>' : ''}
          <button class="btn btn-ghost" id="rename">Namen ändern</button>
        </div>
      </div>`);
    const full = $('#full'); if (full) full.addEventListener('click', goLandscape);
    $('#rename').addEventListener('click', () => { if (conn) conn.close(); conn = null; me = null; joinScreen(); });
    return;
  }

  if (v.k === 'wait') {
    frame(`
      <div class="ph-wait">
        <h2 class="ph-title">${esc(v.title || '')}</h2>
        ${v.text ? `<p class="ph-text">${esc(v.text)}</p>` : ''}
        ${goButton(v)}
      </div>`);
    bindGo();
    return;
  }

  if (v.k === 'pick') {
    if (navigator.vibrate) navigator.vibrate([40, 40, 40]);
    const body = frame(`
      <div class="ph-pick">
        <h2 class="ph-title">${esc(v.title)}</h2>
        <div class="ph-options">
          ${v.options.map((o, i) => `
            <button class="ph-opt" data-i="${i}" ${o.color ? `style="--oc:${o.color}"` : ''}>
              ${o.icon ? icon(o.icon, 'ph-ic') : ''}
              <span class="ph-opt-label">${esc(o.label)}</span>
              ${o.sub ? `<span class="ph-opt-sub">${esc(o.sub)}</span>` : ''}
            </button>`).join('')}
        </div>
      </div>`);
    $$('.ph-opt', body).forEach(b => b.addEventListener('click', () => {
      $$('.ph-opt', body).forEach(x => { x.disabled = true; });
      b.classList.add('chosen');
      input(+b.dataset.i);
    }));
    return;
  }

  if (v.k === 'q') {
    if (navigator.vibrate) navigator.vibrate(60);
    const body = frame(`
      <div class="ph-q">
        <div class="ph-qtop">
          <div class="timer ph-timer"><div class="timer-fill"></div></div>
          ${v.fx && v.fx.length ? `<div class="fxbar">${v.fx.map(f => `<span class="fx">${icon(f)}${esc(SABOTAGES[f] ? SABOTAGES[f].name : f)}</span>`).join('')}</div>` : ''}
        </div>
        <div class="answer-zone ph-zone"></div>
      </div>`, { head: false });
    const root = $('.ph-q', body);
    pad = createPad({
      root, zone: $('.ph-zone', body), answers: v.answers, order: v.order, fx: v.fx || [], limit: v.total || v.limit,
      onAnswer: a => { pad.lock('Gesendet'); input(a); }
    });
    const fill = $('.timer-fill', body);
    const t0 = performance.now();
    const tick = now => {
      const el = now - t0;
      fill.style.transform = `scaleX(${Math.max(0, 1 - el / v.limit)})`;
      fill.classList.toggle('hurry', v.limit - el < 5000);
      if (pad) pad.tick(el);
      if (el >= v.limit) { if (pad && !pad.done) pad.lock('Zeit um'); return; }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return;
  }

  if (v.k === 'result') {
    if (navigator.vibrate) navigator.vibrate(v.ok ? [30, 50, 30] : 200);
    frame(`
      <div class="ph-wait ph-result ${v.ok ? 'is-ok' : 'is-bad'}">
        <div class="ph-badge" aria-hidden="true">${v.ok ? '✓' : '✗'}</div>
        <h2 class="ph-title">${v.ok ? 'Richtig!' : 'Daneben'}</h2>
        <p class="ph-text">${esc(v.text || '')}</p>
        ${v.ok ? '' : `<p class="ph-text ph-answer">Richtig war: <b>${esc(v.answer)}</b></p>`}
        ${goButton(v)}
      </div>`);
    bindGo();
    return;
  }
}

if (room && name) start(); else joinScreen();
