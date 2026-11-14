'use strict';
/* Kopfnuss – Spielablauf am großen Bildschirm. Braucht common.js, pad.js, net.js und questions.js. */

const SETTINGS = {
  rounds: 3,          // Anzahl der Runden vor dem Finale
  perRound: 3,        // Fragen pro Runde
  time: 15,           // Sekunden pro Frage
  finaleTime: 12,     // Sekunden pro Frage im Finale
  summit: 10,         // Stufen bis zum Gipfel
  finaleMax: 25       // Notbremse: so viele Finalfragen höchstens
};

const KEYSETS = [['1', '2', '3', '4'], ['7', '8', '9', '0'], ['a', 's', 'd', 'f'], ['h', 'j', 'k', 'l']];
const DEFAULT_NAMES = ['Koralle', 'Sonne', 'Minze', 'Himmel'];
const keyLabel = k => k.toUpperCase();
const app = document.getElementById('app');

/* ---------- Sprecherstimme (Web Speech API, läuft im Browser) ---------- */
const Voice = {
  supported: 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window,
  on: pref('kopfnuss-stimme', true),
  voices: [],
  voice: null,
  onVoices: null,
  init() {
    if (!this.supported) return;
    const load = () => {
      this.voices = speechSynthesis.getVoices().filter(v => /^de/i.test(v.lang));
      let saved = null; try { saved = localStorage.getItem('kopfnuss-stimme-name'); } catch { /* egal */ }
      this.voice = this.voices.find(v => v.name === saved) ||
        this.voices.find(v => /natural|online|google/i.test(v.name)) || this.voices[0] || null;
      if (this.onVoices) this.onVoices();
    };
    load();
    if (speechSynthesis.addEventListener) speechSynthesis.addEventListener('voiceschanged', load);
    else speechSynthesis.onvoiceschanged = load;
  },
  choose(name) {
    this.voice = this.voices.find(v => v.name === name) || this.voice;
    try { localStorage.setItem('kopfnuss-stimme-name', name); } catch { /* egal */ }
  },
  /* Liest vor und meldet sich, wenn fertig. Notfalls nach geschätzter Sprechdauer. */
  say(text) {
    return new Promise(resolve => {
      if (!this.on || !this.supported || !text) return resolve();
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'de-DE';
      if (this.voice) u.voice = this.voice;
      u.rate = 1.05;
      let done = false;
      const t = setTimeout(() => fin(), 1200 + text.length * 85);
      function fin() { if (!done) { done = true; clearTimeout(t); resolve(); } }
      u.onend = fin; u.onerror = fin;
      setTimeout(() => speechSynthesis.speak(u), 60);
    });
  },
  stop() { if (this.supported) speechSynthesis.cancel(); }
};
Voice.init();

const LINES = {
  allRight: ['Alle richtig. Stark!', 'Das war wohl zu leicht für euch.', 'Respekt, das wussten alle.'],
  noneRight: ['Autsch. Das wusste keiner.', 'Keiner? Wirklich keiner?', 'Da müsst ihr wohl nochmal nachlesen.'],
  soloRight: ['Richtig!', 'Sehr gut.', 'Genau so.'],
  soloWrong: ['Leider falsch.', 'Knapp daneben.', 'Das war nichts.']
};

/* ---------- Eingaben: Tastatur, Klick und Handys landen alle hier ---------- */
let keyHandler = null;
document.addEventListener('keydown', e => {
  if (e.target.closest && e.target.closest('input, textarea, select')) return;
  if (!keyHandler) return;
  let k = e.key.toLowerCase();
  if (k === ' ' || k === 'spacebar') k = 'space';
  if (keyHandler(k) === true) e.preventDefault();
});

function show(html, cls = '') {
  unlisten();
  app.className = 'screen ' + cls;
  app.innerHTML = html;
  window.scrollTo(0, 0);
}

/* handler(spielerIndex, wert, quelle). Tastatur liefert den Platz 0–3, Handys ihren gewählten Wert. */
function listen(handler, extraKey) {
  keyHandler = k => {
    if (extraKey && extraKey(k)) return true;
    if (!S || S.remote) return false;
    let hit = false;
    S.players.forEach((p, i) => { const slot = p.keys.indexOf(k); if (slot >= 0) { handler(i, slot, 'key'); hit = true; } });
    return hit;
  };
  Remote.inputHandler = (pid, val) => handler(pid, val, 'remote');
}
function unlisten() { keyHandler = null; Remote.inputHandler = null; }

const WATCH = { k: 'wait', title: 'Schau auf den Bildschirm' };

/* "Weiter" per Klick, Enter, Leertaste oder vom Handy aus */
function waitContinue(btn, phoneView) {
  return new Promise(resolve => {
    let done = false;
    const go = () => {
      if (done) return;
      done = true; unlisten(); Sound.click();
      Remote.setAll(() => WATCH);
      resolve();
    };
    btn.addEventListener('click', go, { once: true });
    listen((pid, val, src) => { if (src === 'remote' && val === 'go') go(); },
      k => { if (k === 'enter' || k === 'space') { go(); return true; } });
    const label = btn.textContent.replace('Enter', '').trim();
    Remote.setAll(p => ({ ...(phoneView ? phoneView(p) : WATCH), go: label }));
    btn.focus({ preventScroll: true });
  });
}

