'use strict';
/* Kopfnuss – ein Party-Quiz mit Sabotage. Keine Abhängigkeiten. */

const SETTINGS = {
  rounds: 3,          // Anzahl der Runden vor dem Finale
  perRound: 3,        // Fragen pro Runde
  time: 15,           // Sekunden pro Frage
  finaleTime: 12,     // Sekunden pro Frage im Finale
  summit: 10,         // Stufen bis zum Gipfel
  finaleMax: 25       // Notbremse: so viele Finalfragen höchstens
};

const KEYSETS = [['1', '2', '3', '4'], ['7', '8', '9', '0'], ['a', 's', 'd', 'f'], ['h', 'j', 'k', 'l']];
const PLAYER_COLORS = ['#ff6b57', '#ffc83d', '#3ee0a1', '#5cb8ff'];
const DEFAULT_NAMES = ['Koralle', 'Sonne', 'Minze', 'Himmel'];

const ICONS = {
  frost: '<path d="M12 2v20M4 6l16 12M20 6L4 18M9 3l3 3 3-3M9 21l3-3 3 3"/>',
  nebel: '<path d="M3 8c3-2 5 2 9 0s6 2 9 0M3 13c3-2 5 2 9 0s6 2 9 0M3 18c3-2 5 2 9 0s6 2 9 0"/>',
  kreisel: '<path d="M20 12a8 8 0 0 1-14 5M4 12a8 8 0 0 1 14-5"/><path d="M18 3v4h-4M6 21v-4h4"/>',
  klecks: '<path d="M12 3c3 0 3 3 6 4s3 5 1 7 0 5-3 6-4-1-7 0-6-2-5-5-3-4-1-7 6-5 9-5z"/>',
  zeitdieb: '<path d="M6 3h12M6 21h12M7 3c0 5 10 6 10 9s-10 4-10 9M17 3c0 5-10 6-10 9s10 4 10 9"/>',
  spiegel: '<path d="M12 3v18M9 6L3 18h6zM15 6l6 12h-6z"/>',
  schild: '<path d="M12 3l8 3v6c0 5-4 8-8 9-4-1-8-4-8-9V6z"/><path d="M8.5 12l2.5 2.5 4.5-5"/>',
  gipfel: '<path d="M2 20l7-12 4 6 3-4 6 10z"/><path d="M9 8V3l4 2-4 2"/>'
};
const icon = (name, cls = '') => `<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`;

const SABOTAGES = {
  frost:    { name: 'Frost',    desc: 'Die Antworten frieren ein. Erst 5× tippen, dann darf geantwortet werden.' },
  nebel:    { name: 'Nebel',    desc: 'Die Antworten verschwimmen und werden nur langsam scharf.' },
  kreisel:  { name: 'Kreisel',  desc: 'Die Antworten tauschen ständig ihre Plätze.' },
  klecks:   { name: 'Klecks',   desc: 'Tintenflecken verdecken die Antworten. Wegtippen hilft.' },
  zeitdieb: { name: 'Zeitdieb', desc: 'Nur die halbe Zeit zum Antworten.' },
  spiegel:  { name: 'Spiegel',  desc: 'Alle Antworten stehen spiegelverkehrt da.' }
};

/* ---------- Hilfsfunktionen ---------- */
const app = document.getElementById('app');
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const wait = ms => new Promise(r => setTimeout(r, ms));
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const shuffle = arr => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const keyLabel = k => k.toUpperCase();

let keyHandler = null;
document.addEventListener('keydown', e => {
  if (e.target.closest && e.target.closest('input, textarea, select')) return;
  if (!keyHandler) return;
  let k = e.key.toLowerCase();
  if (k === ' ' || k === 'spacebar') k = 'space';
  if (keyHandler(k) === true) e.preventDefault();
});

function show(html, cls = '') {
  keyHandler = null;
  app.className = 'screen ' + cls;
  app.innerHTML = html;
  window.scrollTo(0, 0);
}

/* "Weiter" per Klick, Enter oder Leertaste */
function waitContinue(btn, extraKeys) {
  return new Promise(resolve => {
    const done = () => { keyHandler = null; Sound.click(); resolve(); };
    btn.addEventListener('click', done, { once: true });
    keyHandler = k => { if (k === 'enter' || k === 'space' || (extraKeys && extraKeys(k))) { done(); return true; } };
    btn.focus({ preventScroll: true });
  });
}

