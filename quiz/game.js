'use strict';
/* Kopfnuss – Spielablauf am großen Bildschirm. Braucht common.js, pad.js, net.js und questions.js. */

const SETTINGS = {
  rounds: 3,          // Anzahl der Runden vor dem Finale
  perRound: 3,        // Fragen pro Runde
  time: 15,           // Sekunden pro Frage
  finaleTime: 12,     // Sekunden pro Frage im Finale
  summit: 10,         // Stufen bis zum Gipfel
  finaleMax: 25,      // Notbremse: so viele Finalfragen höchstens
  voteTime: 12,       // Sekunden für die Abstimmung über die Kategorie
  spinStart: 300,     // Zufallsstern bei Gleichstand: Pause zwischen den ersten Sprüngen (Millisekunden)
  spinEnd: 900        // … und zwischen den letzten, wenn er ausläuft
};

const KEYSETS = [['1', '2', '3', '4'], ['7', '8', '9', '0'], ['a', 's', 'd', 'f'], ['h', 'j', 'k', 'l']];
const DEFAULT_NAMES = ['Koralle', 'Sonne', 'Minze', 'Himmel'];
const keyLabel = k => k.toUpperCase();
const app = document.getElementById('app');

/* ---------- Brabbelsprache: lustige Fantasiestimme aus dem Synthesizer ---------- */
const Babble = (() => {
  // Formanten pro Vokal: daran erkennt das Ohr "a", "i", "o" …
  const VOWELS = { a: [850, 1250], e: [520, 1900], i: [330, 2300], o: [500, 920], u: [360, 760], 'ä': [680, 1700], 'ö': [460, 1500], 'ü': [310, 1750], y: [330, 2100] };
  const EMOTES = {
    tada: [{ t: 0, dur: 0.1, f: 520, v: 'a' }, { t: 0.12, dur: 0.36, f: 700, to: 780, v: 'a' }],
    yay: [{ t: 0, dur: 0.11, f: 540, v: 'a' }, { t: 0.13, dur: 0.34, f: 640, to: 900, v: 'i' }],
    oh: [{ t: 0, dur: 0.45, f: 520, to: 250, v: 'o' }],
    hm: [{ t: 0, dur: 0.16, f: 330, to: 350, v: 'u' }, { t: 0.2, dur: 0.22, f: 370, to: 430, v: 'u' }],
    hihi: [{ t: 0, dur: 0.09, f: 720, v: 'i' }, { t: 0.12, dur: 0.09, f: 660, v: 'i' }, { t: 0.24, dur: 0.09, f: 610, v: 'i' }, { t: 0.36, dur: 0.14, f: 560, v: 'i' }]
  };

  /* Zerlegt einen Text in Silben-Töne. Fragen gehen am Ende hoch, Ausrufe sind höher. */
  function plan(text, { base = 370, emote = null } = {}) {
    const notes = [];
    let t = 0;
    if (emote && EMOTES[emote]) {
      EMOTES[emote].forEach(n => notes.push({ ...n, formants: VOWELS[n.v] }));
      t = Math.max(...EMOTES[emote].map(n => n.t + n.dur)) + 0.18;
    }
    const sentences = String(text || '').toLowerCase().match(/[^.!?…]+[.!?…]*/g) || [];
    for (const sentence of sentences) {
      const mine = [];
      let prevVowel = false;
      for (const c of sentence) {
        const formants = VOWELS[c] || (/[0-9]/.test(c) ? VOWELS.e : null);
        if (formants) {
          if (!prevVowel || /[0-9]/.test(c)) { mine.push({ t, dur: 0.085, f: base * (0.88 + Math.random() * 0.3), formants }); t += 0.1; }
          prevVowel = true;
        } else {
          prevVowel = false;
          if (c === ' ') t += 0.04;
          else if (',;:–-'.includes(c)) t += 0.12;
        }
      }
      const end = sentence.trim().slice(-1);
      const last = mine.length - 1;
      mine.forEach((n, i) => {
        const fromEnd = last - i;
        if (end === '?') n.f *= [1.5, 1.25, 1.1][fromEnd] || 1;
        else if (end === '!') n.f *= fromEnd === 0 ? 1.35 : 1.12;
        else n.f *= [0.82, 0.92][fromEnd] || 1;
      });
      if (last >= 0) mine[last].dur = 0.14;
      notes.push(...mine);
      t += 0.24;
    }
    const kept = notes.filter(n => n.t < 7);
    const length = kept.length ? Math.max(...kept.map(n => n.t + n.dur)) : 0;
    return { notes: kept, length };
  }

  /* Baut die Töne in einen AudioContext (auch OfflineAudioContext zum Testen). */
  function render(ctx, dest, pl, t0, volume = 1) {
    const master = ctx.createGain();
    master.gain.value = 1.2 * volume;
    master.connect(dest);
    pl.notes.forEach(n => {
      const start = t0 + n.t;
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(n.f * (n.to ? 1 : 1.06), start);
      osc.frequency.exponentialRampToValueAtTime(n.to || n.f * 0.94, start + n.dur);
      const env = ctx.createGain();
      env.gain.setValueAtTime(0.0001, start);
      env.gain.exponentialRampToValueAtTime(1, start + 0.012);
      env.gain.setValueAtTime(1, start + n.dur * 0.6);
      env.gain.exponentialRampToValueAtTime(0.0001, start + n.dur);
      n.formants.forEach((freq, k) => {
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass'; bp.frequency.value = freq; bp.Q.value = 6;
        const g = ctx.createGain(); g.gain.value = k ? 0.55 : 1;
        osc.connect(bp); bp.connect(g); g.connect(env);
      });
      env.connect(master);
      osc.start(start); osc.stop(start + n.dur + 0.03);
    });
    return master;
  }

  let current = null;
  function stop() {
    if (!current) return;
    const c = current; current = null;
    clearTimeout(c.timer);
    try { c.master.gain.setTargetAtTime(0, Sound.ctx.currentTime, 0.01); setTimeout(() => c.master.disconnect(), 120); } catch { /* egal */ }
    c.resolve();
  }
  function say(text, opts = {}) {
    stop();
    const pl = plan(text, opts);
    Sound.init();
    const ctx = Sound.ctx;
    return new Promise(resolve => {
      if (!ctx || !pl.notes.length) return setTimeout(resolve, ctx ? 0 : pl.length * 1000);
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      const master = render(ctx, ctx.destination, pl, ctx.currentTime + 0.05);
      const timer = setTimeout(() => { if (current && current.master === master) current = null; resolve(); }, pl.length * 1000 + 180);
      current = { master, timer, resolve };
    });
  }
  return { plan, render, say, stop, emote: kind => say('', { emote: kind }) };
})();