/* ---------- Handys als Controller ---------- */
const ROOM_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const Remote = {
  conn: null, room: null, clients: [], views: {}, seq: 0, open: false, status: 'idle',
  inputHandler: null, onChange: null, hb: null, t: null,
  start() {
    this.stop();
    this.room = Array.from({ length: 4 }, () => pick(ROOM_LETTERS.split(''))).join('');
    this.clients = []; this.views = {}; this.open = true; this.status = 'connecting';
    this.conn = Net.connect(this.room, m => this.recv(m), s => {
      this.status = s;
      if (s === 'open') this.flush();
      if (this.onChange) this.onChange();
    });
    this.hb = setInterval(() => this.flush(), 2000);
  },
  stop() {
    if (this.conn) this.conn.close();
    this.conn = null; this.open = false; clearInterval(this.hb);
  },
  recolor() { this.clients.forEach((c, i) => { c.color = PLAYER_COLORS[i]; }); },
  recv(m) {
    if (!m || typeof m.cid !== 'string' || m.room !== this.room) return;
    const c = this.clients.find(x => x.cid === m.cid);
    if (m.t === 'join') {
      const name = String(m.name || '').trim().slice(0, 14) || 'Gast';
      let changed = false;
      if (c) { if (this.open && c.name !== name) { c.name = name; changed = true; } }
      else if (this.open && this.clients.length < 4) {
        this.clients.push({ cid: m.cid, name, color: PLAYER_COLORS[this.clients.length], fresh: true });
        this.views[m.cid] = { k: 'lobby', id: 'v' + (++this.seq) };
        Sound.lock();
        changed = true;
      }
      if (changed && this.onChange) this.onChange();
      this.flushSoon();
    } else if (m.t === 'hello') {
      this.flushSoon();
    } else if (m.t === 'in' && c) {
      const v = this.views[c.cid];
      if (!v || v.id !== m.id) return;   // veraltete oder doppelte Eingabe
      const pid = S && S.remote ? S.players.findIndex(p => p.cid === c.cid) : -1;
      if (pid >= 0 && this.inputHandler) this.inputHandler(pid, m.val);
    }
  },
  remove(cid) {
    this.clients = this.clients.filter(c => c.cid !== cid);
    delete this.views[cid];
    this.recolor();
    if (this.onChange) this.onChange();
    this.flushSoon();
  },
  setView(p, view) {
    if (!this.conn || !p.cid) return;
    this.views[p.cid] = { ...view, id: 'v' + (++this.seq) };
    this.flushSoon();
  },
  setAll(fn) { if (this.conn && S && S.remote) S.players.forEach(p => this.setView(p, fn(p))); },
  flushSoon() { clearTimeout(this.t); this.t = setTimeout(() => this.flush(), 30); },
  flush() {
    if (!this.conn) return;
    this.conn.send({
      t: 'state', room: this.room, open: this.open,
      players: this.clients.map(c => ({ cid: c.cid, name: c.name, color: c.color })),
      views: this.views
    });
  }
};

function controllerUrl() {
  const u = new URL('controller.html', location.href);
  u.search = '?raum=' + Remote.room + (Net.forceLocal ? '&lokal' : '');
  u.hash = '';
  return u.href;
}
function qrSvg(text) {
  if (typeof qrcode !== 'function') return '';
  try { const qr = qrcode(0, 'M'); qr.addData(text); qr.make(); return qr.createSvgTag({ cellSize: 6, margin: 2, scalable: true }); } catch { return ''; }
}

/* ---------- Fragen ziehen ---------- */
const BANK = window.KOPFNUSS_FRAGEN || {};
const CATEGORIES = Object.keys(BANK);
const HIST_KEY = 'kopfnuss-gestellt';
const TOTAL_QUESTIONS = CATEGORIES.reduce((n, c) => n + BANK[c].length, 0);
function loadHistory() { try { return new Set(JSON.parse(localStorage.getItem(HIST_KEY) || '[]')); } catch { return new Set(); } }
function saveHistory(set) { try { localStorage.setItem(HIST_KEY, JSON.stringify([...set])); } catch { /* egal */ } }
function availableIn(cat) { return BANK[cat].map((_, i) => `${cat}|${i}`).filter(id => !S.used.has(id)); }

function draw(cat) {
  const ids = availableIn(cat);
  if (!ids.length) return null;
  const fresh = ids.filter(id => !S.history.has(id));
  const id = pick(fresh.length ? fresh : ids);
  S.used.add(id); S.history.add(id);
  if (S.history.size > TOTAL_QUESTIONS * 0.85) S.history = new Set(S.used);
  saveHistory(S.history);
  const [text, ...answers] = BANK[cat][Number(id.split('|')[1])];
  return { cat, text, answers, correct: 0 };
}
function drawAny() {
  const cats = shuffle(CATEGORIES).filter(c => availableIn(c).length);
  return cats.length ? draw(cats[0]) : null;
}

/* ---------- Spielzustand ---------- */
let S = null;
let lastSetup = null;

function newGame(setup) {
  lastSetup = setup;
  const remote = setup.mode === 'remote';
  S = {
    remote,
    players: setup.players.map((pl, i) => ({
      id: i, name: pl.name, cid: pl.cid || null, color: pl.color || PLAYER_COLORS[i], keys: KEYSETS[i],
      score: 0, pending: [], climb: 0, correctCount: 0
    })),
    used: new Set(),
    history: loadHistory(),
    qCount: 0
  };
  if (remote) Remote.open = false;
  runGame();
}

async function runGame() {
  const solo = S.players.length === 1;
  for (let r = 1; r <= SETTINGS.rounds; r++) {
    const mult = r === SETTINGS.rounds ? 2 : 1;
    const title = r === SETTINGS.rounds ? 'Doppelte Punkte' : r === 1 ? 'Aufwärmen' : 'Jetzt wird’s ernst';
    await introScreen({
      kicker: `Runde ${r} von ${SETTINGS.rounds}`,
      title,
      text: solo ? `${SETTINGS.perRound} Fragen. Je schneller du richtig antwortest, desto mehr Punkte.`
        : `${SETTINGS.perRound} Fragen. Vorher dürft ihr euch gegenseitig Steine in den Weg legen.`,
      speak: `Runde ${r}. ${title}!`
    });
    if (!solo) await sabotagePhase();
    for (let q = 1; q <= SETTINGS.perRound; q++) {
      const cat = await categoryPhase(r, q);
      const question = draw(cat) || drawAny();
      if (!question) break;
      S.qCount++;
      await questionPhase(question, { time: SETTINGS.time, mult, effects: q === 1, label: `Runde ${r} · Frage ${q}/${SETTINGS.perRound}` });
    }
    await standings(r);
  }
  await finale();
}