/* ---------- Klang (WebAudio, startet erst nach dem ersten Klick) ---------- */
const Sound = {
  ctx: null,
  on: (() => { try { return localStorage.getItem('kopfnuss-ton') !== 'aus'; } catch { return true; } })(),
  init() {
    if (this.ctx) return;
    try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { this.ctx = null; }
  },
  tone(freq, dur, { type = 'sine', vol = 0.12, delay = 0, to = null } = {}) {
    if (!this.on || !this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.ctx.destination); o.start(t); o.stop(t + dur + 0.02);
  },
  click() { this.tone(660, 0.06, { type: 'triangle', vol: 0.08 }); },
  tick() { this.tone(1200, 0.04, { type: 'square', vol: 0.04 }); },
  lock() { this.tone(520, 0.08, { type: 'triangle' }); this.tone(780, 0.1, { type: 'triangle', delay: 0.06 }); },
  good() { [523, 659, 784].forEach((f, i) => this.tone(f, 0.18, { type: 'triangle', delay: i * 0.08 })); },
  bad() { this.tone(220, 0.3, { type: 'sawtooth', vol: 0.06, to: 110 }); },
  crack() { this.tone(1800, 0.05, { type: 'square', vol: 0.05, to: 600 }); },
  sabo() { this.tone(900, 0.35, { type: 'sawtooth', vol: 0.05, to: 140 }); },
  climb() { this.tone(440, 0.12, { type: 'triangle', to: 880 }); },
  win() { [523, 659, 784, 1047, 784, 1047].forEach((f, i) => this.tone(f, 0.22, { type: 'triangle', delay: i * 0.12 })); }
};
document.addEventListener('pointerdown', () => Sound.init(), { once: true });
document.addEventListener('keydown', () => Sound.init(), { once: true });

/* ---------- Fragen ziehen ---------- */
const BANK = window.KOPFNUSS_FRAGEN || {};
const CATEGORIES = Object.keys(BANK);
const HIST_KEY = 'kopfnuss-gestellt';
function loadHistory() { try { return new Set(JSON.parse(localStorage.getItem(HIST_KEY) || '[]')); } catch { return new Set(); } }
function saveHistory(set) { try { localStorage.setItem(HIST_KEY, JSON.stringify([...set])); } catch { /* egal */ } }
const TOTAL_QUESTIONS = CATEGORIES.reduce((n, c) => n + BANK[c].length, 0);

function availableIn(cat) { return BANK[cat].map((_, i) => `${cat}|${i}`).filter(id => !S.used.has(id)); }

function draw(cat) {
  let ids = availableIn(cat);
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
  S = {
    players: setup.names.map((name, i) => ({ id: i, name, color: PLAYER_COLORS[i], keys: KEYSETS[i], score: 0, pending: [], climb: 0, correctCount: 0 })),
    used: new Set(),
    history: loadHistory(),
    qCount: 0
  };
  runGame();
}

