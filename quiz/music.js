'use strict';
/*
  Titelmusik für Kopfnuss. Eine eigene Komposition, komplett im Browser erzeugt
  (WebAudio-Synthesizer, keine Audiodateien): hüpfender Bass, Akkorde auf dem
  Nachschlag, eine fröhliche Melodie und Schlagzeug. 16 Takte, dann von vorn.

  KopfnussMusic.start()  – spielt (braucht vorher einen Klick oder Tastendruck)
  KopfnussMusic.stop(s)  – blendet in s Sekunden aus
  KopfnussMusic.beat()   – aktuelle Position in Schlägen, damit die Bühne im Takt wippen kann
*/
window.KopfnussMusic = (() => {
  const BPM = 132, STEP = 60 / BPM / 4;   // Sechzehntel
  const midi = n => 440 * Math.pow(2, (n - 69) / 12);
  // Notennamen → MIDI
  const N = {}; ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'].forEach((n, i) => { for (let o = 1; o < 8; o++) N[n + o] = 12 * (o + 1) + i; });

  // Akkorde pro Takt: Grundton für den Bass, Dreiklang für die Nachschläge
  const CH = {
    C: { root: N.C2, tri: [N.E4, N.G4, N.C5] }, F: { root: N.F2, tri: [N.F4, N.A4, N.C5] }, G: { root: N.G2, tri: [N.D4, N.G4, N.B4] },
    Am: { root: N.A2, tri: [N.E4, N.A4, N.C5] }, Dm: { root: N.D2, tri: [N.F4, N.A4, N.D5] }
  };
  // Halbe Takte, damit ein Takt zwei Akkorde haben kann
  const CHORDS = ['C', 'C', 'C', 'C', 'F', 'F', 'G', 'G', 'C', 'C', 'Am', 'Am', 'F', 'G', 'C', 'C',
    'F', 'F', 'F', 'F', 'C', 'C', 'C', 'C', 'Dm', 'Dm', 'G', 'G', 'C', 'C', 'G', 'G'];

  // Melodie: pro Takt [Sechzehntel, Ton, Länge]
  const MELODY = [
    [[0, 'E5', 2], [2, 'G5', 2], [4, 'C6', 3], [8, 'A5', 2], [10, 'G5', 2], [12, 'E5', 2], [14, 'G5', 2]],
    [[0, 'G5', 6], [8, 'E5', 2], [10, 'D5', 2], [12, 'C5', 4]],
    [[0, 'F5', 2], [2, 'A5', 2], [4, 'C6', 3], [8, 'D6', 2], [10, 'C6', 2], [12, 'A5', 2], [14, 'C6', 2]],
    [[0, 'B5', 6], [8, 'G5', 2], [10, 'A5', 2], [12, 'B5', 2], [14, 'D6', 2]],
    [[0, 'E6', 3], [4, 'C6', 2], [6, 'G5', 2], [8, 'C6', 3], [12, 'E6', 2], [14, 'D6', 2]],
    [[0, 'C6', 6], [8, 'A5', 2], [10, 'C6', 2], [12, 'E6', 4]],
    [[0, 'F6', 2], [2, 'E6', 2], [4, 'D6', 2], [6, 'C6', 2], [8, 'D6', 2], [10, 'B5', 2], [12, 'G5', 2], [14, 'B5', 2]],
    [[0, 'C6', 8], [12, 'G5', 2], [14, 'A5', 2]],
    [[0, 'A5', 2], [2, 'A5', 1], [4, 'A5', 2], [6, 'C6', 2], [8, 'A5', 4], [12, 'F5', 4]],
    [[0, 'A5', 2], [2, 'A5', 1], [4, 'A5', 2], [6, 'C6', 2], [8, 'D6', 7]],
    [[0, 'G5', 2], [2, 'G5', 1], [4, 'G5', 2], [6, 'C6', 2], [8, 'G5', 4], [12, 'E5', 4]],
    [[0, 'G5', 2], [2, 'A5', 2], [4, 'C6', 2], [6, 'E6', 2], [8, 'G6', 7]],
    [[0, 'F6', 3], [4, 'D6', 2], [6, 'A5', 2], [8, 'D6', 3], [12, 'F6', 2], [14, 'E6', 2]],
    [[0, 'D6', 4], [4, 'B5', 4], [8, 'G5', 4], [12, 'B5', 2], [14, 'D6', 2]],
    [[0, 'E6', 2], [2, 'C6', 2], [4, 'E6', 2], [6, 'G6', 2], [8, 'E6', 2], [10, 'C6', 2], [12, 'G5', 4]],
    [[0, 'G5', 2], [2, 'B5', 2], [4, 'D6', 2], [6, 'G6', 5]]
  ];
  const BARS = MELODY.length;

  let ctx = null, out = null, noise = null, timer = 0, playing = false, t0 = 0, step = 0, nextT = 0;
  let enabled = (() => { try { return localStorage.getItem('kopfnuss-musik') !== '0'; } catch { return true; } })();

  function setup() {
    if (ctx) return true;
    if (typeof Sound !== 'undefined') { Sound.init(); ctx = Sound.ctx; }
    if (!ctx) { try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return false; } }
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.ratio.value = 5; comp.attack.value = 0.005; comp.release.value = 0.2;
    out = ctx.createGain();
    out.gain.value = 0;
    out.connect(comp); comp.connect(ctx.destination);
    const len = ctx.sampleRate * 0.5;
    noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return true;
  }

  // Ein Ton mit Hüllkurve. type: Wellenform, cut: Tiefpass in Hz
  function tone(t, freq, dur, { type = 'square', vol = 0.1, cut = 3200, slide = 0, vib = 0 } = {}) {
    const o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
    if (vib) { const l = ctx.createOscillator(), lg = ctx.createGain(); l.frequency.value = 6; lg.gain.value = freq * vib; l.connect(lg); lg.connect(o.frequency); l.start(t + 0.08); l.stop(t + dur + 0.05); }
    f.type = 'lowpass'; f.frequency.value = cut;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    g.gain.setValueAtTime(vol, t + dur * 0.55);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f); f.connect(g); g.connect(out);
    o.start(t); o.stop(t + dur + 0.03);
  }
  function hit(t, dur, { vol = 0.1, type = 'highpass', freq = 7000 } = {}) {
    const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noise; f.type = type; f.frequency.value = freq;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(out);
    s.start(t); s.stop(t + dur + 0.02);
  }

  function schedule(s, t) {
    const bar = Math.floor(s / 16) % BARS, st = s % 16;
    const chord = CH[CHORDS[bar * 2 + (st < 8 ? 0 : 1)]];
    const last = bar === 7 || bar === 15;
    // Schlagzeug
    if (st === 0 || st === 8 || (st === 10 && bar % 2)) tone(t, 150, 0.14, { type: 'sine', vol: 0.5, slide: 0.3, cut: 900 });
    if (st === 4 || st === 12 || (last && st >= 12)) { hit(t, 0.11, { vol: 0.2, type: 'bandpass', freq: 1900 }); tone(t, 190, 0.07, { type: 'triangle', vol: 0.12, slide: 0.6, cut: 1200 }); }
    if (st % 4 === 2) hit(t, 0.045, { vol: 0.09 });
    else if (st % 2 === 0) hit(t, 0.025, { vol: 0.04 });
    else hit(t, 0.02, { vol: 0.018, freq: 9000 });
    // Bass: hüpft zwischen Grundton, Quinte und Oktave
    const bass = { 0: 0, 6: 0, 8: 7, 14: 12 }[st];
    if (bass !== undefined) { tone(t, midi(chord.root + bass), STEP * 2.4, { type: 'triangle', vol: 0.26, cut: 700 }); tone(t, midi(chord.root + bass - 12), STEP * 2.2, { type: 'sine', vol: 0.16, cut: 300 }); }
    // Akkorde auf dem Nachschlag
    if (st % 4 === 2) chord.tri.forEach(n => tone(t, midi(n), STEP * 1.3, { type: 'sawtooth', vol: 0.035, cut: 2400 }));
    // Melodie, eine Oktave tiefer leise mitgespielt
    MELODY[bar].forEach(([at, note, len]) => {
      if (at !== st) return;
      const f = midi(N[note]), dur = len * STEP * 0.92;
      tone(t, f, dur, { type: 'square', vol: 0.075, cut: 4200, vib: len > 3 ? 0.006 : 0 });
      tone(t, f / 2, dur, { type: 'triangle', vol: 0.05, cut: 2000 });
    });
  }

  function pump() {
    if (!playing) return;
    while (nextT < ctx.currentTime + 0.25) { schedule(step, nextT); step++; nextT += STEP; }
  }

  function start() {
    if (playing || !enabled || !setup()) return false;
    if (ctx.state === 'suspended') { ctx.resume().catch(() => {}); if (ctx.state === 'suspended') return false; }
    playing = true;
    step = 0; t0 = nextT = ctx.currentTime + 0.08;
    out.gain.cancelScheduledValues(ctx.currentTime);
    out.gain.setValueAtTime(0.0001, ctx.currentTime);
    out.gain.exponentialRampToValueAtTime(0.5, ctx.currentTime + 0.4);
    pump();
    timer = setInterval(pump, 60);
    return true;
  }
  function stop(fade = 1.2) {
    if (!playing) return;
    playing = false;
    clearInterval(timer);
    out.gain.cancelScheduledValues(ctx.currentTime);
    out.gain.setValueAtTime(out.gain.value, ctx.currentTime);
    out.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + fade);
  }

  return {
    start, stop,
    beat: () => (playing ? Math.max(0, (ctx.currentTime - t0) / (STEP * 4)) : 0),
    get playing() { return playing; },
    get enabled() { return enabled; },
    set enabled(v) { enabled = !!v; try { localStorage.setItem('kopfnuss-musik', enabled ? '1' : '0'); } catch { /* egal */ } if (!enabled) stop(0.3); },
    // zum Testen: rendert die ersten Takte in einen OfflineAudioContext
    render(offline, bars = 16) { ctx = offline; out = offline.createGain(); out.gain.value = 0.5; out.connect(offline.destination); const len = offline.sampleRate * 0.5; noise = offline.createBuffer(1, len, offline.sampleRate); const d = noise.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1; for (let s = 0; s < bars * 16; s++) schedule(s, 0.05 + s * STEP); }
  };
})();