/* ---------- Bildschirme ---------- */
function introScreen({ kicker, title, text, speak }) {
  show(`
    <div class="intro">
      <p class="kicker">${esc(kicker)}</p>
      <h1 class="intro-title">${esc(title)}</h1>
      <p class="intro-text">${esc(text)}</p>
      <button class="btn btn-go" id="go">Weiter <kbd>Enter</kbd></button>
    </div>`, 'is-intro');
  Voice.say(speak || title);
  return waitContinue($('#go'), () => ({ k: 'wait', title: kicker, text: title }));
}

const playerChip = p => `<span class="pchip" style="--pc:${p.color}">${esc(p.name)}</span>`;
const cardKey = (p, i) => S.remote ? '' : `<kbd style="--pc:${p.color}">${keyLabel(p.keys[i])}</kbd>`;

function chooserFor() {
  const min = Math.min(...S.players.map(p => p.score));
  const lowest = S.players.filter(p => p.score === min);
  return lowest[S.qCount % lowest.length];
}

/* Eine Person wählt aus Karten. Gibt den Index der gewählten Karte zurück. */
function choiceScreen({ kicker, title, hint, chooser, cards, phoneTitle, waitText, speak, cardClass = '', sound = 'click' }) {
  const ci = S.players.indexOf(chooser);
  show(`
    <div class="choose">
      <p class="kicker">${esc(kicker)}</p>
      <h2 class="choose-title">${title}</h2>
      <p class="choose-hint">${hint}</p>
      <div class="cards cards-${cards.length}">
        ${cards.map((c, i) => `
          <button class="card ${cardClass} ${c.cls || ''}" data-i="${i}" style="--pc:${c.color || chooser.color}">
            ${cardKey(chooser, i)}
            ${c.icon ? icon(c.icon, 'card-ic') : ''}
            <span class="card-title">${esc(c.label)}</span>
            <span class="card-sub">${esc(c.sub || '')}</span>
          </button>`).join('')}
      </div>
    </div>`, 'is-choose');
  if (speak) Voice.say(speak);
  Remote.setAll(p => p === chooser
    ? { k: 'pick', title: phoneTitle, options: cards.map(c => ({ label: c.label, sub: c.sub || '', icon: c.icon || '', color: c.color || '' })) }
    : { k: 'wait', title: `${chooser.name} wählt`, text: waitText });
  return new Promise(resolve => {
    let done = false;
    const choose = i => {
      if (done) return;
      done = true; unlisten();
      Sound[sound]();
      $$('.card')[i].classList.add('chosen');
      Remote.setAll(() => WATCH);
      setTimeout(() => resolve(i), 380);
    };
    $$('.card').forEach(b => b.addEventListener('click', () => choose(+b.dataset.i)));
    listen((pid, val) => { if (pid === ci && Number.isInteger(val) && val >= 0 && val < cards.length) choose(val); });
  });
}

async function categoryPhase(round, q) {
  const chooser = chooserFor();
  const cats = shuffle(CATEGORIES.filter(c => availableIn(c).length)).slice(0, 3);
  if (cats.length <= 1) return cats[0];
  const i = await choiceScreen({
    kicker: `Runde ${round} · Frage ${q}/${SETTINGS.perRound}`,
    title: `${playerChip(chooser)} wählt die Kategorie`,
    hint: S.players.length > 1 ? 'Wer hinten liegt, darf wählen.' : 'Such dir ein Thema aus.',
    chooser,
    cards: cats.map(c => ({ label: c, sub: `${availableIn(c).length} Fragen übrig` })),
    cardClass: 'cat-card',
    phoneTitle: 'Wähle die Kategorie',
    waitText: 'die nächste Kategorie.',
    speak: `${chooser.name}, wähle eine Kategorie.`
  });
  return cats[i];
}

/* Sabotage: jede Person wählt nacheinander. Schilde wirken gegen alles in dieser Runde. */
async function sabotagePhase() {
  const order = S.players.slice().sort((a, b) => a.score - b.score || a.id - b.id);
  const plans = [];
  for (const p of order) {
    const options = shuffle(Object.keys(SABOTAGES)).slice(0, 2).concat('schild');
    const oi = await choiceScreen({
      kicker: 'Sabotage',
      title: `${playerChip(p)} ist dran`,
      hint: S.remote ? 'Die Wahl passiert geheim auf dem Handy.' : 'Die anderen schauen weg. Oder auch nicht.',
      chooser: p,
      cards: options.map(o => o === 'schild'
        ? { label: 'Schild', sub: 'Wehrt in dieser Runde jede Falle gegen dich ab.', icon: 'schild', cls: 'shield' }
        : { label: SABOTAGES[o].name, sub: SABOTAGES[o].desc, icon: o }),
      cardClass: 'sabo-card',
      phoneTitle: 'Such dir eine Falle aus',
      waitText: 'eine Falle aus.',
      speak: `${p.name}, such dir eine Falle aus.`
    });
    const choice = options[oi];
    if (choice === 'schild') { plans.push({ from: p, type: 'schild' }); continue; }
    const targets = S.players.filter(t => t !== p);
    let target = targets[0];
    if (targets.length > 1) {
      const ti = await choiceScreen({
        kicker: SABOTAGES[choice].name,
        title: 'Wen soll es treffen?',
        hint: `${playerChip(p)} entscheidet.`,
        chooser: p,
        cards: targets.map(t => ({ label: t.name, sub: `${t.score.toLocaleString('de-DE')} Punkte`, color: t.color })),
        cardClass: 'target-card',
        phoneTitle: `Wen trifft ${SABOTAGES[choice].name}?`,
        waitText: 'ein Opfer aus.',
        sound: 'sabo'
      });
      target = targets[ti];
    }
    plans.push({ from: p, type: choice, target });
  }

  const shielded = new Set(plans.filter(x => x.type === 'schild').map(x => x.from));
  const lines = plans.map(x => {
    if (x.type === 'schild') return `<li>${playerChip(x.from)} <span class="arrow">hält ein</span> <b class="tag tag-shield">${icon('schild')}Schild</b> <span class="arrow">hoch</span></li>`;
    const blocked = shielded.has(x.target);
    x.blocked = blocked;
    if (!blocked && !x.target.pending.includes(x.type)) x.target.pending.push(x.type);
    return `<li class="${blocked ? 'blocked' : ''}">${playerChip(x.from)} <span class="arrow">schickt</span> <b class="tag">${icon(x.type)}${SABOTAGES[x.type].name}</b> <span class="arrow">an</span> ${playerChip(x.target)}${blocked ? ' <span class="block-note">abgewehrt</span>' : ''}</li>`;
  });
  Sound.sabo();
  show(`
    <div class="summary">
      <p class="kicker">Sabotage</p>
      <h2 class="choose-title">Das kommt auf euch zu</h2>
      <ul class="sabo-list">${lines.join('')}</ul>
      <p class="choose-hint">Die Fallen wirken bei der nächsten Frage.</p>
      <button class="btn btn-go" id="go">Zur Frage <kbd>Enter</kbd></button>
    </div>`, 'is-choose');
  const hits = plans.filter(x => x.target && !x.blocked).length;
  const blocks = plans.filter(x => x.blocked).length;
  Voice.say(hits ? `Mal sehen, wen es erwischt hat.${blocks ? ' Und ein Schild hat sogar etwas abgewehrt.' : ''}` : 'Alle Fallen wurden abgewehrt!');
  await waitContinue($('#go'), p => ({
    k: 'wait',
    title: p.pending.length ? 'Achtung!' : 'Glück gehabt',
    text: p.pending.length ? `Auf dich warten: ${p.pending.map(f => SABOTAGES[f].name).join(', ')}.` : 'Keine Falle für dich.'
  }));
}