/* ---------- Sprecherstimme ---------- */
/*
  Drei Arten:
    comic   – liest mit der Sprachausgabe des Browsers vor, aber hoch und flott
              wie eine Zeichentrickfigur, mit kleinen Brabbel-Ausrufen davor
    brabbel – reine Fantasiesprache aus dem Synthesizer (klingt auf jedem Gerät gleich)
    normal  – die normale Vorlesestimme des Geräts
*/
const Voice = {
  speech: 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window,
  supported: true,
  on: pref('kopfnuss-stimme', true),
  style: (() => { try { const v = localStorage.getItem('kopfnuss-stimme-art'); return ['comic', 'brabbel', 'normal'].includes(v) ? v : 'comic'; } catch { return 'comic'; } })(),
  voices: [],
  voice: null,
  onVoices: null,
  seq: 0,
  init() {
    if (!this.speech) return;
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
  setStyle(style) {
    this.style = style;
    try { localStorage.setItem('kopfnuss-stimme-art', style); } catch { /* egal */ }
  },
  /* Welche Art wirklich läuft: ohne Sprachausgabe im Browser bleibt nur die Brabbelsprache. */
  get mode() { return this.style === 'brabbel' || !this.speech ? 'brabbel' : this.style; },
  /* Schaltet die Sprachausgabe auf Handys und Tablets frei (braucht einen Klick). */
  prime() {
    Sound.init();
    if (this.on && this.speech) { try { speechSynthesis.speak(new SpeechSynthesisUtterance(' ')); } catch { /* egal */ } }
  },
  /* Spricht und meldet sich, wenn fertig. emote: kleiner Ausruf davor (tada, yay, oh, hm, hihi). */
  say(text, { emote = null } = {}) {
    this.stop();
    if (!this.on || !String(text || '').trim()) return Promise.resolve();
    if (this.mode === 'brabbel') return Babble.say(text, { emote });
    const comic = this.mode === 'comic';
    const mine = ++this.seq;
    return new Promise(resolve => {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'de-DE';
      if (this.voice) u.voice = this.voice;
      u.pitch = comic ? 1.6 + Math.random() * 0.3 : 1;
      u.rate = comic ? 1.12 : 1.05;
      let done = false;
      const lead = comic && emote ? 520 : 60;
      const t = setTimeout(() => fin(), lead + 1200 + text.length * 85);
      function fin() { if (!done) { done = true; clearTimeout(t); resolve(); } }
      u.onend = fin; u.onerror = fin;
      if (comic && emote) Babble.emote(emote);
      setTimeout(() => { if (mine === this.seq) speechSynthesis.speak(u); else fin(); }, lead);
    });
  },
  stop() {
    this.seq++;
    Babble.stop();
    if (this.speech) speechSynthesis.cancel();
  }
};
Voice.init();

const LINES = {
  allRight: ['Jippie! Alle richtig!', 'Wow, wow, wow! Lauter Schlauköpfe!', 'Na toll. Ihr seid ja alle gleich schlau!', 'Bingo, bingo, bingo! Das wussten alle.'],
  noneRight: ['Auweia! Das wusste keiner.', 'Oh-oh! Kollektive Kopfnuss!', 'Hoppla! Alle daneben. Peinlich, peinlich!', 'Keiner? Wirklich keiner? Oje, oje!'],
  fastest: ['Zack! {name} war am schnellsten!', '{name} hat den Turbo gezündet!', 'Blitzmerker {name}! Schneller als der Schall!', 'Wusch! {name} war zuerst da!'],
  soloRight: ['Jawoll!', 'Bingo!', 'Volltreffer!', 'Jippie, richtig!'],
  soloWrong: ['Hoppla, daneben!', 'Auweia!', 'Oh-oh, das war nix!', 'Knapp vorbei ist auch daneben!'],
  rounds: ['Auf geht’s! Runde {r}. {title}!', 'Trommelwirbel! Runde {r}. {title}!', 'Juhu! Runde {r}. {title}!'],
  vote: ['Abstimmung! Durch welche Tür soll es gehen?', 'Vier Türen, eine Wahl! Stimmt ab!', 'Hopp, hopp! Wohin geht die Reise?', 'Tür eins, zwei, drei oder vier? Ihr entscheidet!'],
  voteSolo: ['Vier Türen! Welche darf’s sein?', 'Hopp, hopp! Such dir eine Tür aus!'],
  voteWon: ['{cat}! Alle Mann durch die Tür!', 'Die Mehrheit sagt: {cat}! Los geht’s!', 'Tür auf für: {cat}!'],
  voteSpin: ['Gleichstand! Der Zufall entscheidet!', 'Unentschieden! Dreh dich, Glücksstern!', 'Oh-oh, keine Mehrheit! Der Zufall muss ran!'],
  voteNone: ['Keiner stimmt ab? Dann entscheidet der Zufall!', 'Na gut, dann würfle ich eben!'],
  voteTie: ['Der Zufall sagt: {cat}!', 'Und es wird: {cat}!', 'Das Los fällt auf: {cat}!'],
  trap: ['{name}, such dir eine fiese Falle aus! Hihihi!', 'Psst, {name}! Wen ärgern wir heute?', '{name}, jetzt wird’s gemein! Wähle eine Falle!'],
  reveal: ['Und richtig ist: {answer}!', 'Die Antwort lautet: {answer}!', 'Tadaa! Es ist: {answer}!']
};
const line = (key, vars = {}) => pick(LINES[key]).replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');

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
  if (insetWatch) { insetWatch.disconnect(); insetWatch = null; }
  app.className = 'screen ' + cls;
  app.innerHTML = html;
  window.scrollTo(0, 0);
}