async function runGame() {
  const solo = S.players.length === 1;
  for (let r = 1; r <= SETTINGS.rounds; r++) {
    const mult = r === SETTINGS.rounds ? 2 : 1;
    await introScreen({
      kicker: `Runde ${r} von ${SETTINGS.rounds}`,
      title: r === SETTINGS.rounds ? 'Doppelte Punkte' : r === 1 ? 'Aufwärmen' : 'Jetzt wird’s ernst',
      text: solo ? `${SETTINGS.perRound} Fragen. Je schneller du richtig antwortest, desto mehr Punkte.`
        : `${SETTINGS.perRound} Fragen. Vorher dürft ihr euch gegenseitig Steine in den Weg legen.`
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
function introScreen({ kicker, title, text }) {
  show(`
    <div class="intro">
      <p class="kicker">${esc(kicker)}</p>
      <h1 class="intro-title">${esc(title)}</h1>
      <p class="intro-text">${esc(text)}</p>
      <button class="btn btn-go" id="go">Weiter <kbd>Enter</kbd></button>
    </div>`, 'is-intro');
  return waitContinue($('#go'));
}

function playerChip(p, extra = '') {
  return `<span class="pchip" style="--pc:${p.color}">${esc(p.name)}${extra}</span>`;
}

function chooserFor(q) {
  const ps = S.players;
  const min = Math.min(...ps.map(p => p.score));
  const lowest = ps.filter(p => p.score === min);
  return lowest[S.qCount % lowest.length];
}

function categoryPhase(round, q) {
  const chooser = chooserFor();
  const cats = shuffle(CATEGORIES.filter(c => availableIn(c).length)).slice(0, 3);
  if (cats.length <= 1) return Promise.resolve(cats[0]);
  show(`
    <div class="choose">
      <p class="kicker">Runde ${round} · Frage ${q}/${SETTINGS.perRound}</p>
      <h2 class="choose-title">${playerChip(chooser)} wählt die Kategorie</h2>
      <p class="choose-hint">${S.players.length > 1 ? 'Wer hinten liegt, darf wählen.' : 'Such dir ein Thema aus.'}</p>
      <div class="cards cards-${cats.length}">
        ${cats.map((c, i) => `
          <button class="card cat-card" data-i="${i}" style="--pc:${chooser.color}">
            <kbd>${keyLabel(chooser.keys[i])}</kbd>
            <span class="card-title">${esc(c)}</span>
            <span class="card-sub">${availableIn(c).length} Fragen übrig</span>
          </button>`).join('')}
      </div>
    </div>`, 'is-choose');
  return new Promise(resolve => {
    const choose = i => { keyHandler = null; Sound.click(); $$('.cat-card')[i].classList.add('chosen'); setTimeout(() => resolve(cats[i]), 380); };
    $$('.cat-card').forEach(b => b.addEventListener('click', () => choose(+b.dataset.i), { once: true }));
    keyHandler = k => { const i = chooser.keys.indexOf(k); if (i >= 0 && i < cats.length) { choose(i); return true; } };
  });
}

/* Sabotage: jede Person wählt nacheinander. Schilde wirken gegen alles in dieser Runde. */
async function sabotagePhase() {
  const order = S.players.slice().sort((a, b) => a.score - b.score || a.id - b.id);
  const plans = [];
  for (const p of order) {
    const options = shuffle(Object.keys(SABOTAGES)).slice(0, 2).concat('schild');
    const choice = await pickOption(p, options);
    if (choice === 'schild') { plans.push({ from: p, type: 'schild' }); continue; }
    const targets = S.players.filter(t => t !== p);
    const target = targets.length === 1 ? targets[0] : await pickTarget(p, choice, targets);
    plans.push({ from: p, type: choice, target });
  }
  const shielded = new Set(plans.filter(x => x.type === 'schild').map(x => x.from));
  const lines = plans.map(x => {
    if (x.type === 'schild') return `<li>${playerChip(x.from)} <span class="arrow">hält ein</span> <b class="tag tag-shield">${icon('schild')}Schild</b> <span class="arrow">hoch</span></li>`;
    const blocked = shielded.has(x.target);
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
  await waitContinue($('#go'));
}

function pickOption(p, options) {
  show(`
    <div class="choose">
      <p class="kicker">Sabotage</p>
      <h2 class="choose-title">${playerChip(p)} ist dran</h2>
      <p class="choose-hint">Die anderen schauen weg. Oder auch nicht.</p>
      <div class="cards cards-3">
        ${options.map((o, i) => {
          const isShield = o === 'schild';
          return `<button class="card sabo-card ${isShield ? 'shield' : ''}" data-i="${i}" style="--pc:${p.color}">
            <kbd>${keyLabel(p.keys[i])}</kbd>
            ${icon(o, 'card-ic')}
            <span class="card-title">${isShield ? 'Schild' : SABOTAGES[o].name}</span>
            <span class="card-sub">${isShield ? 'Wehrt in dieser Runde jede Falle gegen dich ab.' : esc(SABOTAGES[o].desc)}</span>
          </button>`;
        }).join('')}
      </div>
    </div>`, 'is-choose');
  return new Promise(resolve => {
    const choose = i => { keyHandler = null; Sound.click(); resolve(options[i]); };
    $$('.sabo-card').forEach(b => b.addEventListener('click', () => choose(+b.dataset.i), { once: true }));
    keyHandler = k => { const i = p.keys.indexOf(k); if (i >= 0 && i < options.length) { choose(i); return true; } };
  });
}

function pickTarget(p, type, targets) {
  show(`
    <div class="choose">
      <p class="kicker">${esc(SABOTAGES[type].name)}</p>
      <h2 class="choose-title">Wen soll es treffen?</h2>
      <p class="choose-hint">${playerChip(p)} entscheidet.</p>
      <div class="cards cards-${targets.length}">
        ${targets.map((t, i) => `
          <button class="card target-card" data-i="${i}" style="--pc:${t.color}">
            <kbd style="--pc:${p.color}">${keyLabel(p.keys[i])}</kbd>
            <span class="card-title">${esc(t.name)}</span>
            <span class="card-sub">${t.score.toLocaleString('de-DE')} Punkte</span>
          </button>`).join('')}
      </div>
    </div>`, 'is-choose');
  return new Promise(resolve => {
    const choose = i => { keyHandler = null; Sound.sabo(); resolve(targets[i]); };
    $$('.target-card').forEach(b => b.addEventListener('click', () => choose(+b.dataset.i), { once: true }));
    keyHandler = k => { const i = p.keys.indexOf(k); if (i >= 0 && i < targets.length) { choose(i); return true; } };
  });
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

function questionPhase(q, opts) {
  const limit = opts.time * 1000;
  const n = S.players.length;
  const baseOrder = shuffle([0, 1, 2, 3]);
  const st = S.players.map(p => {
    const fx = new Set(opts.effects ? p.pending : []);
    return { p, fx, order: baseOrder.slice(), choice: null, at: null, done: false, frost: fx.has('frost') ? 5 : 0, deadline: fx.has('zeitdieb') ? limit / 2 : limit, timedOut: false };
  });

  show(`
    <div class="quiz">
      <header class="qhead">
        <span class="label">${esc(opts.label)}</span>
        <span class="label cat">${esc(q.cat)}</span>
        ${opts.mult > 1 ? `<span class="label mult">× ${opts.mult} Punkte</span>` : ''}
      </header>
      ${opts.climb ? climbTrack() : ''}
      <h2 class="question">${esc(q.text)}</h2>
      <div class="timer" aria-hidden="true"><div class="timer-fill"></div></div>
      <div class="panels panels-${n}">
        ${st.map((s, i) => `
          <section class="panel" data-p="${i}" style="--pc:${s.p.color}">
            <div class="ptop">
              <span class="pname">${esc(s.p.name)}</span>
              <span class="pscore">${opts.climb ? `Stufe ${s.p.climb}` : s.p.score.toLocaleString('de-DE')}</span>
            </div>
            ${s.fx.size ? `<div class="fxbar">${[...s.fx].map(f => `<span class="fx">${icon(f)}${SABOTAGES[f].name}</span>`).join('')}</div>` : ''}
            ${s.fx.has('zeitdieb') ? '<div class="ptimer"><div></div></div>' : ''}
            <div class="answer-zone">
              <div class="answers"></div>
              <div class="blobs"></div>
              ${s.frost ? `<button class="frost" aria-label="Eis freikratzen">${icon('frost', 'frost-ic')}<span>Freikratzen <b>${s.frost}×</b></span></button>` : ''}
              <div class="stamp" hidden></div>
            </div>
          </section>`).join('')}
      </div>
      <div class="after" hidden><button class="btn btn-go" id="go">Weiter <kbd>Enter</kbd></button></div>
    </div>`, 'is-quiz');

  const panels = $$('.panel');
  const fill = $('.timer-fill');

  function renderAnswers(i) {
    const s = st[i];
    const box = $('.answers', panels[i]);
    box.innerHTML = s.order.map((a, slot) => `
      <button class="ans" data-slot="${slot}">
        <kbd>${keyLabel(s.p.keys[slot])}</kbd><span class="atext">${esc(q.answers[a])}</span>
      </button>`).join('');
    $$('.ans', box).forEach(b => b.addEventListener('click', () => input(i, +b.dataset.slot)));
  }

  st.forEach((s, i) => {
    renderAnswers(i);
    const panel = panels[i];
    if (s.fx.has('spiegel')) panel.classList.add('fx-spiegel');
    if (s.fx.has('nebel')) panel.classList.add('fx-nebel');
    if (s.fx.has('klecks')) {
      const layer = $('.blobs', panel);
      for (let b = 0; b < 6; b++) {
        const el = document.createElement('button');
        el.className = 'blob';
        el.setAttribute('aria-label', 'Klecks wegwischen');
        el.style.cssText = `left:${5 + Math.random() * 70}%;top:${Math.random() * 78}%;--s:${48 + Math.random() * 46}px;--r:${Math.random() * 360}deg`;
        el.addEventListener('click', e => { e.stopPropagation(); el.classList.add('gone'); Sound.crack(); });
        layer.appendChild(el);
      }
    }
    const fr = $('.frost', panel);
    if (fr) fr.addEventListener('click', () => input(i, 0));
  });

  const start = performance.now();
  let raf = 0, finished = false, lastTick = -1;
  let resolveQ;
  const donePromise = new Promise(r => { resolveQ = r; });
  function finish() { if (finished) return; finished = true; cancelAnimationFrame(raf); setTimeout(reveal, 250); }
  const spinners = st.map((s, i) => s.fx.has('kreisel') ? setInterval(() => {
    if (s.done || s.frost) return;
    s.order = shuffle(s.order);
    renderAnswers(i);
    $('.answers', panels[i]).animate([{ transform: 'scale(.96)', opacity: .4 }, { transform: 'none', opacity: 1 }], { duration: 220 });
  }, 1600) : null);

  function input(i, slot) {
    const s = st[i];
    if (finished || s.done) return;
    if (s.frost > 0) {
      s.frost--;
      Sound.crack();
      const fr = $('.frost', panels[i]);
      if (s.frost === 0) { fr.classList.add('broken'); setTimeout(() => fr.remove(), 300); }
      else { $('b', fr).textContent = `${s.frost}×`; fr.animate([{ transform: 'translateX(-4px)' }, { transform: 'translateX(4px)' }, { transform: 'none' }], { duration: 140 }); }
      return;
    }
    s.choice = s.order[slot];
    s.at = performance.now() - start;
    s.done = true;
    panels[i].classList.add('locked');
    $$('.ans', panels[i])[slot].classList.add('picked');
    const stamp = $('.stamp', panels[i]);
    stamp.textContent = 'Eingeloggt'; stamp.hidden = false;
    Sound.lock();
    if (st.every(x => x.done)) setTimeout(finish, 350);
  }

  keyHandler = k => {
    let hit = false;
    st.forEach((s, i) => { const slot = s.p.keys.indexOf(k); if (slot >= 0) { input(i, slot); hit = true; } });
    return hit;
  };

  function frame(now) {
    if (finished) return;
    const el = now - start;
    fill.style.transform = `scaleX(${Math.max(0, 1 - el / limit)})`;
    fill.classList.toggle('hurry', limit - el < 5000);
    const sec = Math.ceil((limit - el) / 1000);
    if (sec <= 5 && sec !== lastTick && sec > 0) { lastTick = sec; Sound.tick(); }
    st.forEach((s, i) => {
      const panel = panels[i];
      if (s.fx.has('nebel')) panel.style.setProperty('--fog', `${(10 * Math.max(0, 1 - el / (limit * 0.8))).toFixed(2)}px`);
      if (s.fx.has('zeitdieb')) { const b = $('.ptimer div', panel); if (b) b.style.transform = `scaleX(${Math.max(0, 1 - el / s.deadline)})`; }
      if (s.fx.has('klecks') && el > limit * 0.7) panel.classList.add('blobs-fading');
      if (!s.done && el >= s.deadline) {
        s.done = true; s.timedOut = true;
        panel.classList.add('locked');
        const stamp = $('.stamp', panel); stamp.textContent = 'Zeit um'; stamp.hidden = false;
      }
    });
    if (el >= limit || st.every(s => s.done)) return finish();
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);

  async function reveal() {
    spinners.forEach(id => id && clearInterval(id));
    keyHandler = null;
    // Antworten wieder lesbar machen
    st.forEach((s, i) => {
      const panel = panels[i];
      panel.classList.remove('fx-spiegel', 'fx-nebel');
      panel.style.setProperty('--fog', '0px');
      panel.classList.add('revealed');
      $('.blobs', panel).innerHTML = '';
      const fr = $('.frost', panel); if (fr) fr.remove();
      $('.stamp', panel).hidden = true;
      $$('.ans', panel).forEach((b, slot) => {
        const a = s.order[slot];
        if (a === q.correct) b.classList.add('right');
        else if (a === s.choice) b.classList.add('wrong');
      });
    });
    $('.timer').classList.add('done');

    const results = st.map(s => {
      const correct = s.choice === q.correct;
      const pts = correct ? Math.round((500 + 500 * Math.max(0, 1 - s.at / limit)) * opts.mult / 10) * 10 : 0;
      return { p: s.p, correct, at: s.at, pts, answered: s.choice !== null };
    });
    const anyRight = results.some(r => r.correct);
    anyRight ? Sound.good() : Sound.bad();

    if (opts.climb) {
      const fastest = results.filter(r => r.correct).sort((a, b) => a.at - b.at)[0];
      results.forEach(r => { r.move = r.correct ? (r === fastest && n > 1 ? 2 : 1) : (r.answered ? -1 : 0); r.p.climb = Math.max(0, r.p.climb + r.move); });
    } else {
      results.forEach(r => { r.p.score += r.pts; if (r.correct) r.p.correctCount++; });
    }
    if (opts.effects) S.players.forEach(p => { p.pending = []; });

    results.forEach((r, i) => {
      const panel = panels[i];
      const scoreEl = $('.pscore', panel);
      const pop = document.createElement('div');
      pop.className = 'pop ' + (r.correct ? 'pop-good' : 'pop-bad');
      if (opts.climb) {
        pop.textContent = r.move > 0 ? `+${r.move} Stufe${r.move > 1 ? 'n' : ''}` : r.move < 0 ? '−1 Stufe' : 'bleibt stehen';
        scoreEl.textContent = `Stufe ${r.p.climb}`;
      } else {
        pop.textContent = r.correct ? `+${r.pts}` : r.answered ? 'Falsch' : 'Keine Antwort';
        scoreEl.textContent = r.p.score.toLocaleString('de-DE');
      }
      $('.ptop', panel).insertBefore(pop, scoreEl);
    });
    if (opts.climb) {
      const old = $('.climb');
      old.outerHTML = climbTrack();
      Sound.climb();
    }
    const after = $('.after'); after.hidden = false;
    await waitContinue($('#go'));
    resolveQ(results);
  }
  return donePromise;
}

/* ---------- Zwischenstand ---------- */
function rankList(players, key = 'score') {
  const max = Math.max(1, ...players.map(p => p[key]));
  return players.slice().sort((a, b) => b[key] - a[key]).map((p, i) => `
    <li style="--pc:${p.color}">
      <span class="rank">${i + 1}.</span>
      <span class="rname">${esc(p.name)}</span>
      <span class="rbar"><span style="width:${Math.max(4, p[key] / max * 100)}%"></span></span>
      <span class="rscore">${p[key].toLocaleString('de-DE')}</span>
    </li>`).join('');
}

function standings(r) {
  const last = r === SETTINGS.rounds;
  show(`
    <div class="summary">
      <p class="kicker">Nach Runde ${r}</p>
      <h2 class="choose-title">Zwischenstand</h2>
      <ol class="ranking">${rankList(S.players)}</ol>
      <p class="choose-hint">${last ? 'Gleich geht es zum Gipfel. Wer vorne liegt, startet weiter oben.' : 'Weiter geht’s mit der nächsten Runde.'}</p>
      <button class="btn btn-go" id="go">${last ? 'Zum Finale' : 'Nächste Runde'} <kbd>Enter</kbd></button>
    </div>`, 'is-choose');
  return waitContinue($('#go'));
}

/* ---------- Finale: Gipfelsturm ---------- */
async function finale() {
  const ranked = S.players.slice().sort((a, b) => b.score - a.score);
  const n = S.players.length;
  S.players.forEach(p => {
    const better = S.players.filter(o => o.score > p.score).length;
    p.climb = n - 1 - better;
  });
  show(`
    <div class="intro">
      <p class="kicker">Finale</p>
      <h1 class="intro-title">Gipfelsturm</h1>
      <p class="intro-text">Wer zuerst Stufe ${SETTINGS.summit} erreicht, gewinnt. Richtig bringt eine Stufe, die schnellste richtige Antwort zwei. Wer falsch antwortet, rutscht eine Stufe ab.</p>
      ${climbTrack()}
      <p class="intro-text small">${n > 1 ? `Startplätze nach Punkten: ${ranked.map(p => `${esc(p.name)} Stufe ${p.climb}`).join(' · ')}` : 'Schaffst du es nach oben?'}</p>
      <button class="btn btn-go" id="go">Los <kbd>Enter</kbd></button>
    </div>`, 'is-intro');
  await waitContinue($('#go'));

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
        <button class="btn btn-ghost" id="setup">Neue Spielrunde einrichten</button>
      </div>
    </div>`, 'is-final');
  $('#again').addEventListener('click', () => { Sound.click(); newGame(lastSetup); });
  $('#setup').addEventListener('click', () => { Sound.click(); setupScreen(); });
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

/* ---------- Start: Spieler einrichten ---------- */
function setupScreen() {
  let count = lastSetup ? lastSetup.names.length : 2;
  const names = lastSetup ? lastSetup.names.slice() : DEFAULT_NAMES.slice();
  while (names.length < 4) names.push(DEFAULT_NAMES[names.length]);

  show(`
    <div class="setup">
      <div class="logo">
        <h1 class="wordmark">Kopf<span>nuss</span></h1>
        <p class="tagline">Das Quiz, bei dem du deine Freunde ausbremst.</p>
      </div>
      <div class="setup-grid">
        <section class="box">
          <h2 class="box-title">Wer spielt mit?</h2>
          <div class="count" role="group" aria-label="Anzahl der Spieler">
            ${[1, 2, 3, 4].map(c => `<button class="count-btn" data-c="${c}" aria-pressed="${c === count}">${c}</button>`).join('')}
          </div>
          <div class="players"></div>
          <button class="btn btn-go btn-wide" id="start">Spiel starten</button>
        </section>
        <section class="box box-rules">
          <h2 class="box-title">So geht’s</h2>
          <ol class="rules">
            <li><b>${SETTINGS.rounds} Runden mit je ${SETTINGS.perRound} Fragen.</b> Alle antworten gleichzeitig auf einem Bildschirm. Schnell und richtig gibt bis zu 1.000 Punkte, in der letzten Runde das Doppelte.</li>
            <li><b>Sabotage vor jeder Runde.</b> Schick anderen Frost, Nebel, Kreisel, Kleckse, Zeitdieb oder Spiegel. Oder halte ein Schild hoch.</li>
            <li><b>Wer hinten liegt, wählt die Kategorie.</b></li>
            <li><b>Finale Gipfelsturm.</b> Wer vorne liegt, startet höher. Wer zuerst oben ist, gewinnt.</li>
          </ol>
          <p class="rules-note">Antworten per Tippen oder mit der Tastatur. Jede Person hat ihre eigenen vier Tasten.</p>
          <label class="sound-toggle"><input type="checkbox" id="sound" ${Sound.on ? 'checked' : ''}> Ton an</label>
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
  renderPlayers();
  $$('.count-btn').forEach(b => b.addEventListener('click', () => {
    count = +b.dataset.c; Sound.click();
    $$('.count-btn').forEach(x => x.setAttribute('aria-pressed', x === b));
    renderPlayers();
  }));
  $('#sound').addEventListener('change', e => {
    Sound.on = e.target.checked; Sound.init();
    try { localStorage.setItem('kopfnuss-ton', Sound.on ? 'an' : 'aus'); } catch { /* egal */ }
    Sound.click();
  });
  $('#start').addEventListener('click', () => {
    Sound.init(); Sound.click();
    const final = names.slice(0, count).map((nm, i) => (nm || '').trim() || DEFAULT_NAMES[i]);
    newGame({ names: final });
  });
}

if (!CATEGORIES.length) {
  show('<div class="intro"><h1 class="intro-title">Keine Fragen gefunden</h1><p class="intro-text">Die Datei questions.js fehlt oder ist leer.</p></div>');
} else {
  setupScreen();
}