/* ---------- Die Frage ---------- */
function climbTrack() {
  const steps = [];
  for (let s = 0; s <= SETTINGS.summit; s++) {
    const here = S.players.filter(p => Math.min(p.climb, SETTINGS.summit) === s);
    steps.push(`
      <div class="step ${s === SETTINGS.summit ? 'summit' : ''}" style="--h:${10 + s * 8}%">
        <div class="tokens">${here.map(p => `<span class="token" style="--pc:${p.color}" title="${esc(p.name)}">${esc(p.name.slice(0, 1).toUpperCase())}</span>`).join('')}</div>
        <div class="block">${s === SETTINGS.summit ? icon('gipfel') : s}</div>
      </div>`);
  }
  return `<div class="climb" aria-label="Gipfelsturm">${steps.join('')}</div>`;
}

async function questionPhase(q, opts) {
  const remote = S.remote;
  const limit = opts.time * 1000;
  const n = S.players.length;
  const baseOrder = shuffle([0, 1, 2, 3]);
  const st = S.players.map(p => {
    const fx = opts.effects ? p.pending.slice() : [];
    return {
      p, fx, pad: null, choice: null, at: null, done: false,
      order: remote ? shuffle([0, 1, 2, 3]) : baseOrder.slice(),
      deadline: fx.includes('zeitdieb') ? limit / 2 : limit
    };
  });

  show(`
    <div class="quiz ${remote ? 'quiz-remote' : ''}">
      <header class="qhead">
        <span class="label">${esc(opts.label)}</span>
        <span class="label cat">${esc(q.cat)}</span>
        ${opts.mult > 1 ? `<span class="label mult">× ${opts.mult} Punkte</span>` : ''}
      </header>
      ${opts.climb ? climbTrack() : ''}
      <h2 class="question">${esc(q.text)}</h2>
      ${remote ? `<div class="tv-answers waiting">${baseOrder.map(a => `<div class="tv-ans" data-a="${a}">${esc(q.answers[a])}</div>`).join('')}</div>` : ''}
      <div class="timer" aria-hidden="true"><div class="timer-fill"></div></div>
      <div class="panels panels-${n} ${remote ? 'panels-remote' : ''}">
        ${st.map((s, i) => `
          <section class="panel" data-p="${i}" style="--pc:${s.p.color}">
            <div class="ptop">
              <span class="pname">${esc(s.p.name)}</span>
              <span class="pscore">${opts.climb ? `Stufe ${s.p.climb}` : s.p.score.toLocaleString('de-DE')}</span>
            </div>
            ${s.fx.length ? `<div class="fxbar">${s.fx.map(f => `<span class="fx">${icon(f)}${SABOTAGES[f].name}</span>`).join('')}</div>` : ''}
            ${s.fx.includes('zeitdieb') ? '<div class="ptimer"><div></div></div>' : ''}
            ${remote ? '<div class="pstatus">Hör zu …</div>' : '<div class="answer-zone"><p class="listen">Hör zu …</p></div>'}
          </section>`).join('')}
      </div>
      <div class="after" hidden><button class="btn btn-go" id="go">Weiter <kbd>Enter</kbd></button></div>
    </div>`, 'is-quiz');

  const panels = $$('.panel');
  const fill = $('.timer-fill');
  const setStatus = (i, text, cls = '') => {
    const el = $('.pstatus', panels[i]);
    if (el) { el.textContent = text; el.className = 'pstatus ' + cls; }
  };

  // Erst vorlesen, dann geht die Zeit los
  Remote.setAll(() => ({ k: 'wait', title: 'Hör gut zu …', text: q.text }));
  if (Voice.on && Voice.supported) await Voice.say(q.text);
  else await wait(900);

  const start = performance.now();
  let raf = 0, finished = false, lastTick = -1;
  let resolveQ;
  const donePromise = new Promise(r => { resolveQ = r; });

  function record(i, answer) {
    const s = st[i];
    if (finished || s.done) return;
    const el = performance.now() - start;
    if (el > s.deadline) return;
    s.done = true; s.choice = answer; s.at = el;
    Sound.lock();
    if (remote) {
      setStatus(i, 'Eingeloggt', 'is-locked');
      panels[i].classList.add('locked');
      Remote.setView(s.p, { k: 'wait', title: 'Eingeloggt', text: 'Mal sehen, ob es stimmt.' });
    } else {
      s.pad.lock('Eingeloggt');
    }
    if (st.every(x => x.done)) setTimeout(finish, 350);
  }

  if (remote) {
    $('.tv-answers').classList.remove('waiting');
    st.forEach((s, i) => {
      setStatus(i, 'Überlegt …');
      Remote.setView(s.p, { k: 'q', text: q.text, answers: q.answers, order: s.order, fx: s.fx, limit: s.deadline, total: limit });
    });
  } else {
    st.forEach((s, i) => {
      s.pad = createPad({
        root: panels[i], zone: $('.answer-zone', panels[i]), answers: q.answers, order: s.order,
        keys: s.p.keys.map(keyLabel), fx: s.fx, limit, onAnswer: a => record(i, a)
      });
    });
  }

  listen((i, val, src) => {
    if (src === 'key') { if (st[i].pad) st[i].pad.press(val); }
    else if (Number.isInteger(val) && val >= 0 && val < 4) record(i, val);
  });

  function frame(now) {
    if (finished) return;
    const el = now - start;
    fill.style.transform = `scaleX(${Math.max(0, 1 - el / limit)})`;
    fill.classList.toggle('hurry', limit - el < 5000);
    const sec = Math.ceil((limit - el) / 1000);
    if (sec <= 5 && sec !== lastTick && sec > 0) { lastTick = sec; Sound.tick(); }
    st.forEach((s, i) => {
      if (s.pad) s.pad.tick(el);
      if (s.fx.includes('zeitdieb')) { const b = $('.ptimer div', panels[i]); if (b) b.style.transform = `scaleX(${Math.max(0, 1 - el / s.deadline)})`; }
      if (!s.done && el >= s.deadline) {
        s.done = true;
        if (s.pad) s.pad.lock('Zeit um');
        else {
          setStatus(i, 'Zeit um', 'is-late');
          panels[i].classList.add('locked');
          Remote.setView(s.p, { k: 'wait', title: 'Zeit um!', text: 'Zu langsam.' });
        }
      }
    });
    if (el >= limit || st.every(s => s.done)) return finish();
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);

  function finish() {
    if (finished) return;
    finished = true;
    cancelAnimationFrame(raf);
    unlisten();
    setTimeout(reveal, 250);
  }

  async function reveal() {
    st.forEach((s, i) => {
      panels[i].classList.add('revealed');
      if (s.pad) s.pad.reveal(q.correct, s.choice);
    });
    $('.timer').classList.add('done');
    if (remote) $$('.tv-ans').forEach(el => el.classList.add(+el.dataset.a === q.correct ? 'right' : 'dim'));

    const results = st.map(s => {
      const correct = s.choice === q.correct;
      const pts = correct ? Math.round((500 + 500 * Math.max(0, 1 - s.at / limit)) * opts.mult / 10) * 10 : 0;
      return { p: s.p, correct, at: s.at, pts, answered: s.choice !== null, choice: s.choice };
    });
    const rightOnes = results.filter(r => r.correct);
    const fastest = rightOnes.slice().sort((a, b) => a.at - b.at)[0];
    rightOnes.length ? Sound.good() : Sound.bad();

    if (opts.climb) {
      results.forEach(r => {
        r.move = r.correct ? (r === fastest && n > 1 ? 2 : 1) : (r.answered ? -1 : 0);
        r.p.climb = Math.max(0, r.p.climb + r.move);
      });
    } else {
      results.forEach(r => { r.p.score += r.pts; if (r.correct) r.p.correctCount++; });
    }
    if (opts.effects) S.players.forEach(p => { p.pending = []; });

    results.forEach((r, i) => {
      const panel = panels[i];
      const scoreEl = $('.pscore', panel);
      const pop = document.createElement('span');
      pop.className = 'pop ' + (r.correct ? 'pop-good' : 'pop-bad');
      if (opts.climb) {
        pop.textContent = r.move > 0 ? `+${r.move} Stufe${r.move > 1 ? 'n' : ''}` : r.move < 0 ? '−1 Stufe' : 'bleibt stehen';
        scoreEl.textContent = `Stufe ${r.p.climb}`;
      } else {
        pop.textContent = r.correct ? `+${r.pts}` : r.answered ? 'Falsch' : 'Keine Antwort';
        scoreEl.textContent = r.p.score.toLocaleString('de-DE');
      }
      $('.ptop', panel).insertBefore(pop, scoreEl);
      if (remote) setStatus(i, r.answered ? q.answers[r.choice] : 'Keine Antwort', r.correct ? 'is-right' : 'is-wrong');
    });
    if (opts.climb) { $('.climb').outerHTML = climbTrack(); Sound.climb(); }

    // Kommentar vom Sprecher
    const answerText = q.answers[q.correct];
    let comment;
    if (n === 1) comment = pick(rightOnes.length ? LINES.soloRight : LINES.soloWrong);
    else if (rightOnes.length === n) comment = pick(LINES.allRight);
    else if (!rightOnes.length) comment = pick(LINES.noneRight);
    else comment = `${fastest.p.name} war am schnellsten.`;
    Voice.say(`Richtig ist: ${answerText}. ${comment}`);

    $('.after').hidden = false;
    await waitContinue($('#go'), p => {
      const r = results.find(x => x.p === p);
      return {
        k: 'result', ok: r.correct, answer: answerText,
        text: opts.climb
          ? (r.move > 0 ? `+${r.move} Stufe${r.move > 1 ? 'n' : ''}. Du stehst auf Stufe ${p.climb}.` : r.move < 0 ? `Eine Stufe zurück. Stufe ${p.climb}.` : `Du bleibst auf Stufe ${p.climb}.`)
          : (r.correct ? `+${r.pts} Punkte` : r.answered ? 'Leider falsch.' : 'Keine Antwort.')
      };
    });
    resolveQ(results);
  }

  return donePromise;
}