/*
  Bildschirme mit Figuren: Die Papier-Bühne füllt das ganze Fenster (Klasse is-full),
  Überschriften und Leisten liegen darüber. Elemente mit data-inset="top|bottom|left|right"
  melden der Bühne, wie viel Rand sie verdecken, damit die Kamera die Figuren im freien
  Bereich hält.
*/
const FULL = Stage.ok ? ' is-full' : '';
let insetWatch = null;
function fitStage() {
  const el = $('#stage');
  if (!el || !Stage.ok) return;
  const r = el.getBoundingClientRect();
  const ins = { top: 0, right: 0, bottom: 0, left: 0 };
  $$('[data-inset]').forEach(h => {
    if (getComputedStyle(h).position !== 'absolute') return;   // schmale Fenster: Bühne steht als Block im Textfluss
    const b = h.getBoundingClientRect();
    if (!b.width || !b.height) return;
    const side = h.dataset.inset;
    if (side === 'top') ins.top = Math.max(ins.top, b.bottom - r.top);
    else if (side === 'bottom') ins.bottom = Math.max(ins.bottom, r.bottom - b.top);
    else if (side === 'left') ins.left = Math.max(ins.left, b.right - r.left);
    else if (side === 'right') ins.right = Math.max(ins.right, r.right - b.left);
  });
  Stage.setInsets(ins);
}
function mountStage() {
  if (!Stage.ok) return;
  Stage.mount($('#stage'));
  fitStage();
  if ('ResizeObserver' in window) {
    insetWatch = new ResizeObserver(fitStage);
    $$('[data-inset]').forEach(h => insetWatch.observe(h));
    insetWatch.observe(app);
  }
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
  inputHandler: null, onChange: null, onRoom: null, hb: null, t: null,
  start() {
    this.stop();
    this.room = Array.from({ length: 4 }, () => pick(ROOM_LETTERS.split(''))).join('');
    this.clients = []; this.views = {}; this.open = true; this.status = 'connecting';
    this.conn = Net.connect(this.room, m => this.recv(m), s => {
      if (s === 'taken') {   // Raumcode schon vergeben: neuen würfeln und die Lobby neu zeichnen
        this.start();
        if (this.onRoom) this.onRoom();
        return;
      }
      this.status = s;
      if (s === 'open') this.flush();
      if (this.onChange) this.onChange();
    }, 'host');
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
  u.search = '?raum=' + Remote.room + (Net.mode === 'lokal' ? '&lokal' : Net.mode === 'supabase' ? '&supabase' : '');
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
  KopfnussMusic.stop(1.4);   // Titelmusik blendet aus, sobald das Spiel beginnt
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
      speak: line('rounds', { r, title })
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
  Sound.fanfare();
  Voice.say(speak || title, { emote: 'tada' });
  return waitContinue($('#go'), () => ({ k: 'wait', title: kicker, text: title }));
}

const figId = p => p.cid || 'p' + p.id;
const figList = () => S.players.map(p => ({ id: figId(p), name: p.name, color: p.color }));
const climbSteps = () => Object.fromEntries(S.players.map(p => [figId(p), p.climb]));

const playerChip = p => `<span class="pchip" style="--pc:${p.color}">${esc(p.name)}</span>`;
const cardKey = (p, i) => S.remote ? '' : `<kbd style="--pc:${p.color}">${keyLabel(p.keys[i])}</kbd>`;


/* Eine Person wählt aus Karten. Gibt den Index der gewählten Karte zurück. */
function choiceScreen({ kicker, title, hint, chooser, cards, phoneTitle, waitText, speak, emote = 'hm', cardClass = '', sound = 'click' }) {
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
  if (speak) Voice.say(speak, { emote });
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

/*
  Abstimmung: Vier Türen, jede Person stimmt ab (am Handy oder mit ihren Tasten).
  Die Figur stellt sich vor die gewählte Tür. Die Mehrheit gewinnt, bei Gleichstand
  entscheidet das Los. Dann laufen alle durch die Gewinner-Tür.
*/
async function categoryPhase(round, q) {
  const cats = shuffle(CATEGORIES.filter(c => availableIn(c).length)).slice(0, 4);
  if (cats.length <= 1) return cats[0];
  const remote = S.remote;
  const n = S.players.length;
  const limit = SETTINGS.voteTime * 1000;
  const votes = new Array(n).fill(null);
  const pads = [];

  show(`
    <div class="quiz vote ${remote ? 'quiz-remote' : 'quiz-local'}">
      ${Stage.ok ? '<div class="stage-full" id="stage"></div>' : ''}
      <div class="hud hud-top" data-inset="top">
        <header class="qhead">
          <span class="label">Runde ${round} · Frage ${q}/${SETTINGS.perRound}</span>
          <span class="label cat">Abstimmung</span>
        </header>
        <h2 class="question">${n > 1 ? 'Durch welche Tür soll es gehen?' : 'Durch welche Tür gehst du?'}</h2>
        <div class="timer" aria-hidden="true"><div class="timer-fill"></div></div>
        ${Stage.ok ? '' : `<div class="tv-answers">${cats.map((c, i) => `<div class="tv-ans" data-a="${i}"><b>${i + 1}</b> ${esc(c)} <span class="vote-chips"></span></div>`).join('')}</div>`}
      </div>
      <div class="hud hud-bottom" data-inset="bottom">
      <div class="panels panels-${n} ${remote ? 'panels-remote' : ''}">
        ${S.players.map((p, i) => `
          <section class="panel" data-p="${i}" style="--pc:${p.color}">
            <div class="ptop">
              <span class="pname">${esc(p.name)}</span>
              <span class="pscore">${p.score.toLocaleString('de-DE')}</span>
            </div>
            ${remote ? '<div class="pstatus">Stimmt ab …</div>' : '<div class="answer-zone"></div>'}
          </section>`).join('')}
      </div>
      </div>
    </div>`, 'is-quiz' + FULL);

  const panels = $$('.panel');
  const fill = $('.timer-fill'), timerEl = $('.timer');
  if (Stage.ok) {
    mountStage();
    Stage.setPlayers(figList());
    Stage.setDoors(cats);
    Stage.layout('doors');
    S.players.forEach(p => { Stage.mood(figId(p), 'think'); });
  }
  Voice.say(line(n > 1 ? 'vote' : 'voteSolo'), { emote: 'hm' });

  let finished = false, raf = 0;
  let resolveVote;
  const voted = new Promise(r => { resolveVote = r; });
  const start = performance.now();

  function vote(i, door) {
    if (finished || votes[i] !== null || !Number.isInteger(door) || door < 0 || door >= cats.length) return;
    votes[i] = door;
    const p = S.players[i];
    Sound.lock();
    Stage.mood(figId(p), 'idle');
    Stage.voteWalk(figId(p), door);
    if (remote) {
      const el = $('.pstatus', panels[i]);
      el.textContent = `Tür ${door + 1}: ${cats[door]}`; el.className = 'pstatus is-locked';
      Remote.setView(p, { k: 'wait', title: 'Abgestimmt', text: cats[door] });
    } else if (pads[i]) pads[i].lock(`Tür ${door + 1}`);
    const chips = $(`.tv-ans[data-a="${door}"] .vote-chips`);
    if (chips) chips.insertAdjacentHTML('beforeend', `<i style="--pc:${p.color}"></i>`);
    if (votes.every(v => v !== null)) setTimeout(finish, 500);
  }

  if (remote) {
    Remote.setAll(() => ({ k: 'pick', title: 'Welche Tür?', options: cats.map((c, i) => ({ label: c, sub: `Tür ${i + 1}`, color: DOOR_COLORS[i] })) }));
  } else {
    S.players.forEach((p, i) => {
      pads[i] = createPad({
        root: panels[i], zone: $('.answer-zone', panels[i]), answers: cats, order: cats.map((_, k) => k),
        keys: p.keys.map(keyLabel), limit, onAnswer: door => vote(i, door)
      });
    });
  }
  listen((i, val, src) => {
    if (src === 'key') { if (pads[i] && val < cats.length) pads[i].press(val); }
    else vote(i, val);
  });

  function frame(now) {
    if (finished) return;
    const el = now - start;
    timerEl.style.setProperty('--t', Math.max(0, 1 - el / limit).toFixed(4));
    fill.classList.toggle('hurry', limit - el < 4000);
    if (el >= limit) return finish();
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);

  function finish() {
    if (finished) return;
    finished = true;
    cancelAnimationFrame(raf);
    unlisten();
    resolveVote();
  }
  await voted;

  // Auszählen: Mehrheit gewinnt, bei Gleichstand (oder ohne Stimmen) entscheidet das Los
  const counts = cats.map((_, door) => votes.filter(v => v === door).length);
  const most = Math.max(...counts);
  const tied = counts.map((c, door) => c === most ? door : -1).filter(door => door >= 0);
  const winner = pick(tied);
  const cat = cats[winner];
  timerEl.classList.add('done');
  pads.forEach(pd => pd.destroy());
  S.players.forEach((p, i) => { if (votes[i] === null) Stage.mood(figId(p), 'idle'); });
  Remote.setAll(() => ({ k: 'wait', title: cat, text: 'Gleich kommt die Frage auf dem Fernseher.' }));
  await wait(Stage.ok ? 900 : 300);   // die letzten Figuren kommen noch an

  // Keine klare Mehrheit: Der Zufallszeiger springt zwischen den Türen mit den meisten Stimmen
  // hin und her, wird langsamer und bleibt auf einer stehen. Ohne Stimmen sind alle Türen dabei.
  const lottery = tied.length > 1;
  if (lottery) {
    $('.question').textContent = most > 0 ? 'Gleichstand! Der Zufall entscheidet …' : 'Keine Stimme! Der Zufall entscheidet …';
    Voice.say(line(most > 0 ? 'voteSpin' : 'voteNone'), { emote: 'hm' });
    // Saallicht runter, damit der Stern leuchtet
    Stage.dim(true);
    app.classList.add('lights-down');
    await wait(Voice.on ? 1500 : 900);
    const cards = $$('.tv-ans');
    const rounds = tied.length <= 2 ? 3 : 2;
    const total = rounds * tied.length + tied.indexOf(winner);   // der letzte Sprung landet auf dem Gewinner
    let delay = SETTINGS.spinStart;
    for (let step = 0; step <= total; step++) {
      const door = tied[step % tied.length];
      Stage.pointDoor(door);
      cards.forEach(el => el.classList.toggle('hot', +el.dataset.a === door));
      if (step < total) { Sound.hop(step); await wait(delay); delay = Math.min(SETTINGS.spinEnd, delay * (step >= total - 5 ? 1.24 : 1.05)); }
    }
    Sound.landed();
    await wait(1100);
    cards.forEach(el => el.classList.remove('hot'));
    Stage.dim(false);
    app.classList.remove('lights-down');
  } else Sound.good();

  $('.question').textContent = cat;
  $$('.tv-ans').forEach(el => el.classList.add(+el.dataset.a === winner ? 'right' : 'dim'));
  Voice.say(line(lottery ? 'voteTie' : 'voteWon', { cat }), { emote: 'yay' });
  await Stage.openDoor(winner);
  await Stage.enterDoor(winner);
  await wait(Stage.ok ? 350 : 1400);
  return cat;
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
      speak: line('trap', { name: p.name }),
      emote: 'hihi'
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
  Voice.say(hits ? `Oh-oh! Mal sehen, wen es erwischt hat!${blocks ? ' Und zack: Ein Schild hat sogar etwas abgewehrt!' : ''}` : 'Boing! Alle Fallen wurden abgewehrt!', { emote: hits ? 'hihi' : 'yay' });
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
    <div class="quiz ${remote ? 'quiz-remote' : 'quiz-local'}">
      ${Stage.ok ? '<div class="stage-full" id="stage"></div>' : ''}
      <div class="hud hud-top" data-inset="top">
        <header class="qhead">
          <span class="label">${esc(opts.label)}</span>
          <span class="label cat">${esc(q.cat)}</span>
          ${opts.mult > 1 ? `<span class="label mult">× ${opts.mult} Punkte</span>` : ''}
        </header>
        ${opts.climb && !Stage.ok ? climbTrack() : ''}
        <h2 class="question">${esc(q.text)}</h2>
        <div class="timer" aria-hidden="true"><div class="timer-fill"></div></div>
        ${remote && (!Stage.ok || opts.climb) ? `<div class="tv-answers waiting">${baseOrder.map(a => `<div class="tv-ans" data-a="${a}">${esc(q.answers[a])}</div>`).join('')}</div>` : ''}
      </div>
      <div class="hud hud-bottom" data-inset="bottom">
      <div class="after" hidden><button class="btn btn-go" id="go">Weiter <kbd>Enter</kbd></button></div>
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
      </div>
    </div>`, 'is-quiz' + FULL);

  const panels = $$('.panel');
  const fill = $('.timer-fill'), timerEl = $('.timer');
  const setStatus = (i, text, cls = '') => {
    const el = $('.pstatus', panels[i]);
    if (el) { el.textContent = text; el.className = 'pstatus ' + cls; }
  };

  const answerTexts = baseOrder.map(a => q.answers[a]);
  const fxNames = s => s.fx.map(f => SABOTAGES[f].name);
  if (Stage.ok) {
    mountStage();
    Stage.setPlayers(figList());
    Stage.setAnswers(null);
    Stage.layout(opts.climb ? 'climb' : 'question', { steps: climbSteps(), summit: SETTINGS.summit });
    st.forEach(s => Stage.setLabel(figId(s.p), { status: 'hört zu', fx: fxNames(s) }));
  }

  // Erst vorlesen, dann geht die Zeit los. Die Frage steht nur auf dem Fernseher.
  Remote.setAll(() => ({ k: 'wait', title: 'Hör gut zu …', text: 'Die Frage steht auf dem Fernseher.' }));
  await Promise.all([Voice.say(q.text, { emote: 'hm' }), wait(900)]);
  if (Stage.ok) {
    if (remote && !opts.climb) Stage.setAnswers(answerTexts);
    st.forEach(s => { Stage.setLabel(figId(s.p), { status: 'überlegt …', fx: fxNames(s) }); Stage.mood(figId(s.p), 'think'); });
  }

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
    Stage.lock(figId(s.p));
    Stage.mood(figId(s.p), 'idle');
    Stage.setLabel(figId(s.p), { status: 'eingeloggt', fx: [] });
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
    const tvAnswers = $('.tv-answers');
    if (tvAnswers) tvAnswers.classList.remove('waiting');
    st.forEach((s, i) => {
      setStatus(i, 'Überlegt …');
      Remote.setView(s.p, { k: 'q', answers: q.answers, order: s.order, fx: s.fx, limit: s.deadline, total: limit });
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
    timerEl.style.setProperty('--t', Math.max(0, 1 - el / limit).toFixed(4));
    fill.classList.toggle('hurry', limit - el < 5000);
    const sec = Math.ceil((limit - el) / 1000);
    if (sec <= 5 && sec !== lastTick && sec > 0) { lastTick = sec; Sound.tick(); }
    st.forEach((s, i) => {
      if (s.pad) s.pad.tick(el);
      if (s.fx.includes('zeitdieb')) { const b = $('.ptimer div', panels[i]); if (b) b.style.transform = `scaleX(${Math.max(0, 1 - el / s.deadline)})`; }
      if (!s.done && el >= s.deadline) {
        s.done = true;
        Stage.setLabel(figId(s.p), { status: 'Zeit um', fx: [] });
        Stage.mood(figId(s.p), 'sad');
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
    if (Stage.ok && !opts.climb) {
      Stage.setAnswers(answerTexts);
      st.forEach(s => Stage.setLabel(figId(s.p), { status: '', fx: [] }));
      Sound.drumroll();
      await Stage.walkToPads(st.filter(s => s.choice !== null).map(s => ({ id: figId(s.p), pad: baseOrder.indexOf(s.choice) })));
      await wait(350);
    }
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
    rightOnes.length ? Sound.good() : Sound.whoops();

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
    if (Stage.ok) {
      if (opts.climb) {
        st.forEach(s => Stage.setLabel(figId(s.p), { status: '', fx: [] }));
        Stage.climb(climbSteps());
        results.forEach(r => {
          Stage.mood(figId(r.p), r.correct ? 'cheer' : r.answered ? 'sad' : 'idle');
          Stage.pop(figId(r.p), r.move > 0 ? '+' + r.move : r.move < 0 ? '−1' : '±0', r.correct);
        });
      } else {
        Stage.reveal(baseOrder.indexOf(q.correct), results.map(r => ({ id: figId(r.p), correct: r.correct })));
        results.forEach(r => Stage.pop(figId(r.p), r.correct ? '+' + r.pts : r.answered ? 'Falsch' : 'Keine Antwort', r.correct));
      }
    }
    if (opts.climb) { const track = $('.climb'); if (track) track.outerHTML = climbTrack(); Sound.climb(); }

    // Kommentar vom Sprecher
    const answerText = q.answers[q.correct];
    let comment;
    if (n === 1) comment = pick(rightOnes.length ? LINES.soloRight : LINES.soloWrong);
    else if (rightOnes.length === n) comment = pick(LINES.allRight);
    else if (!rightOnes.length) comment = pick(LINES.noneRight);
    else comment = line('fastest', { name: fastest.p.name });
    Voice.say(`${line('reveal', { answer: answerText })} ${comment}`, { emote: rightOnes.length ? 'yay' : 'oh' });

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
  Voice.say(S.players.length > 1 ? `Trommelwirbel! Zwischenstand! Vorne liegt: ${sorted[0].name}!` : `Nicht schlecht! Du hast ${sorted[0].score} Punkte!`, { emote: 'tada' });
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
      ${Stage.ok ? '<div class="stage-full" id="stage"></div>' : ''}
      <div class="hud hud-top" data-inset="top">
        <p class="kicker">Finale</p>
        <h1 class="intro-title">Gipfelsturm</h1>
        <p class="intro-text">Wer zuerst Stufe ${SETTINGS.summit} erreicht, gewinnt. Richtig bringt eine Stufe, die schnellste richtige Antwort zwei. Wer falsch antwortet, rutscht eine Stufe ab.</p>
      </div>
      ${Stage.ok ? '' : climbTrack()}
      <div class="hud hud-bottom foot-col" data-inset="bottom">
        <p class="intro-text small">${n > 1 ? `Startplätze nach Punkten: ${ranked.map(p => `${esc(p.name)} Stufe ${p.climb}`).join(' · ')}` : 'Schaffst du es nach oben?'}</p>
        <button class="btn btn-go" id="go">Los <kbd>Enter</kbd></button>
      </div>
    </div>`, 'is-intro' + FULL);
  if (Stage.ok) {
    mountStage();
    Stage.setPlayers(figList());
    Stage.layout('climb', { steps: climbSteps(), summit: SETTINGS.summit });
  }
  Sound.fanfare();
  Voice.say('Finale! Gipfelsturm! Hopp, hopp, hopp: Wer zuerst oben ist, gewinnt!', { emote: 'tada' });
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
      ${Stage.ok ? '<div class="stage-full" id="stage"></div>' : '<canvas id="confetti" aria-hidden="true"></canvas>'}
      <div class="hud hud-top" data-inset="top">
        <p class="kicker">Gipfel erreicht</p>
        <h1 class="intro-title winner-name" style="--pc:${champ.color}">${esc(champ.name)}</h1>
        <p class="intro-text winner-text">${S.players.length > 1 ? 'gewinnt Kopfnuss!' : `Geschafft. ${champ.correctCount} richtige Antworten in der Vorrunde.`}</p>
      </div>
      <div class="hud hud-bottom" data-inset="bottom">
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
      </div>
    </div>`, 'is-final' + FULL);
  if (Stage.ok) {
    mountStage();
    Stage.setPlayers(figList());
    Stage.layout('podium', { ranks: ps.map(figId) });
  }
  Voice.say(S.players.length > 1 ? `Tadaa! ${champ.name} gewinnt Kopfnuss! Jippie! Herzlichen Glückwunsch!` : 'Tadaa! Gipfel erreicht! Jippie!', { emote: 'yay' });
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

/* ---------- Start: Titelbild, dann Spielart und Spieler ---------- */
/*
  Erst das Titelbild: Vorhang auf, das Logo fällt Buchstabe für Buchstabe herein, die Figuren
  hüpfen auf die Bühne, der Start-Knopf blinkt. Nach dem Start fährt das Menü herein. Die Figuren
  auf der Bühne zeigen live, wer mitspielt: Anzahl und Namen ändern sich mit den Eingaben.
*/
let setupMode = 'local';
let titleSeen = false;
let titleTimer = 0;

function setupScreen() {
  Remote.stop();
  S = null;
  let count = lastSetup && lastSetup.mode === 'local' ? lastSetup.players.length : 2;
  const names = lastSetup && lastSetup.mode === 'local' ? lastSetup.players.map(p => p.name) : DEFAULT_NAMES.slice();
  while (names.length < 4) names.push(DEFAULT_NAMES[names.length]);

  show(`
    <div class="title">
      ${Stage.ok ? '<div class="stage-full" id="stage"></div>' : ''}
      <div class="hud hud-top title-top" data-inset="top">
        ${Stage.ok ? '' : '<div class="logo"><h1 class="wordmark">Kopf<span>nuss</span></h1><p class="tagline">Das Quiz, bei dem du deine Freunde ausbremst.</p></div>'}
        <div class="corner-btns">
          <button class="btn btn-ghost btn-small" id="open-rules">So geht’s</button>
          <button class="btn btn-ghost btn-small" id="open-settings">Ton &amp; Stimme</button>
        </div>
      </div>
      <div class="hud hud-bottom title-foot" data-inset="bottom">
        <div class="press" id="press" ${titleSeen ? 'hidden' : ''}>
          <button class="btn btn-go btn-start" id="press-start">Start</button>
          <p class="press-hint">Tippen oder Enter drücken</p>
        </div>
        <section class="box menu" id="menu" ${titleSeen ? '' : 'hidden'}>
          <div class="menu-col">
            <h2 class="box-title">Wie wollt ihr spielen?</h2>
            <div class="modes" role="group" aria-label="Spielart">
              <button class="mode-btn" data-mode="local" aria-pressed="${setupMode === 'local'}">${icon('bildschirm')}<span><b>Ein Bildschirm</b><small>Tippen oder Tastatur</small></span></button>
              <button class="mode-btn" data-mode="remote" aria-pressed="${setupMode === 'remote'}">${icon('handy')}<span><b>Mit Handys</b><small>Jede Person am eigenen Handy</small></span></button>
            </div>
          </div>
          <div class="menu-col menu-players">
            <div id="mode-local">
              <div class="menu-row">
                <h2 class="box-title">Wer spielt mit?</h2>
                <div class="count" role="group" aria-label="Anzahl der Spieler">
                  ${[1, 2, 3, 4].map(c => `<button class="count-btn" data-c="${c}" aria-pressed="${c === count}">${c}</button>`).join('')}
                </div>
              </div>
              <div class="players"></div>
            </div>
            <div id="mode-remote">
              <p class="mode-note">Der große Bildschirm zeigt gleich einen QR-Code. Bis zu vier Leute scannen ihn mit der Handy-Kamera, geben ihren Namen ein und spielen geheim am eigenen Handy.</p>
              ${window.KOPFNUSS_VORSCHAU ? '<p class="mode-warn">In dieser Vorschau gibt es keinen Handy-Modus. Er läuft auf deiner Website unter /herzfrequenz/quiz/.</p>'
                : Net.available() ? '' : '<p class="mode-warn">' + (Net.mode === 'supabase' ? 'Für den Handy-Modus fehlt die Supabase-Verbindung in config.js.' : 'Dieser Browser kann keine direkte Verbindung zu Handys aufbauen. Probier einen aktuellen Chrome, Edge, Firefox oder Safari.') + '</p>'}
            </div>
          </div>
          <div class="menu-col menu-go">
            <button class="btn btn-go btn-big" id="start">Spiel starten</button>
          </div>
        </section>
      </div>
      <div class="sheet-wrap" id="rules" hidden>
        <section class="box sheet box-rules" role="dialog" aria-label="So geht’s">
          <h2 class="box-title">So geht’s</h2>
          <ol class="rules">
            <li><b>${SETTINGS.rounds} Runden mit je ${SETTINGS.perRound} Fragen.</b> Jede Frage wird vorgelesen, dann läuft die Zeit. Schnell und richtig gibt bis zu 1.000 Punkte, in der letzten Runde das Doppelte.</li>
            <li><b>Sabotage vor jeder Runde.</b> Schick anderen Frost, Nebel, Kreisel, Kleckse, Zeitdieb oder Spiegel. Oder halte ein Schild hoch.</li>
            <li><b>Abstimmung vor jeder Frage.</b> Vier Türen, vier Kategorien. Die Mehrheit entscheidet. Bei Gleichstand springt der Zufallsstern zwischen den Türen hin und her. Dann laufen alle durch die Tür.</li>
            <li><b>Finale Gipfelsturm.</b> Wer vorne liegt, startet höher. Wer zuerst oben ist, gewinnt.</li>
          </ol>
          <button class="btn btn-go" data-close>Alles klar</button>
        </section>
      </div>
      <div class="sheet-wrap" id="settings" hidden>
        <section class="box sheet" role="dialog" aria-label="Ton und Stimme">
          <h2 class="box-title">Ton &amp; Stimme</h2>
          <div class="toggles">
            <label class="toggle"><input type="checkbox" id="sound" ${Sound.on ? 'checked' : ''}> Soundeffekte</label>
            <label class="toggle"><input type="checkbox" id="music" ${KopfnussMusic.enabled ? 'checked' : ''}> Titelmusik</label>
            <label class="toggle"><input type="checkbox" id="voice" ${Voice.on ? 'checked' : ''}> Fragen vorlesen</label>
            <div class="voice-row" id="voice-row">
              <label for="voice-style" class="sr-only">Art der Stimme</label>
              <select id="voice-style">
                <option value="comic" ${Voice.style === 'comic' ? 'selected' : ''} ${Voice.speech ? '' : 'disabled'}>Comic-Stimme (hoch und frech)</option>
                <option value="brabbel" ${Voice.mode === 'brabbel' ? 'selected' : ''}>Brabbelsprache (Fantasiestimme)</option>
                <option value="normal" ${Voice.style === 'normal' ? 'selected' : ''} ${Voice.speech ? '' : 'disabled'}>Normale Vorlesestimme</option>
              </select>
              <label for="voice-pick" class="sr-only">Stimme des Geräts</label>
              <select id="voice-pick"></select>
              <button class="btn btn-ghost btn-small" id="voice-test">Probehören</button>
            </div>
          </div>
          <button class="btn btn-go" data-close>Fertig</button>
        </section>
      </div>
    </div>`, 'is-setup' + FULL);

  /* Figuren auf der Bühne: auf dem Titelbild alle vier, im Menü genau die, die mitspielen */
  const figures = () => names.slice(0, !titleSeen || setupMode === 'remote' ? 4 : count)
    .map((nm, i) => ({ id: 'p' + i, name: (nm || '').trim() || DEFAULT_NAMES[i], color: PLAYER_COLORS[i] }));
  const syncStage = intro => {
    if (!Stage.ok) return;
    Stage.setPlayers(figures());
    Stage.layout('title', { intro });
  };
  mountStage();
  syncStage(!titleSeen);
  // Titelmusik: Browser erlauben Ton erst nach dem ersten Tippen oder Tastendruck
  if (!KopfnussMusic.start()) {
    const wake = () => { if (app.classList.contains('is-setup') || app.classList.contains('is-lobby')) KopfnussMusic.start(); };
    document.addEventListener('pointerdown', wake, { once: true });
    document.addEventListener('keydown', wake, { once: true });
  }
  // Ab und zu macht eine Figur einen Luftsprung
  clearInterval(titleTimer);
  titleTimer = setInterval(() => {
    if (!app.classList.contains('is-setup')) return clearInterval(titleTimer);
    if (document.visibilityState === 'visible') Stage.lock(pick(figures()).id);
  }, 2400);

  const renderPlayers = () => {
    $('.players').innerHTML = names.slice(0, count).map((nm, i) => `
      <div class="player-row" style="--pc:${PLAYER_COLORS[i]}">
        <span class="swatch"></span>
        <label class="sr-only" for="name-${i}">Name Spieler ${i + 1}</label>
        <input id="name-${i}" maxlength="14" value="${esc(nm)}" autocomplete="off">
        <span class="keys">${KEYSETS[i].map(k => `<kbd>${keyLabel(k)}</kbd>`).join('')}</span>
      </div>`).join('');
    $$('.players input').forEach((inp, i) => inp.addEventListener('input', () => { names[i] = inp.value; if (Stage.ok) Stage.setPlayers(figures()); }));
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
    sel.hidden = Voice.mode === 'brabbel';
    $('#voice-row').hidden = !Voice.on;
  };
  renderPlayers(); renderMode(); renderVoices();
  Voice.onVoices = renderVoices;

  // Titelbild: Start per Knopf, Tipp auf die Bühne, Enter oder Leertaste
  const begin = () => {
    if (titleSeen) return;
    titleSeen = true;
    Sound.init(); Voice.prime(); Sound.fanfare();
    KopfnussMusic.start();
    Stage.titleKick();
    Voice.say('Willkommen bei Kopfnuss!', { emote: 'tada' });
    $('#press').hidden = true;
    $('#menu').hidden = false;
    keyHandler = null;
    syncStage(false);
  };
  $('#press-start').addEventListener('click', begin);
  const stageEl = $('#stage');
  if (stageEl) stageEl.addEventListener('click', begin);
  if (!titleSeen) keyHandler = k => { if (k === 'enter' || k === 'space') { begin(); return true; } };

  // Zettel "So geht’s" und "Ton & Stimme"
  const openSheet = id => { Sound.init(); Sound.click(); $('#' + id).hidden = false; const b = $('#' + id + ' [data-close]'); if (b) b.focus(); };
  $('#open-rules').addEventListener('click', () => openSheet('rules'));
  $('#open-settings').addEventListener('click', () => openSheet('settings'));
  $$('.sheet-wrap').forEach(w => {
    w.addEventListener('click', e => { if (e.target === w || e.target.closest('[data-close]')) { Sound.click(); w.hidden = true; } });
    w.addEventListener('keydown', e => { if (e.key === 'Escape') w.hidden = true; });
  });

  $$('.mode-btn').forEach(b => b.addEventListener('click', () => { setupMode = b.dataset.mode; Sound.click(); renderMode(); syncStage(false); }));
  $$('.count-btn').forEach(b => b.addEventListener('click', () => {
    count = +b.dataset.c; Sound.click();
    $$('.count-btn').forEach(x => x.setAttribute('aria-pressed', x === b));
    renderPlayers();
    syncStage(false);
  }));
  $('#sound').addEventListener('change', e => { Sound.on = e.target.checked; Sound.init(); setPref('kopfnuss-sound', Sound.on); Sound.click(); });
  $('#music').addEventListener('change', e => { KopfnussMusic.enabled = e.target.checked; if (e.target.checked) KopfnussMusic.start(); });
  $('#voice').addEventListener('change', e => {
    Voice.on = e.target.checked; setPref('kopfnuss-stimme', Voice.on); renderVoices();
    if (Voice.on) Voice.say('Hallo, hallo! Ich lese euch die Fragen vor!', { emote: 'yay' }); else Voice.stop();
  });
  const sample = () => Voice.say('Jippie! Willkommen bei Kopfnuss! Wie viele Herzen hat ein Oktopus?', { emote: 'tada' });
  $('#voice-style').addEventListener('change', e => { Voice.setStyle(e.target.value); renderVoices(); sample(); });
  $('#voice-pick').addEventListener('change', e => { Voice.choose(e.target.value); sample(); });
  $('#voice-test').addEventListener('click', sample);
  $('#start').addEventListener('click', () => {
    Sound.init(); Sound.click();
    Voice.prime();
    clearInterval(titleTimer);
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
      ${Stage.ok ? '<div class="stage-full" id="stage"></div>' : ''}
      <section class="box lobby-join" data-inset="left">
        <p class="kicker">Mit dem Handy beitreten</p>
        ${qr ? `<div class="qr" role="img" aria-label="QR-Code zum Beitreten">${qr}</div>` : ''}
        <p class="room-label">Raumcode</p>
        <p class="room-code">${Remote.room}</p>
        <p class="room-url">${esc(url)}</p>
      </section>
      <section class="lobby-side">
        <div class="hud lobby-head" data-inset="top">
          <h2 class="choose-title">Wer ist dabei?</h2>
          <p class="net-status" id="net"></p>
        </div>
        <div class="hud lobby-foot" data-inset="bottom">
          <ul class="lobby-list" id="list"></ul>
          <div class="btn-row">
            <button class="btn btn-go" id="start" disabled>Spiel starten</button>
            <button class="btn btn-ghost" id="back">Zurück</button>
          </div>
        </div>
      </section>
    </div>`, 'is-lobby' + FULL);

  const statusText = {
    connecting: 'Verbinde mit dem Server …',
    open: Net.forceLocal ? 'Testmodus: Öffne den Link links in einem zweiten Tab dieses Browsers.' : Net.mode === 'direkt' ? 'Bereit! Scannt den Code mit der Handy-Kamera. Am besten sind alle im selben WLAN.' : 'Verbunden. Scannt den Code mit der Handy-Kamera.',
    reconnecting: 'Verbindung unterbrochen. Verbinde neu …',
    error: Net.mode === 'direkt' ? 'Der Vermittlungsdienst ist gerade nicht erreichbar. Prüfe die Internetverbindung, ich versuche es weiter.' : 'Keine Verbindung zum Server. Prüfe im Supabase-Dashboard, ob dein Projekt aktiv ist. In einer Vorschau ohne Internetzugang funktioniert der Handy-Modus nicht.'
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
  Remote.onRoom = () => lobbyScreen();   // Raumcode war vergeben: Lobby mit neuem Code zeigen
  Remote.onChange = () => {
    render();
    if (Stage.ok) {
      Stage.setPlayers(Remote.clients.map(c => ({ id: c.cid, name: c.name, color: c.color })));
      Stage.layout('lobby');
    }
  };
  mountStage();
  Remote.onChange();

  $('#start').addEventListener('click', () => {
    Sound.click();
    Remote.onChange = null; Remote.onRoom = null;
    newGame({ mode: 'remote', players: Remote.clients.map(c => ({ name: c.name, cid: c.cid, color: c.color })) });
  });
  $('#back').addEventListener('click', () => { Sound.click(); Remote.onChange = null; Remote.onRoom = null; setupScreen(); });
}

if (!CATEGORIES.length) {
  show('<div class="intro"><h1 class="intro-title">Keine Fragen gefunden</h1><p class="intro-text">Die Datei questions.js fehlt oder ist leer.</p></div>');
} else {
  if (Net.forceLocal) setupMode = 'remote';
  setupScreen();
}
