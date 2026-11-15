'use strict';
/* Gemeinsame Bausteine für Bildschirm (game.js) und Handy (controller.js). */

const PLAYER_COLORS = ['#ff6b57', '#ffc83d', '#3ee0a1', '#5cb8ff'];
const DOOR_COLORS = ['#a98bea', '#f6a15b', '#4fcfc0', '#ee7fb4'];   // Türen der Kategorie-Abstimmung

const ICONS = {
  frost: '<path d="M12 2v20M4 6l16 12M20 6L4 18M9 3l3 3 3-3M9 21l3-3 3 3"/>',
  nebel: '<path d="M3 8c3-2 5 2 9 0s6 2 9 0M3 13c3-2 5 2 9 0s6 2 9 0M3 18c3-2 5 2 9 0s6 2 9 0"/>',
  kreisel: '<path d="M20 12a8 8 0 0 1-14 5M4 12a8 8 0 0 1 14-5"/><path d="M18 3v4h-4M6 21v-4h4"/>',
  klecks: '<path d="M12 3c3 0 3 3 6 4s3 5 1 7 0 5-3 6-4-1-7 0-6-2-5-5-3-4-1-7 6-5 9-5z"/>',
  zeitdieb: '<path d="M6 3h12M6 21h12M7 3c0 5 10 6 10 9s-10 4-10 9M17 3c0 5-10 6-10 9s10 4 10 9"/>',
  spiegel: '<path d="M12 3v18M9 6L3 18h6zM15 6l6 12h-6z"/>',
  schild: '<path d="M12 3l8 3v6c0 5-4 8-8 9-4-1-8-4-8-9V6z"/><path d="M8.5 12l2.5 2.5 4.5-5"/>',
  gipfel: '<path d="M2 20l7-12 4 6 3-4 6 10z"/><path d="M9 8V3l4 2-4 2"/>',
  handy: '<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/>',
  bildschirm: '<rect x="2" y="4" width="20" height="13" rx="2"/><path d="M8 21h8M12 17v4"/>'
};
const icon = (name, cls = '') => ICONS[name] ? `<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>` : '';

const SABOTAGES = {
  frost:    { name: 'Frost',    desc: 'Die Antworten frieren ein. Erst 5× tippen, dann darf geantwortet werden.' },
  nebel:    { name: 'Nebel',    desc: 'Die Antworten verschwimmen und werden nur langsam scharf.' },
  kreisel:  { name: 'Kreisel',  desc: 'Die Antworten tauschen ständig ihre Plätze.' },
  klecks:   { name: 'Klecks',   desc: 'Tintenflecken verdecken die Antworten. Wegtippen hilft.' },
  zeitdieb: { name: 'Zeitdieb', desc: 'Nur die halbe Zeit zum Antworten.' },
  spiegel:  { name: 'Spiegel',  desc: 'Alle Antworten stehen spiegelverkehrt da.' }
};

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const wait = ms => new Promise(r => setTimeout(r, ms));
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const shuffle = arr => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function pref(key, def) { try { const v = localStorage.getItem(key); return v === null ? def : v === '1'; } catch { return def; } }
function setPref(key, val) { try { localStorage.setItem(key, val ? '1' : '0'); } catch { /* egal */ } }

/* Klang (WebAudio, startet erst nach dem ersten Tippen) */
const Sound = {
  ctx: null,
  on: pref('kopfnuss-sound', true),
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
  fanfare() { [392, 523, 659, 784, 659, 784, 1047].forEach((f, i) => this.tone(f, i === 6 ? 0.4 : 0.13, { type: 'square', vol: 0.05, delay: i * 0.09 })); },
  drumroll() { for (let i = 0; i < 16; i++) this.tone(150 + (i % 2) * 30, 0.05, { type: 'triangle', vol: 0.05 + i * 0.006, delay: i * 0.075 }); },
  whoops() { this.tone(880, 0.55, { type: 'sine', vol: 0.1, to: 160 }); this.tone(140, 0.18, { type: 'square', vol: 0.05, delay: 0.55 }); },
  hop(i = 0) { this.tone(480 + (i % 12) * 34, 0.07, { type: 'square', vol: 0.06 }); this.tone(960 + (i % 12) * 34, 0.05, { type: 'triangle', vol: 0.04, delay: 0.02 }); },
  landed() { this.tone(523, 0.1, { type: 'square', vol: 0.06 }); this.tone(784, 0.1, { type: 'square', vol: 0.06, delay: 0.09 }); this.tone(1047, 0.35, { type: 'square', vol: 0.07, delay: 0.18 }); },
  boing() { this.tone(180, 0.28, { type: 'sine', vol: 0.12, to: 520 }); },
  win() { [523, 659, 784, 1047, 784, 1047].forEach((f, i) => this.tone(f, 0.22, { type: 'triangle', delay: i * 0.12 })); }
};
document.addEventListener('pointerdown', () => Sound.init(), { once: true });
document.addEventListener('keydown', () => Sound.init(), { once: true });