/* ---------- Zwischenstand ---------- */
function rankList(players) {
  const max = Math.max(1, ...players.map(p => p.score));
  return players.slice().sort((a, b) => b.score - a.score).map((p, i) => `
    <li style="--pc:${p.color}">
      <span class="rank">${i + 1}.</span>
      <span class="rname">${esc(p.name)}</span>
      <span class="rbar"><span style="width:${Math.max(4, p.score / max * 100)}%"></span></span>
      <span class="rscore">${p.score.toLocaleString('de-DE')}</span>
    </li>`).join('');
}

function standings(r) {
  const last = r === SETTINGS.rounds;
  const sorted = S.players.slice().sort((a, b) => b.score - a.score);
  show(`
    <div class="summary">
      <p class="kicker">Nach Runde ${r}</p>
      <h2 class="choose-title">Zwischenstand</h2>
      <ol class="ranking">${rankList(S.players)}</ol>
      <p class="choose-hint">${last ? 'Gleich geht es zum Gipfel. Wer vorne liegt, startet weiter oben.' : 'Weiter geht’s mit der nächsten Runde.'}</p>
      <button class="btn btn-go" id="go">${last ? 'Zum Finale' : 'Nächste Runde'} <kbd>Enter</kbd></button>
    </div>`, 'is-choose');
  Voice.say(S.players.length > 1 ? `Zwischenstand. Vorne liegt ${sorted[0].name}.` : `Du hast ${sorted[0].score} Punkte.`);
  return waitContinue($('#go'), p => ({
    k: 'wait', title: `Platz ${sorted.indexOf(p) + 1}`, text: `${p.score.toLocaleString('de-DE')} Punkte`
  }));
}

/* ---------- Finale: Gipfelsturm ---------- */
async function finale() {
  const n = S.players.length;
  S.players.forEach(p => { p.climb = n - 1 - S.players.filter(o => o.score > p.score).length; });
  const ranked = S.players.slice().sort((a, b) => b.climb - a.climb);
  show(`
    <div class="intro">
      <p class="kicker">Finale</p>
      <h1 class="intro-title">Gipfelsturm</h1>
      <p class="intro-text">Wer zuerst Stufe ${SETTINGS.summit} erreicht, gewinnt. Richtig bringt eine Stufe, die schnellste richtige Antwort zwei. Wer falsch antwortet, rutscht eine Stufe ab.</p>
      ${climbTrack()}
      <p class="intro-text small">${n > 1 ? `Startplätze nach Punkten: ${ranked.map(p => `${esc(p.name)} Stufe ${p.climb}`).join(' · ')}` : 'Schaffst du es nach oben?'}</p>
      <button class="btn btn-go" id="go">Los <kbd>Enter</kbd></button>
    </div>`, 'is-intro');
  Voice.say('Das Finale. Gipfelsturm! Wer zuerst oben ist, gewinnt.');
  await waitContinue($('#go'), p => ({ k: 'wait', title: 'Gipfelsturm', text: `Du startest auf Stufe ${p.climb}.` }));

  let count = 0;
  while (!S.players.some(p => p.climb >= SETTINGS.summit) && count < SETTINGS.finaleMax) {
    const q = drawAny();
    if (!q) { S.used.clear(); continue; }
    count++;
    await questionPhase(q, { time: SETTINGS.finaleTime, mult: 1, climb: true, label: `Gipfelsturm · Frage ${count}` });
  }
  winner();
}

function winner() {
  const ps = S.players.slice().sort((a, b) => b.climb - a.climb || b.score - a.score);
  const champ = ps[0];
  Sound.win();
  show(`
    <div class="final">
      <canvas id="confetti" aria-hidden="true"></canvas>
      <p class="kicker">Gipfel erreicht</p>
      <h1 class="intro-title winner-name" style="--pc:${champ.color}">${esc(champ.name)}</h1>
      <p class="intro-text">${S.players.length > 1 ? 'gewinnt Kopfnuss!' : `Geschafft. ${champ.correctCount} richtige Antworten in der Vorrunde.`}</p>
      <ol class="ranking">${ps.map((p, i) => `
        <li style="--pc:${p.color}">
          <span class="rank">${i + 1}.</span>
          <span class="rname">${esc(p.name)}</span>
          <span class="rmeta">Stufe ${Math.min(p.climb, SETTINGS.summit)}</span>
          <span class="rscore">${p.score.toLocaleString('de-DE')}</span>
        </li>`).join('')}</ol>
      <div class="btn-row">
        <button class="btn btn-go" id="again">Nochmal mit denselben Leuten</button>
        <button class="btn btn-ghost" id="setup">${S.remote ? 'Zurück zur Lobby' : 'Neue Spielrunde einrichten'}</button>
      </div>
    </div>`, 'is-final');
  Voice.say(S.players.length > 1 ? `${champ.name} gewinnt Kopfnuss! Herzlichen Glückwunsch.` : 'Gipfel erreicht. Glückwunsch!');
  Remote.setAll(p => ({
    k: 'wait',
    title: p === champ ? 'Du hast gewonnen!' : `Platz ${ps.indexOf(p) + 1}`,
    text: p === champ ? 'Gipfel erreicht.' : `${champ.name} war zuerst oben.`
  }));
  $('#again').addEventListener('click', () => { Sound.click(); newGame(lastSetup); });
  $('#setup').addEventListener('click', () => {
    Sound.click();
    if (S.remote) {
      Remote.clients.forEach(c => { Remote.views[c.cid] = { k: 'lobby', id: 'v' + (++Remote.seq) }; });
      lobbyScreen();
    } else setupScreen();
  });
  keyHandler = k => { if (k === 'enter') { newGame(lastSetup); return true; } };
  confetti(champ.color);
}

function confetti(main) {
  const c = $('#confetti');
  if (!c || reduceMotion()) return;
  const ctx = c.getContext('2d');
  const W = c.width = c.offsetWidth * devicePixelRatio, H = c.height = c.offsetHeight * devicePixelRatio;
  const colors = [main, ...PLAYER_COLORS, '#ffffff'];
  const bits = Array.from({ length: 140 }, () => ({ x: Math.random() * W, y: -Math.random() * H * 0.6, vx: (Math.random() - .5) * 3, vy: 2 + Math.random() * 4, r: Math.random() * 6.3, s: (6 + Math.random() * 8) * devicePixelRatio, c: pick(colors) }));
  const t0 = performance.now();
  (function loop(now) {
    if (!document.body.contains(c)) return;
    ctx.clearRect(0, 0, W, H);
    bits.forEach(b => { b.x += b.vx; b.y += b.vy * devicePixelRatio; b.r += 0.1; ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.r); ctx.fillStyle = b.c; ctx.fillRect(-b.s / 2, -b.s / 4, b.s, b.s / 2); ctx.restore(); });
    if (now - t0 < 5000) requestAnimationFrame(loop); else ctx.clearRect(0, 0, W, H);
  })(t0);
}

/* ---------- Start: Spielart und Spieler einrichten ---------- */
let setupMode = 'local';

function setupScreen() {
  Remote.stop();
  S = null;
  let count = lastSetup && lastSetup.mode === 'local' ? lastSetup.players.length : 2;
  const names = lastSetup && lastSetup.mode === 'local' ? lastSetup.players.map(p => p.name) : DEFAULT_NAMES.slice();
  while (names.length < 4) names.push(DEFAULT_NAMES[names.length]);

  show(`
    <div class="setup">
      <div class="logo">
        <h1 class="wordmark">Kopf<span>nuss</span></h1>
        <p class="tagline">Das Quiz, bei dem du deine Freunde ausbremst.</p>
      </div>
      <div class="setup-grid">
        <section class="box">
          <h2 class="box-title">Wie wollt ihr spielen?</h2>
          <div class="modes" role="group" aria-label="Spielart">
            <button class="mode-btn" data-mode="local" aria-pressed="${setupMode === 'local'}">${icon('bildschirm')}<span><b>Ein Bildschirm</b><small>Antworten per Tippen oder Tastatur</small></span></button>
            <button class="mode-btn" data-mode="remote" aria-pressed="${setupMode === 'remote'}">${icon('handy')}<span><b>Handys als Controller</b><small>Jede Person spielt am eigenen Handy</small></span></button>
          </div>
          <div id="mode-local">
            <div class="count" role="group" aria-label="Anzahl der Spieler">
              ${[1, 2, 3, 4].map(c => `<button class="count-btn" data-c="${c}" aria-pressed="${c === count}">${c}</button>`).join('')}
            </div>
            <div class="players"></div>
          </div>
          <div id="mode-remote">
            <p class="mode-note">Der große Bildschirm zeigt einen QR-Code. Bis zu vier Leute scannen ihn mit der Handy-Kamera und geben ihren Namen ein. Antworten und Sabotagen wählt jede Person geheim auf dem eigenen Handy.</p>
            ${window.KOPFNUSS_VORSCHAU ? '<p class="mode-warn">In dieser Vorschau gibt es keinen Handy-Modus. Er läuft auf deiner Website unter /herzfrequenz/quiz/.</p>'
              : Net.available() ? '' : '<p class="mode-warn">Für den Handy-Modus fehlt die Supabase-Verbindung in config.js.</p>'}
          </div>
          <button class="btn btn-go btn-wide" id="start">Spiel starten</button>
        </section>
        <section class="box box-rules">
          <h2 class="box-title">So geht’s</h2>
          <ol class="rules">
            <li><b>${SETTINGS.rounds} Runden mit je ${SETTINGS.perRound} Fragen.</b> Jede Frage wird vorgelesen, dann läuft die Zeit. Schnell und richtig gibt bis zu 1.000 Punkte, in der letzten Runde das Doppelte.</li>
            <li><b>Sabotage vor jeder Runde.</b> Schick anderen Frost, Nebel, Kreisel, Kleckse, Zeitdieb oder Spiegel. Oder halte ein Schild hoch.</li>
            <li><b>Wer hinten liegt, wählt die Kategorie.</b></li>
            <li><b>Finale Gipfelsturm.</b> Wer vorne liegt, startet höher. Wer zuerst oben ist, gewinnt.</li>
          </ol>
          <div class="toggles">
            <label class="toggle"><input type="checkbox" id="sound" ${Sound.on ? 'checked' : ''}> Soundeffekte</label>
            <label class="toggle"><input type="checkbox" id="voice" ${Voice.on ? 'checked' : ''} ${Voice.supported ? '' : 'disabled'}> Fragen vorlesen</label>
            <div class="voice-row" id="voice-row">
              <label for="voice-pick" class="sr-only">Stimme</label>
              <select id="voice-pick"></select>
              <button class="btn btn-ghost btn-small" id="voice-test">Probehören</button>
            </div>
            ${Voice.supported ? '' : '<p class="rules-note">Dieser Browser kann nicht vorlesen.</p>'}
          </div>
        </section>
      </div>
    </div>`, 'is-setup');

  const renderPlayers = () => {
    $('.players').innerHTML = names.slice(0, count).map((nm, i) => `
      <div class="player-row" style="--pc:${PLAYER_COLORS[i]}">
        <span class="swatch"></span>
        <label class="sr-only" for="name-${i}">Name Spieler ${i + 1}</label>
        <input id="name-${i}" maxlength="14" value="${esc(nm)}" autocomplete="off">
        <span class="keys">${KEYSETS[i].map(k => `<kbd>${keyLabel(k)}</kbd>`).join('')}</span>
      </div>`).join('');
    $$('.players input').forEach((inp, i) => inp.addEventListener('input', () => { names[i] = inp.value; }));
  };
  const renderMode = () => {
    $('#mode-local').hidden = setupMode !== 'local';
    $('#mode-remote').hidden = setupMode !== 'remote';
    $('#start').textContent = setupMode === 'remote' ? 'Raum öffnen' : 'Spiel starten';
    $('#start').disabled = setupMode === 'remote' && (!Net.available() || !!window.KOPFNUSS_VORSCHAU);
    $$('.mode-btn').forEach(b => b.setAttribute('aria-pressed', b.dataset.mode === setupMode));
  };
  const renderVoices = () => {
    const sel = $('#voice-pick');
    if (!sel) return;
    sel.innerHTML = Voice.voices.map(v => `<option value="${esc(v.name)}" ${Voice.voice === v ? 'selected' : ''}>${esc(v.name)}</option>`).join('') || '<option>Standardstimme</option>';
    $('#voice-row').hidden = !Voice.supported || !Voice.on;
  };
  renderPlayers(); renderMode(); renderVoices();
  Voice.onVoices = renderVoices;

  $$('.mode-btn').forEach(b => b.addEventListener('click', () => { setupMode = b.dataset.mode; Sound.click(); renderMode(); }));
  $$('.count-btn').forEach(b => b.addEventListener('click', () => {
    count = +b.dataset.c; Sound.click();
    $$('.count-btn').forEach(x => x.setAttribute('aria-pressed', x === b));
    renderPlayers();
  }));
  $('#sound').addEventListener('change', e => { Sound.on = e.target.checked; Sound.init(); setPref('kopfnuss-sound', Sound.on); Sound.click(); });
  $('#voice').addEventListener('change', e => {
    Voice.on = e.target.checked; setPref('kopfnuss-stimme', Voice.on); renderVoices();
    if (Voice.on) Voice.say('Hallo! Ich lese euch die Fragen vor.'); else Voice.stop();
  });
  $('#voice-pick').addEventListener('change', e => { Voice.choose(e.target.value); Voice.say('So klinge ich.'); });
  $('#voice-test').addEventListener('click', () => Voice.say('Willkommen bei Kopfnuss! Wie viele Herzen hat ein Oktopus?'));
  $('#start').addEventListener('click', () => {
    Sound.init(); Sound.click();
    if (Voice.on) Voice.say(' ');   // schaltet die Stimme auf Handys und Tablets frei
    if (setupMode === 'remote') { lobbyScreen(); return; }
    const players = names.slice(0, count).map((nm, i) => ({ name: (nm || '').trim() || DEFAULT_NAMES[i] }));
    newGame({ mode: 'local', players });
  });
}

/* ---------- Lobby für den Handy-Modus ---------- */
function lobbyScreen() {
  if (!Remote.conn) Remote.start();
  Remote.open = true;
  S = null;
  Remote.flushSoon();
  const url = controllerUrl();
  const qr = qrSvg(url);
  show(`
    <div class="lobby">
      <section class="box lobby-join">
        <p class="kicker kicker-dark">Mit dem Handy beitreten</p>
        ${qr ? `<div class="qr" role="img" aria-label="QR-Code zum Beitreten">${qr}</div>` : ''}
        <p class="room-label">Raumcode</p>
        <p class="room-code">${Remote.room}</p>
        <p class="room-url">${esc(url)}</p>
      </section>
      <section class="lobby-side">
        <h2 class="choose-title">Wer ist dabei?</h2>
        <p class="net-status" id="net"></p>
        <ul class="lobby-list" id="list"></ul>
        <div class="btn-row">
          <button class="btn btn-go" id="start" disabled>Spiel starten</button>
          <button class="btn btn-ghost" id="back">Zurück</button>
        </div>
      </section>
    </div>`, 'is-lobby');

  const statusText = {
    connecting: 'Verbinde mit dem Server …',
    open: Net.forceLocal ? 'Testmodus: Öffne den Link links in einem zweiten Tab dieses Browsers.' : 'Verbunden. Scannt den Code mit der Handy-Kamera.',
    reconnecting: 'Verbindung unterbrochen. Verbinde neu …',
    error: 'Keine Verbindung zum Server. Prüfe im Supabase-Dashboard, ob dein Projekt aktiv ist. In einer Vorschau ohne Internetzugang funktioniert der Handy-Modus nicht.'
  };
  const render = () => {
    const net = $('#net'); if (!net) return;
    net.textContent = statusText[Remote.status] || '';
    net.className = 'net-status is-' + Remote.status;
    const slots = [];
    for (let i = 0; i < 4; i++) {
      const c = Remote.clients[i];
      slots.push(c
        ? `<li class="${c.fresh ? 'is-new' : ''}" style="--pc:${c.color}"><span class="swatch"></span><span class="lname">${esc(c.name)}</span><button class="remove" data-cid="${esc(c.cid)}" aria-label="${esc(c.name)} entfernen">×</button></li>`
        : '<li class="empty"><span class="swatch"></span><span class="lname">Wartet auf ein Handy …</span></li>');
    }
    $('#list').innerHTML = slots.join('');
    Remote.clients.forEach(c => { c.fresh = false; });
    $$('#list .remove').forEach(b => b.addEventListener('click', () => Remote.remove(b.dataset.cid)));
    $('#start').disabled = !Remote.clients.length;
  };
  Remote.onChange = render;
  render();

  $('#start').addEventListener('click', () => {
    Sound.click();
    Remote.onChange = null;
    newGame({ mode: 'remote', players: Remote.clients.map(c => ({ name: c.name, cid: c.cid, color: c.color })) });
  });
  $('#back').addEventListener('click', () => { Sound.click(); Remote.onChange = null; setupScreen(); });
}

if (!CATEGORIES.length) {
  show('<div class="intro"><h1 class="intro-title">Keine Fragen gefunden</h1><p class="intro-text">Die Datei questions.js fehlt oder ist leer.</p></div>');
} else {
  if (Net.forceLocal) setupMode = 'remote';
  setupScreen();
}
