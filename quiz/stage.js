'use strict';
/*
  Papier-Bühne für den großen Bildschirm (three.js r128).

  Alles ist ein Diorama aus Papier und Pappe: Figuren, Kulissen und Schilder
  sind flache Ausschnitte mit Tuschekontur, weißem Papierrand und sichtbarer
  Pappkante. Sie stehen hintereinander im Raum, die Kamera schwenkt leicht,
  dadurch verschieben sich die Ebenen gegeneinander. Gezeichnet wird alles
  hier im Code auf Canvas-Flächen, es gibt keine Bilddateien.

  Die Figuren drehen sich wie eine Spielkarte um, hüpfen beim Laufen und
  wechseln ihr Gesicht je nach Stimmung. Bei der Auflösung laufen sie auf das
  Feld ihrer Antwort. Im Finale steigen sie eine Papptreppe hoch, am Ende
  gibt es ein Siegerpodest mit Konfetti.

  Die Bühne füllt ihr Element ganz aus. Mit setInsets sagt das Spiel, wie viel
  Platz Überschriften und Leisten am Rand verdecken; die Kamera hält das
  Geschehen dann im freien Bereich.

  Ohne three.js oder ohne WebGL ist Stage.ok = false. Das Spiel zeigt dann
  einfach die 2D-Ansicht.
*/
const Stage = (() => {
  const T = window.THREE;
  const noop = () => {};
  const done = () => Promise.resolve();
  const fallback = { ok: false, mount: noop, setPlayers: noop, setInsets: noop, setDoors: noop, voteWalk: done, openDoor: done, enterDoor: done, layout: done, setLabel: noop, setAnswers: noop, lock: noop, walkToPads: done, reveal: noop, pop: noop, climb: done, mood: noop };
  if (!T) return fallback;

  let renderer;
  try { renderer = new T.WebGLRenderer({ antialias: true }); } catch { return fallback; }

  const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  const canvas = renderer.domElement;
  canvas.className = 'stage-canvas';
  const labels = document.createElement('div');
  labels.className = 'stage-labels';

  const INK = '#1b1630', PAPER = '#fffaf0', CARD = '#c99d63', CARD_D = '#a87b45';
  const GOOD = '#35c986', BAD = '#f0524f', WALL = '#2b5f92', RED = '#e8433f', SUN = '#ffc83d';
  const TEAM = ['#ff6b57', '#ffc83d', '#3ee0a1', '#5cb8ff'];
  const POW = '"Bangers", "Impact", "Arial Black", sans-serif';

  /* ---------- Zeichenwerkzeug ---------- */
  function mk(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); g.lineJoin = g.lineCap = 'round'; return [c, g]; }
  function rnd(seed) {
    let a = seed >>> 0;
    return () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  }
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  function shade(hex, k) {
    const n = parseInt(hex.slice(1), 16);
    let r = n >> 16, g = n >> 8 & 255, b = n & 255;
    if (k <= 1) { r *= k; g *= k; b *= k; } else { const m = k - 1; r += (255 - r) * m; g += (255 - g) * m; b += (255 - b) * m; }
    return `rgb(${r | 0},${g | 0},${b | 0})`;
  }
  /* Weiche, geschlossene Form durch Punkte. Wirkt wie mit der Hand gezogen. */
  function blob(g, pts) {
    const n = pts.length, mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    g.beginPath();
    const s = mid(pts[n - 1], pts[0]);
    g.moveTo(s[0], s[1]);
    for (let i = 0; i < n; i++) { const m = mid(pts[i], pts[(i + 1) % n]); g.quadraticCurveTo(pts[i][0], pts[i][1], m[0], m[1]); }
    g.closePath();
  }
  function oval(cx, cy, rx, ry, n, r, j) {
    const pts = [];
    for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; pts.push([cx + Math.cos(a) * rx * 1.08 + (r() - .5) * j, cy + Math.sin(a) * ry * 1.08 + (r() - .5) * j]); }
    return pts;
  }
  /* Wackeliges Rechteck */
  function box(g, x, y, w, h, r, j = 5) {
    const q = () => (r() - .5) * j;
    g.beginPath();
    g.moveTo(x + q(), y + q()); g.lineTo(x + w / 2 + q(), y + q()); g.lineTo(x + w + q(), y + q());
    g.lineTo(x + w + q(), y + h / 2 + q()); g.lineTo(x + w + q(), y + h + q());
    g.lineTo(x + w / 2 + q(), y + h + q()); g.lineTo(x + q(), y + h + q()); g.lineTo(x + q(), y + h / 2 + q());
    g.closePath();
  }
  /* Tuschestrich mit etwas Pinseldruck: unten rechts dicker */
  function ink(g, w) {
    g.save();
    g.strokeStyle = INK; g.lineWidth = w;
    g.shadowColor = INK; g.shadowOffsetX = w * .2; g.shadowOffsetY = w * .26;
    g.stroke();
    g.restore();
  }
  function halftone(g, x0, y0, x1, y1, step, color, f) {
    g.fillStyle = color;
    let row = 0;
    for (let y = y0; y <= y1; y += step * .866, row++) {
      for (let x = x0 + (row % 2 ? step / 2 : 0); x <= x1; x += step) {
        const rad = clamp(f(x, y), 0, 1) * step * .56;
        if (rad > .35) { g.beginPath(); g.arc(x, y, rad, 0, 7); g.fill(); }
      }
    }
  }
  const grainC = (() => {
    const [c, g] = mk(128, 128), d = g.createImageData(128, 128), r = rnd(7);
    for (let i = 0; i < 128 * 128; i++) { const v = r() < .5 ? 0 : 255; d.data[i * 4] = d.data[i * 4 + 1] = d.data[i * 4 + 2] = v; d.data[i * 4 + 3] = r() * 24; }
    g.putImageData(d, 0, 0);
    return c;
  })();
  function grain(g, w, h) { g.save(); g.globalCompositeOperation = 'source-atop'; g.fillStyle = g.createPattern(grainC, 'repeat'); g.fillRect(0, 0, w, h); g.restore(); }
  function silhouette(src, color = '#fff') {
    const [c, g] = mk(src.width, src.height);
    g.drawImage(src, 0, 0); g.globalCompositeOperation = 'source-in'; g.fillStyle = color; g.fillRect(0, 0, c.width, c.height);
    return c;
  }
  /* Weißer Papierrand um eine Zeichnung, wie mit der Schere ausgeschnitten */
  function sticker(src, r) {
    const [c, g] = mk(src.width, src.height);
    const ring = (s, rad) => { for (let i = 0; i < 28; i++) { const a = i / 28 * Math.PI * 2; g.drawImage(s, Math.cos(a) * rad, Math.sin(a) * rad); } };
    ring(silhouette(src, '#a89c86'), r + 2);
    ring(silhouette(src, PAPER), r);
    g.drawImage(src, 0, 0);
    grain(g, c.width, c.height);
    return c;
  }
  function wrap(g, text, maxW) {
    const lines = [];
    let line = '';
    String(text).split(/\s+/).forEach(word => {
      const probe = line ? line + ' ' + word : word;
      if (line && g.measureText(probe).width > maxW) { lines.push(line); line = word; } else line = probe;
    });
    if (line) lines.push(line);
    return lines;
  }
  function fitText(g, text, cx, cy, maxW, maxH, maxSize, color, stroke) {
    g.textAlign = 'center'; g.textBaseline = 'middle';
    for (let size = maxSize; size >= 16; size -= 3) {
      g.font = `${size}px ${POW}`;
      const lines = wrap(g, text, maxW), lh = size * 1.04;
      if (size > 16 && (lines.length * lh > maxH || lines.some(l => g.measureText(l).width > maxW))) continue;
      lines.forEach((l, i) => {
        const y = cy + (i - (lines.length - 1) / 2) * lh + size * .04;
        if (stroke) { g.lineWidth = size * .22; g.strokeStyle = stroke; g.strokeText(l, cx, y); }
        g.fillStyle = color; g.fillText(l, cx, y);
      });
      return;
    }
  }

  /* ---------- Papier im Raum ---------- */
  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  function tex(c) { const t = new T.CanvasTexture(c); t.anisotropy = Math.min(8, maxAniso); return t; }
  const cutMat = (map, color) => new T.MeshBasicMaterial({ map, color: color || '#ffffff', transparent: true, depthWrite: false, side: T.DoubleSide });
  const flatMat = (c, color) => new T.MeshBasicMaterial(c ? { map: tex(c) } : { color });
  /* Stehender Ausschnitt mit Pappkante. anchor: unten (0), Mitte (.5) oder oben (1). */
  function standee(c, w, h, { layers = 2, anchor = 0 } = {}) {
    const grp = new T.Group();
    const geo = new T.PlaneGeometry(w, h);
    geo.translate(0, h * (.5 - anchor), 0);
    if (layers) {
      const sil = tex(silhouette(c));
      for (let i = layers; i >= 1; i--) {
        const m = new T.Mesh(geo, cutMat(sil, i === layers ? CARD_D : CARD));
        m.position.set(.02 * i, -.02 * i, -.025 * i);
        grp.add(m);
      }
      grp.userData.sil = sil;
    }
    const front = new T.Mesh(geo, cutMat(tex(c)));
    grp.add(front);
    grp.userData.front = front;
    return grp;
  }

  const scene = new T.Scene();
  scene.background = new T.Color(WALL);
  const camera = new T.PerspectiveCamera(34, 16 / 9, 0.1, 300);
  const probe = new T.PerspectiveCamera(34, 16 / 9, 0.1, 300);
  let W = 800, H = 450, mode = 'question';

  /* ---------- Kulissen ---------- */
  const swayers = [];   // Dinge, die leicht pendeln

  // Rückwand: Strahlen und Rasterpunkte
  (() => {
    const [c, g] = mk(2048, 1024), r = rnd(5);
    g.fillStyle = WALL; g.fillRect(0, 0, 2048, 1024);
    g.fillStyle = '#34709f';
    for (let i = 0; i < 24; i += 2) {
      const a0 = Math.PI + i / 24 * Math.PI, a1 = Math.PI + (i + 1) / 24 * Math.PI;
      g.beginPath(); g.moveTo(1024, 900); g.lineTo(1024 + Math.cos(a0) * 2400, 900 + Math.sin(a0) * 2400); g.lineTo(1024 + Math.cos(a1) * 2400, 900 + Math.sin(a1) * 2400); g.fill();
    }
    for (let i = 0; i < 26; i++) {   // ausgeschnittene Sterne an der Wand
      const x = r() * 2048, y = 60 + r() * 520, s = 9 + r() * 12;
      g.save(); g.translate(x, y); g.rotate(r() * 3);
      g.beginPath();
      for (let k = 0; k < 10; k++) { const rad = k % 2 ? s * .45 : s, a = k / 10 * Math.PI * 2; g.lineTo(Math.cos(a) * rad, Math.sin(a) * rad); }
      g.closePath(); g.fillStyle = '#ffe9a8'; g.fill(); g.restore();
    }
    grain(g, 2048, 1024);
    const m = new T.Mesh(new T.PlaneGeometry(150, 75), flatMat(c));
    m.position.set(0, 23, -17);
    scene.add(m);
    const [d, dg] = mk(64, 64);
    dg.fillStyle = '#4687b8';
    [[16, 16], [48, 48]].forEach(([x, y]) => { dg.beginPath(); dg.arc(x, y, 9, 0, 7); dg.fill(); });
    const dt = tex(d);
    dt.wrapS = dt.wrapT = T.RepeatWrapping; dt.repeat.set(190, 95);
    const dots = new T.Mesh(new T.PlaneGeometry(150, 75), new T.MeshBasicMaterial({ map: dt, transparent: true, depthWrite: false, opacity: .8 }));
    dots.position.set(0, 23, -16.9);
    dots.renderOrder = -2;
    scene.add(dots);
  })();

  // Boden: gemalte Bühnenbretter
  (() => {
    const [c, g] = mk(512, 512), r = rnd(9);
    g.fillStyle = '#e8b56d'; g.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 4; i++) {
      g.fillStyle = i % 2 ? '#e2ab60' : '#efbf7a';
      g.fillRect(i * 128, 0, 128, 512);
      halftone(g, i * 128 + 86, 0, i * 128 + 128, 512, 11, '#d3994f', x => (x - i * 128 - 80) / 60);
      for (let k = 0; k < 3; k++) {   // Maserung
        const x = i * 128 + 20 + r() * 80, y = r() * 400;
        g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + 6, y + 40, x - 2, y + 70 + r() * 40);
        g.strokeStyle = '#c98f47'; g.lineWidth = 3; g.stroke();
      }
      g.beginPath(); g.moveTo(i * 128 + 2, 0); g.lineTo(i * 128 + 2, 512); g.strokeStyle = INK; g.lineWidth = 5; g.stroke();
      const y = 60 + r() * 380;   // Stoß zwischen zwei Brettern
      g.beginPath(); g.moveTo(i * 128 + 2, y); g.lineTo(i * 128 + 130, y + (r() - .5) * 4); g.lineWidth = 4; g.stroke();
      g.fillStyle = INK; [18, 110].forEach(dx => { g.beginPath(); g.arc(i * 128 + dx, y + 14, 3.5, 0, 7); g.fill(); });
    }
    grain(g, 512, 512);
    const t = tex(c);
    t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(20, 12);
    const m = new T.Mesh(new T.PlaneGeometry(200, 120), new T.MeshBasicMaterial({ map: t }));
    m.rotation.x = -Math.PI / 2; m.position.set(0, 0, 43);
    scene.add(m);
  })();

  // Leuchtschild an der Rückwand
  const marqueeC = mk(1100, 340);
  function drawMarquee() {
    const [c, g] = marqueeC, r = rnd(21);
    g.clearRect(0, 0, 1100, 340);
    box(g, 30, 30, 1040, 280, r, 8); g.fillStyle = SUN; g.fill(); ink(g, 11);
    box(g, 78, 76, 944, 188, r, 6); g.fillStyle = RED; g.fill(); ink(g, 8);
    g.save(); box(g, 78, 76, 944, 188, r, 0); g.clip();
    halftone(g, 78, 76, 1022, 264, 16, '#c62f33', (x, y) => (y - 150) / 130); g.restore();
    g.save(); g.translate(550, 172); g.rotate(-.025);
    fitText(g, 'KOPFNUSS', 0, 0, 860, 170, 168, PAPER, INK); g.restore();
    for (let i = 0; i < 16; i++) {
      [53, 287].forEach(y => { g.beginPath(); g.arc(70 + i * 64, y, 13, 0, 7); g.fillStyle = i % 2 ? PAPER : '#fff3b0'; g.fill(); g.strokeStyle = INK; g.lineWidth = 5; g.stroke(); });
    }
  }
  drawMarquee();
  const marqueeArt = mk(1100, 340);
  const marquee = standee(marqueeC[0], 11, 3.4, { layers: 0, anchor: .5 });
  marquee.position.set(0, 8.4, -13);
  scene.add(marquee);
  function refreshMarquee() {
    drawMarquee();
    const s = sticker(marqueeC[0], 10);
    marqueeArt[1].clearRect(0, 0, 1100, 340); marqueeArt[1].drawImage(s, 0, 0);
    const front = marquee.userData.front;
    if (!front.material.map || front.material.map.image !== marqueeArt[0]) front.material.map = tex(marqueeArt[0]);
    front.material.map.needsUpdate = true;
  }
  refreshMarquee();
  swayers.push({ o: marquee, rz: .012, sp: .7, ph: 1 });

  // Publikum: zwei ausgeschnittene Reihen
  function drawCrowd(seed, tones) {
    const [c, g] = mk(2048, 300), r = rnd(seed);
    for (let x = 50; x < 2030; x += 84 + r() * 34) {
      const hy = 118 + r() * 60, hr = 34 + r() * 10;
      g.fillStyle = tones[Math.floor(r() * tones.length)];
      blob(g, [[x - hr * 1.7, 310], [x - hr * 1.6, hy + hr * 1.5], [x - hr * .6, hy + hr * .9], [x + hr * .6, hy + hr * .9], [x + hr * 1.6, hy + hr * 1.5], [x + hr * 1.7, 310]]);
      g.fill(); ink(g, 6);
      if (r() < .3) {   // jubelnder Arm
        const s = r() < .5 ? -1 : 1;
        g.beginPath(); g.moveTo(x + s * hr * 1.3, hy + hr * 1.6); g.lineTo(x + s * hr * 1.9, hy - hr * .7);
        g.strokeStyle = INK; g.lineWidth = 26; g.stroke(); g.strokeStyle = g.fillStyle; g.lineWidth = 15; g.stroke();
      }
      blob(g, oval(x, hy, hr, hr, 9, r, 4)); g.fill(); ink(g, 6);
      [-1, 1].forEach(s => {
        g.beginPath(); g.arc(x + s * hr * .36, hy + 2, hr * .2, 0, 7); g.fillStyle = PAPER; g.fill();
        g.beginPath(); g.arc(x + s * hr * .36, hy + 2, hr * .09, 0, 7); g.fillStyle = INK; g.fill();
      });
      g.fillStyle = tones[0];
      if (r() < .25) { g.beginPath(); g.arc(x, hy - hr * .55, hr * .95, Math.PI, 0); g.fillStyle = TEAM[Math.floor(r() * 4)]; g.fill(); ink(g, 5); }
    }
    g.clearRect(0, 292, 2048, 8);
    return sticker(c, 5);
  }
  [[-10.5, 2.9, 31, ['#1c3d61', '#234a73', '#19385a'], 0], [-8.6, 2.3, 32, ['#152f4d', '#1a3857', '#10263f'], 2.3]].forEach(([z, h, seed, tones, dx], i) => {
    const row = standee(drawCrowd(seed, tones), 44, h, { layers: 1 });
    row.position.set(dx, 0, z);
    scene.add(row);
    swayers.push({ o: row, by: .07, sp: 2.2 + i * .5, ph: i * 2, y: 0 });
  });

  // Vorhänge links und rechts. Sie rahmen immer den Bildrand, egal wie breit das Fenster ist.
  const curtains = [];
  const curtainC = (() => {
    const [c, g] = mk(512, 1024), r = rnd(3);
    const shape = () => {
      g.beginPath(); g.moveTo(18, 18); g.lineTo(494, 18);
      g.bezierCurveTo(470, 300, 400, 560, 250, 640);
      g.bezierCurveTo(330, 760, 390, 880, 404, 1000);
      for (let x = 404; x > 18; x -= 64) g.quadraticCurveTo(x - 32, 1028 - (x % 128 ? 0 : 16), x - 64, 1000);
      g.closePath();
    };
    shape(); g.fillStyle = '#d8353b'; g.fill();
    g.save(); shape(); g.clip();
    for (let i = 0; i < 7; i++) {
      const x0 = 30 + i * 70, xm = 40 + i * 32, x1 = 24 + i * 60;
      if (i % 2) {
        g.beginPath(); g.moveTo(x0, 10); g.quadraticCurveTo(xm + 20, 400, xm, 640); g.quadraticCurveTo(x1 + 10, 820, x1, 1030);
        g.lineTo(x1 + 40, 1030); g.quadraticCurveTo(x1 + 44, 820, xm + 20, 640); g.quadraticCurveTo(xm + 52, 400, x0 + 44, 10);
        g.fillStyle = '#b8262f'; g.fill();
      }
      g.beginPath(); g.moveTo(x0, 10); g.quadraticCurveTo(xm + 20, 400, xm, 640); g.quadraticCurveTo(x1 + 10, 820, x1, 1030);
      g.strokeStyle = INK; g.lineWidth = 4 + r() * 3; g.stroke();
    }
    halftone(g, 0, 0, 512, 1024, 17, '#a81f29', (x, y) => (x - 260) / 300 + (y - 700) / 900);
    g.restore();
    shape(); ink(g, 10);
    blob(g, [[20, 612], [150, 600], [282, 618], [286, 664], [150, 676], [20, 662]]); g.fillStyle = SUN; g.fill(); ink(g, 8);
    blob(g, oval(120, 716, 22, 44, 8, r, 4)); g.fill(); ink(g, 7);
    return sticker(c, 8);
  })();
  [-1, 1].forEach(s => {
    const cu = standee(curtainC, 9, 18, { layers: 2 });
    cu.position.set(s * 14.6, -0.4, -6);
    cu.scale.x = s < 0 ? 1 : -1;
    scene.add(cu);
    curtains.push({ o: cu, s });
    swayers.push({ o: cu, rz: .008, sp: .9, ph: s });
  });

  // Wimpelkette
  (() => {
    const [c, g] = mk(2048, 240);
    const sag = x => 30 + Math.sin(x / 2048 * Math.PI * 4 - Math.PI / 2) * 22 + 26;
    g.beginPath(); for (let x = 10; x <= 2038; x += 12) g.lineTo(x, sag(x));
    g.strokeStyle = INK; g.lineWidth = 6; g.stroke();
    for (let i = 0; i < 23; i++) {
      const x = 44 + i * 88, y = sag(x + 30);
      g.beginPath(); g.moveTo(x, sag(x) - 2); g.lineTo(x + 60, sag(x + 60) - 2); g.lineTo(x + 32 + (i % 3 - 1) * 5, y + 96); g.closePath();
      g.fillStyle = [...TEAM, PAPER][i % 5]; g.fill(); ink(g, 6);
    }
    const o = standee(sticker(c, 5), 34, 4, { layers: 0, anchor: 1 });
    o.position.set(0, 12.2, -9.5);
    scene.add(o);
    swayers.push({ o, rz: .01, sp: 1.1, ph: 3 });
  })();

  // Scheinwerferkegel aus Transparentpapier
  (() => {
    const [c, g] = mk(256, 512);
    const grad = g.createLinearGradient(0, 0, 0, 512);
    grad.addColorStop(0, 'rgba(255,244,190,.42)'); grad.addColorStop(1, 'rgba(255,244,190,.05)');
    g.beginPath(); g.moveTo(118, 0); g.lineTo(138, 0); g.lineTo(256, 512); g.lineTo(0, 512); g.closePath();
    g.fillStyle = grad; g.fill();
    g.save(); g.clip(); halftone(g, 0, 0, 256, 512, 15, 'rgba(255,255,255,.16)', (x, y) => 1 - y / 520); g.restore();
    const t = tex(c);
    [[-7.5, .42, 0], [7.5, -.42, 1.7], [-2.6, .12, 3], [2.6, -.12, 4.4]].forEach(([x, rz, ph]) => {
      const geo = new T.PlaneGeometry(8, 19); geo.translate(0, -9.5, 0);
      const m = new T.Mesh(geo, cutMat(t));
      m.position.set(x, 17, -12); m.rotation.z = rz;
      m.renderOrder = -1;
      scene.add(m);
      swayers.push({ o: m, rz: .07, sp: .45, ph, base: rz });
    });
  })();

  /* ---------- Antwortfelder mit Schildern ---------- */
  const PAD_X = [-5.55, -1.85, 1.85, 5.55], PAD_Z = -1.3, PAD_TOP = 0.2, SIGN_Z = -3.1;
  const padGroup = new T.Group();
  scene.add(padGroup);
  const sideC = (() => {
    const [c, g] = mk(256, 32);
    g.fillStyle = CARD; g.fillRect(0, 0, 256, 32);
    g.strokeStyle = CARD_D; g.lineWidth = 3;
    for (let x = 0; x < 256; x += 12) { g.beginPath(); g.moveTo(x, 9); g.quadraticCurveTo(x + 3, 16, x + 6, 23); g.stroke(); }
    g.fillStyle = INK; g.fillRect(0, 0, 256, 5); g.fillRect(0, 27, 256, 5);
    return c;
  })();
  const sideM = flatMat(sideC);

  function drawPad(p) {
    const g = p.topG, r = rnd(40 + p.i);
    const fill = p.state === 'right' ? GOOD : p.state === 'wrong' ? '#eadfce' : PAPER;
    g.fillStyle = INK; g.fillRect(0, 0, 384, 300);
    box(g, 12, 12, 360, 276, r, 5); g.fillStyle = fill; g.fill();
    g.save(); g.clip();
    halftone(g, 0, 0, 384, 300, 15, p.state === 'right' ? '#27a96d' : p.state === 'wrong' ? '#d6c7b0' : '#f1e3c4', (x, y) => (x + y - 330) / 300);
    g.restore();
    if (p.state === 'right') {
      g.beginPath(); g.moveTo(120, 150); g.lineTo(172, 208); g.lineTo(270, 88); g.strokeStyle = PAPER; g.lineWidth = 46; g.stroke(); g.strokeStyle = INK; g.lineWidth = 12; g.stroke();
    } else if (p.state === 'wrong') {
      g.beginPath(); g.moveTo(130, 92); g.lineTo(254, 208); g.moveTo(254, 92); g.lineTo(130, 208); g.strokeStyle = BAD; g.lineWidth = 30; g.stroke();
    } else {
      g.setLineDash([22, 16]); box(g, 44, 42, 296, 216, r, 4); g.strokeStyle = '#c9b790'; g.lineWidth = 7; g.stroke(); g.setLineDash([]);
    }
    grain(g, 384, 300);
    p.topT.needsUpdate = true;
  }
  function drawSign(p) {
    const g = p.signG, r = rnd(60 + p.i);
    g.clearRect(0, 0, 640, 330);
    const fill = p.state === 'right' ? GOOD : p.state === 'wrong' ? '#e4d9c8' : PAPER;
    g.save(); g.translate(320, 165); g.rotate([-.02, .015, -.012, .022][p.i]); g.translate(-320, -165);
    box(g, 26, 26, 588, 278, r, 9); g.save(); g.shadowColor = INK; g.shadowOffsetX = 9; g.shadowOffsetY = 11; g.fillStyle = fill; g.fill(); g.restore();
    g.fillStyle = fill; g.fill();
    g.save(); g.clip();
    halftone(g, 26, 26, 614, 304, 16, p.state === 'right' ? '#27a96d' : p.state === 'wrong' ? '#cfc2ab' : '#f6e7bf', (x, y) => (x - 330) / 420 + (y - 200) / 220);
    g.restore();
    box(g, 26, 26, 588, 278, rnd(60 + p.i), 9); ink(g, 9);
    if (p.text === null) fitText(g, '?', 320, 168, 500, 230, 210, '#d9c89f');
    else fitText(g, p.text, 320, 166, 520, 226, 120, p.state === 'wrong' ? '#6d6478' : INK);
    if (p.state === 'wrong') { g.beginPath(); g.moveTo(70, 70); g.lineTo(570, 262); g.strokeStyle = BAD; g.lineWidth = 15; g.stroke(); }
    g.restore();
    grain(g, 640, 330);
    p.signT.needsUpdate = true;
  }
  const postC = (() => {
    const [c, g] = mk(48, 256), r = rnd(2);
    box(g, 12, 4, 24, 248, r, 3); g.fillStyle = CARD; g.fill(); ink(g, 5);
    return c;
  })();
  const pads = PAD_X.map((x, i) => {
    const [topC, topG] = mk(384, 300), [signC, signG] = mk(640, 330);
    const p = { i, x, topG, topT: tex(topC), signG, signT: tex(signC), state: '', text: null, tip: 0, tipGoal: 0, bounce: -9 };
    const tile = new T.Mesh(new T.BoxGeometry(3.25, PAD_TOP, 2.5), [sideM, sideM, new T.MeshBasicMaterial({ map: p.topT }), sideM, sideM, sideM]);
    tile.position.set(x, PAD_TOP / 2, PAD_Z);
    tile.rotation.y = [.02, -.015, .01, -.02][i];
    const sign = new T.Group();
    sign.position.set(x, 0, SIGN_Z);
    const post = new T.Mesh(new T.PlaneGeometry(.3, 2.2).translate(0, 1.1, -.03), cutMat(tex(postC)));
    const board = new T.Mesh(new T.PlaneGeometry(3.45, 1.78).translate(0, 2.7, 0), cutMat(p.signT));
    sign.add(post, board);
    padGroup.add(tile, sign);
    p.tile = tile; p.sign = sign;
    drawPad(p); drawSign(p);
    return p;
  });

  /* ---------- Türen für die Kategorie-Abstimmung ---------- */
  // Vier Papptüren mit Schild. Die Figuren stellen sich vor ihre Wahl, die Gewinner-Tür
  // schwingt auf und alle laufen hindurch.
  const DOOR_Z = -3.1;   // Farben: DOOR_COLORS aus common.js
  const doorGroup = new T.Group();
  doorGroup.visible = false;
  scene.add(doorGroup);
  const darkC = (() => {
    const [c, g] = mk(256, 384), r = rnd(31);
    g.fillStyle = '#15102b'; g.fillRect(0, 0, 256, 384);
    halftone(g, 0, 0, 256, 384, 18, '#2b2350', (x, y) => 1 - y / 300);
    g.fillStyle = SUN;
    for (let i = 0; i < 9; i++) { g.beginPath(); g.arc(20 + r() * 216, 20 + r() * 300, 2 + r() * 4, 0, 7); g.fill(); }
    return c;
  })();
  function drawDoorFrame(d) {
    const g = d.frameG, r = rnd(80 + d.i);
    g.clearRect(0, 0, 600, 920);
    // Rahmen aus Pappe
    box(g, 62, 262, 476, 652, r, 7); g.fillStyle = d.state === 'lost' ? '#b9a98e' : CARD; g.fill();
    g.save(); g.clip(); halftone(g, 62, 262, 538, 914, 15, CARD_D, (x, y) => (x - 200) / 500 + (y - 500) / 900); g.restore();
    box(g, 62, 262, 476, 652, rnd(80 + d.i), 7); ink(g, 9);
    // Durchgang ausschneiden
    g.save(); g.globalCompositeOperation = 'destination-out'; g.fillRect(100, 302, 400, 618); g.restore();
    g.strokeStyle = INK; g.lineWidth = 9; g.strokeRect(100, 302, 400, 630);
    // Schild mit der Kategorie
    const fill = d.state === 'won' ? GOOD : d.state === 'lost' ? '#e4d9c8' : PAPER;
    g.save(); g.translate(300, 130); g.rotate([-.025, .02, -.015, .028][d.i]); g.translate(-300, -130);
    box(g, 22, 22, 556, 216, r, 9); g.save(); g.shadowColor = INK; g.shadowOffsetX = 8; g.shadowOffsetY = 10; g.fillStyle = fill; g.fill(); g.restore();
    g.save(); g.clip(); halftone(g, 22, 22, 578, 238, 16, d.state === 'won' ? '#27a96d' : d.state === 'lost' ? '#cfc2ab' : '#f6e7bf', (x, y) => (x - 300) / 420 + (y - 150) / 200); g.restore();
    box(g, 22, 22, 556, 216, rnd(80 + d.i), 9); ink(g, 9);
    fitText(g, d.text || '?', 300, 132, 500, 176, 96, d.state === 'lost' ? '#6d6478' : INK);
    g.restore();
    grain(g, 600, 920);
    d.frameT.needsUpdate = true;
  }
  function drawDoorLeaf(d) { paintLeaf(d, d.leafG, true); d.leafT.needsUpdate = true; paintLeaf(d, d.backG, false); d.backT.needsUpdate = true; }
  function paintLeaf(d, g, front) {
    const r = rnd(90 + d.i), col = d.state === 'lost' ? '#9a93a8' : DOOR_COLORS[d.i];
    g.clearRect(0, 0, 400, 620);
    box(g, 8, 8, 384, 604, r, 5); g.fillStyle = col; g.fill();
    g.save(); g.clip(); halftone(g, 0, 0, 400, 620, 15, shade(col, .78), (x, y) => (x - 120) / 420 + (y - 250) / 700); g.restore();
    box(g, 8, 8, 384, 604, rnd(90 + d.i), 5); ink(g, 9);
    // zwei Füllungen und ein Knauf
    [[48, 48, 304, 200], [48, 372, 304, 200]].forEach(([x, y, w, h]) => { box(g, x, y, w, h, r, 5); g.fillStyle = shade(col, 1.18); g.fill(); ink(g, 6); });
    g.beginPath(); g.arc(d.i >= 2 ? 64 : 336, 316, 20, 0, 7); g.fillStyle = SUN; g.fill(); ink(g, 6);
    if (front) {   // Türnummer nur außen
      g.beginPath(); g.arc(200, 148, 66, 0, 7); g.fillStyle = PAPER; g.fill(); ink(g, 7);
      fitText(g, String(d.i + 1), 200, 150, 110, 110, 104, INK);
    }
    grain(g, 400, 620);
  }
  const doors = PAD_X.map((x, i) => {
    const [frameC, frameG] = mk(600, 920), [leafC, leafG] = mk(400, 620), [backC, backG] = mk(400, 620);
    const d = { i, x, frameG, frameT: tex(frameC), leafG, leafT: tex(leafC), backG, backT: tex(backC), text: '', state: '', open: 0, openGoal: 0, bounce: -9 };
    const grp = new T.Group();
    grp.position.set(x, 0, DOOR_Z);
    const back = new T.Mesh(new T.PlaneGeometry(2.16, 3.15).translate(0, 1.575, 0), cutMat(tex(darkC)));
    back.position.z = -0.3;
    const frame = new T.Mesh(new T.PlaneGeometry(3, 4.6).translate(0, 2.3, 0), cutMat(d.frameT));
    const hinge = new T.Group();
    const side = i >= 2 ? 1 : -1;
    hinge.position.set(side, 0, 0.03);
    const leafGeo = new T.PlaneGeometry(2, 3.1).translate(-side, 1.55, 0);
    d.side = side;
    const outside = cutMat(d.leafT), inside = cutMat(d.backT);
    outside.side = T.FrontSide; inside.side = T.BackSide;
    hinge.add(new T.Mesh(leafGeo, outside), new T.Mesh(leafGeo, inside));
    grp.add(back, frame, hinge);
    doorGroup.add(grp);
    d.grp = grp; d.hinge = hinge; d.frame = frame;
    drawDoorFrame(d); drawDoorLeaf(d);
    return d;
  });

  /* ---------- Treppe fürs Finale ---------- */
  // Die Treppe passt sich an die Gipfelhöhe aus SETTINGS.summit an
  let STEPS = 0, stepW = 1.4, rise = 0.32, lastSummit = 10;
  const stepX = s => -7 + s * stepW;
  const stepTop = s => 0.25 + s * rise;
  const stairs = new T.Group();
  stairs.visible = false;
  scene.add(stairs);
  const stepSide = flatMat(null, CARD_D);
  let flag = null;

  function drawStepFront(s, w, h, top) {
    const pw = 256, ph = Math.max(48, Math.round(pw * h / w));
    const [c, g] = mk(pw, ph), r = rnd(80 + s);
    g.fillStyle = top ? SUN : s % 2 ? '#d7ad73' : CARD; g.fillRect(0, 0, pw, ph);
    halftone(g, 0, 0, pw, ph, 14, top ? '#f0a92a' : '#b98c53', (x, y) => (x - 110) / 260 + y / (ph * 2.2) - .1);
    g.strokeStyle = top ? '#d98f1c' : CARD_D; g.lineWidth = 3;   // Wellpappe an der Kante
    for (let x = 6; x < pw; x += 13) { g.beginPath(); g.moveTo(x, 8); g.quadraticCurveTo(x + 4, 15, x + 7, 22); g.stroke(); }
    g.strokeStyle = INK; g.lineWidth = 12; g.strokeRect(0, 0, pw, ph);
    g.beginPath(); g.moveTo(0, 30 + r() * 3); g.lineTo(pw, 30 + r() * 3); g.lineWidth = 4; g.stroke();
    if (ph > 120) {
      g.save(); g.translate(pw / 2, 86); g.rotate((r() - .5) * .16);
      blob(g, oval(0, 0, 38, 36, 9, r, 5)); g.fillStyle = PAPER; g.fill(); ink(g, 6);
      fitText(g, top ? '★' : String(s), 0, 2, 60, 60, 50, INK);
      g.restore();
    }
    grain(g, pw, ph);
    return c;
  }
  const stepTopC = top => {
    const [c, g] = mk(128, 128);
    g.fillStyle = top ? '#ffe08a' : '#f1dcb0'; g.fillRect(0, 0, 128, 128);
    halftone(g, 0, 0, 128, 128, 13, top ? '#f6c85a' : '#e2c890', (x, y) => (x + y - 130) / 160);
    g.strokeStyle = INK; g.lineWidth = 10; g.strokeRect(0, 0, 128, 128);
    return c;
  };

  // Berg, Wolken und Fahne
  const mountain = (() => {
    const [c, g] = mk(1024, 700), r = rnd(13);
    const peak = [[20, 690], [150, 520], [270, 560], [420, 330], [520, 400], [690, 60], [800, 250], [880, 220], [1004, 690]];
    const shape = () => { g.beginPath(); peak.forEach(([x, y]) => g.lineTo(x + (r() - .5) * 4, y + (r() - .5) * 4)); g.closePath(); };
    shape(); g.fillStyle = '#3f9c8a'; g.fill();
    g.save(); shape(); g.clip();
    halftone(g, 0, 0, 1024, 700, 20, '#2f7f70', (x, y) => (x - 560) / 520 + (y - 200) / 900);
    g.beginPath(); g.moveTo(560, 0); g.lineTo(600, 250); g.lineTo(650, 200); g.lineTo(700, 280); g.lineTo(745, 210); g.lineTo(790, 260); g.lineTo(840, 0); g.closePath();
    g.fillStyle = PAPER; g.fill(); ink(g, 7);
    g.beginPath(); g.moveTo(360, 0); g.lineTo(385, 395); g.lineTo(430, 370); g.lineTo(470, 420); g.lineTo(500, 0); g.closePath(); g.fillStyle = PAPER; g.fill(); ink(g, 7);
    g.restore();
    shape(); ink(g, 11);
    const o = standee(sticker(c, 9), 15, 10.25, { layers: 2 });
    o.position.set(2.6, 0, -4.2);
    return o;
  })();
  stairs.add(mountain);
  const clouds = [[-6.5, 8.6, -6.2, 5.2], [-.5, 10.4, -7, 4.2], [9.5, 9.2, -6.6, 4.8]].map(([x, y, z, w], i) => {
    const [c, g] = mk(512, 300), r = rnd(50 + i);
    const puff = [[60, 200], [70, 130], [150, 110], [190, 50], [290, 40], [340, 100], [430, 110], [460, 190], [400, 245], [120, 248]].map(([px, py]) => [px + (r() - .5) * 14, py + (r() - .5) * 10]);
    blob(g, puff); g.fillStyle = PAPER; g.fill();
    g.save(); g.clip(); halftone(g, 0, 120, 512, 300, 15, '#bcdcf2', (px, py) => (py - 150) / 120); g.restore();
    blob(g, puff); ink(g, 9);
    const o = standee(sticker(c, 6), w, w * 300 / 512, { layers: 1, anchor: .5 });
    o.position.set(x, y, z);
    stairs.add(o);
    return { o, x, ph: i * 2.1 };
  });
  const flagC = (() => {
    const [c, g] = mk(256, 200), r = rnd(4);
    const cloth = [[30, 30], [120, 22], [226, 40], [180, 96], [228, 160], [120, 150], [30, 170]].map(([x, y]) => [x + (r() - .5) * 5, y + (r() - .5) * 5]);
    blob(g, cloth); g.fillStyle = RED; g.fill();
    g.save(); g.clip(); halftone(g, 0, 0, 256, 200, 14, '#c62f33', (x, y) => (y - 80) / 110); g.restore();
    blob(g, cloth); ink(g, 9);
    return sticker(c, 6);
  })();

  function buildStairs(summit) {
    if (summit + 1 === STEPS) return;
    lastSummit = summit;
    [...stairs.children].forEach(o => { if (o.userData.step) stairs.remove(o); });
    STEPS = summit + 1;
    stepW = 14 / summit;
    rise = 3.2 / summit;
    const topM = flatMat(stepTopC(false)), goldM = flatMat(stepTopC(true));
    for (let s = 0; s < STEPS; s++) {
      const h = stepTop(s), w = stepW * 0.97, last = s === STEPS - 1;
      const front = flatMat(drawStepFront(s, w, h, last));
      const b = new T.Mesh(new T.BoxGeometry(w, h, 2.5), [stepSide, stepSide, last ? goldM : topM, stepSide, front, stepSide]);
      b.position.set(stepX(s), h / 2, -0.2);
      b.userData.step = true;
      stairs.add(b);
    }
    const top = STEPS - 1;
    if (!flag) {
      flag = new T.Group();
      const pole = new T.Mesh(new T.PlaneGeometry(.3, 2.6).translate(0, 1.3, 0), cutMat(tex(postC)));
      const cloth = standee(flagC, 1.5, 1.17, { layers: 1, anchor: .5 });
      cloth.position.set(.72, 2.1, .02);
      flag.add(pole, cloth);
      flag.userData.cloth = cloth;
      stairs.add(flag);
    }
    flag.position.set(stepX(top) + stepW * .28, stepTop(top), -1.25);
    mountain.position.x = stepX(top) - 5.2;
  }

  /* ---------- Siegerpodest ---------- */
  const POD = [{ x: 0, h: 1.9, c: SUN }, { x: -2.5, h: 1.45, c: '#dfe6ee' }, { x: 2.5, h: 1.1, c: '#e8a468' }];
  const podium = new T.Group();
  podium.visible = false;
  scene.add(podium);
  const podFronts = POD.map((p, i) => {
    const [c, g] = mk(320, Math.round(320 * p.h / 2.3));
    const t = tex(c);
    const b = new T.Mesh(new T.BoxGeometry(2.3, p.h, 2.1), [stepSide, stepSide, flatMat(null, shade(p.c, 1.4)), stepSide, new T.MeshBasicMaterial({ map: t }), stepSide]);
    b.position.set(p.x, p.h / 2, 0);
    podium.add(b);
    return { c, g, t, p, i };
  });
  function drawPodium() {
    podFronts.forEach(({ c, g, t, p, i }) => {
      const r = rnd(90 + i);
      g.fillStyle = p.c; g.fillRect(0, 0, c.width, c.height);
      halftone(g, 0, 0, c.width, c.height, 15, shade(p.c, .8), (x, y) => (x - 120) / 300 + y / (c.height * 2));
      g.strokeStyle = INK; g.lineWidth = 14; g.strokeRect(0, 0, c.width, c.height);
      g.save(); g.translate(c.width / 2, c.height * .62); g.rotate((r() - .5) * .12);
      const rad = Math.min(58, c.height * .3);
      blob(g, oval(0, 0, rad, rad, 10, r, 5)); g.fillStyle = PAPER; g.fill(); ink(g, 7);
      fitText(g, String(i + 1), 0, 2, rad * 1.5, rad * 1.7, rad * 1.5, INK);
      g.restore();
      grain(g, c.width, c.height);
      t.needsUpdate = true;
    });
  }
  drawPodium();
  const burst = (() => {
    const [c, g] = mk(800, 800), r = rnd(17);
    const star = (n, r0, r1, seed) => { const q = rnd(seed); g.beginPath(); for (let i = 0; i < n * 2; i++) { const rad = (i % 2 ? r0 : r1) + (q() - .5) * 16, a = i / (n * 2) * Math.PI * 2; g.lineTo(400 + Math.cos(a) * rad, 400 + Math.sin(a) * rad); } g.closePath(); };
    star(18, 250, 372, 1); g.fillStyle = SUN; g.fill();
    g.save(); g.clip(); halftone(g, 0, 0, 800, 800, 20, '#f59f2a', (x, y) => Math.hypot(x - 400, y - 400) / 300 - .55); g.restore();
    star(18, 250, 372, 1); ink(g, 11);
    star(14, 150, 235, 2); g.fillStyle = PAPER; g.fill(); ink(g, 8);
    const o = standee(sticker(c, 8), 8, 8, { layers: 1, anchor: .5 });
    o.position.set(0, 3.5, -2.4);
    podium.add(o);
    return o;
  })();
  const confetti = [];
  (() => {
    const r = rnd(33), geo = new T.PlaneGeometry(.2, .12);
    const mats = [...TEAM, PAPER, RED].map(c => new T.MeshBasicMaterial({ color: c, side: T.DoubleSide }));
    for (let i = 0; i < (calm ? 0 : 110); i++) {
      const m = new T.Mesh(geo, mats[i % mats.length]);
      const c = { m, x: (r() - .5) * 17, z: -2 + r() * 5, y: r() * 11, v: 1.1 + r() * 1.6, s: 2 + r() * 5, ph: r() * 6 };
      podium.add(m);
      confetti.push(c);
    }
  })();

  /* ---------- Spielfiguren ---------- */
  const FW = 420, FH = 500, FEET = 468, FIG_W = 1.9, FIG_H = FIG_W * FH / FW;
  const BODIES = [
    { top: 165, eye: 288, pts: [[210, 165], [285, 195], [322, 290], [318, 390], [275, 448], [210, 458], [145, 448], [102, 390], [98, 290], [135, 195]] },
    { top: 185, eye: 292, pts: [[210, 185], [300, 188], [328, 250], [330, 380], [302, 452], [210, 458], [118, 452], [90, 380], [92, 250], [120, 188]] },
    { top: 180, eye: 285, pts: [[210, 180], [268, 200], [300, 280], [336, 380], [300, 450], [210, 460], [120, 450], [84, 380], [120, 280], [152, 200]] },
    { top: 150, eye: 265, pts: [[210, 150], [275, 170], [305, 250], [310, 380], [280, 450], [210, 458], [140, 450], [110, 380], [115, 250], [145, 170]] }
  ];

  /* Eine Figur in einer Stimmung. style 0–3 bestimmt Körperform und Erkennungszeichen. */
  function drawFigure(style, color, mood) {
    const [c, g] = mk(FW, FH);
    const B = BODIES[style], r = rnd(11 + style * 7);
    const dark = shade(color, .7), light = shade(color, 1.45);
    const ey = B.eye, my = ey + 64, EX = 44;
    const stroke = w => { g.strokeStyle = INK; g.lineWidth = w; g.stroke(); };

    // hinter dem Körper: Ohren oder Antenne
    if (style === 2) {
      [-1, 1].forEach(s => {
        const cx = 210 + s * 80, cy = B.top + 24;
        blob(g, oval(cx, cy, 40, 40, 9, r, 4)); g.fillStyle = color; g.fill(); ink(g, 8);
        blob(g, oval(cx, cy + 2, 20, 20, 8, r, 3)); g.fillStyle = '#ff9db0'; g.fill();
      });
    }
    if (style === 1) {
      g.beginPath(); g.moveTo(210, B.top + 8); g.quadraticCurveTo(196, B.top - 44, 216, B.top - 86); stroke(9);
      blob(g, oval(217, B.top - 100, 18, 18, 8, r, 3)); g.fillStyle = RED; g.fill(); ink(g, 6);
      g.fillStyle = '#fff'; g.beginPath(); g.arc(211, B.top - 106, 5, 0, 7); g.fill();
      [[-1, 34], [1, 34], [-1, 50], [1, 50]].forEach(([s, d]) => { g.beginPath(); g.arc(217, B.top - 100, d, s < 0 ? Math.PI * .86 : -Math.PI * .14, s < 0 ? Math.PI * 1.14 : Math.PI * .14); stroke(5); });
    }

    // Füße
    [-1, 1].forEach(s => { blob(g, oval(210 + s * 46, FEET - 12, 36, 14, 8, r, 3)); g.fillStyle = INK; g.fill(); });

    const arm = (sx, sy, hx, hy) => {
      g.beginPath(); g.moveTo(sx, sy); g.quadraticCurveTo((sx + hx) / 2 + (hx > sx ? 16 : -16), (sy + hy) / 2 + 6, hx, hy);
      g.strokeStyle = INK; g.lineWidth = 31; g.stroke(); g.strokeStyle = color; g.lineWidth = 17; g.stroke();
      blob(g, oval(hx, hy, 24, 22, 8, r, 3)); g.fillStyle = color; g.fill(); ink(g, 7);
    };
    const sy = ey + 52;
    const hands = {
      idle: [[80, ey + 112], [340, ey + 112]], blink: [[80, ey + 112], [340, ey + 112]],
      wave: [[80, ey + 112], [356, ey - 62]], cheer: [[60, ey - 84], [360, ey - 84]],
      sad: [[94, ey + 138], [326, ey + 138]], think: [[80, ey + 112], null]
    }[mood];
    arm(116, sy, hands[0][0], hands[0][1]);
    if (hands[1]) arm(304, sy, hands[1][0], hands[1][1]);

    // Körper mit Rasterschatten und Glanzlicht
    const body = B.pts.map(([x, y]) => [x + (r() - .5) * 8, y + (r() - .5) * 8]);
    blob(g, body); g.fillStyle = color; g.fill();
    g.save(); g.clip();
    halftone(g, 80, B.top - 10, 345, 470, 13, dark, (x, y) => (x - 215) / 115 + (y - ey) / 210 - .28);
    g.fillStyle = light; g.globalAlpha = .7;
    g.save(); g.translate(158, B.top + 52); g.rotate(-.6); blob(g, oval(0, 0, 34, 13, 8, r, 3)); g.fill(); g.restore();
    g.beginPath(); g.arc(126, B.top + 92, 8, 0, 7); g.fill();
    g.restore();
    blob(g, body); ink(g, 10);

    // Gesicht
    const eyes = (px, py) => [-1, 1].forEach(s => {
      const cx = 210 + s * EX;
      blob(g, oval(cx, ey, 30, 37, 10, r, 3)); g.fillStyle = '#fff'; g.fill(); ink(g, 6);
      g.fillStyle = INK; g.beginPath(); g.arc(cx + px, ey + py, 16, 0, 7); g.fill();
      g.fillStyle = '#fff'; g.beginPath(); g.arc(cx + px - 5, ey + py - 6, 5.5, 0, 7); g.fill();
    });
    const arcs = up => [-1, 1].forEach(s => {
      const cx = 210 + s * EX;
      g.beginPath(); g.moveTo(cx - 27, ey + (up ? 10 : -4)); g.quadraticCurveTo(cx, ey + (up ? -30 : 22), cx + 27, ey + (up ? 10 : -4)); stroke(9);
    });
    const brow = (s, k, lift) => { const cx = 210 + s * EX; g.beginPath(); g.moveTo(cx - s * 25, ey - 54 - lift - k); g.lineTo(cx + s * 25, ey - 54 - lift + k); stroke(8); };
    [-1, 1].forEach(s => {
      g.save(); g.globalAlpha = .85; g.fillStyle = '#ff8fa3';
      blob(g, oval(210 + s * 84, ey + 42, 19, 12, 8, r, 3)); g.fill(); g.restore();
    });
    const openMouth = (w, d) => {
      g.beginPath(); g.moveTo(210 - w, my - 8); g.quadraticCurveTo(210, my + d * 2 - 8, 210 + w, my - 8); g.closePath();
      g.fillStyle = '#7a1f2b'; g.fill();
      g.save(); g.clip(); g.fillStyle = '#ff8fa3'; g.beginPath(); g.ellipse(214, my + d * .86, w * .55, d * .42, 0, 0, 7); g.fill(); g.restore();
      stroke(7);
    };
    if (mood === 'idle') {
      eyes(0, 3);
      g.beginPath(); g.moveTo(188, my); g.quadraticCurveTo(210, my + 22, 234, my - 2); stroke(7);
    } else if (mood === 'blink') {
      arcs(false);
      g.beginPath(); g.moveTo(188, my); g.quadraticCurveTo(210, my + 22, 234, my - 2); stroke(7);
    } else if (mood === 'wave') {
      eyes(0, 0); brow(-1, 2, 4); brow(1, 2, 4); openMouth(27, 22);
    } else if (mood === 'cheer') {
      arcs(true); openMouth(38, 32);
      [[70, B.top - 6, -1], [350, B.top - 6, 1]].forEach(([x, y, s]) => { for (let i = 0; i < 3; i++) { const a = -Math.PI / 2 + s * (.3 + i * .45); g.beginPath(); g.moveTo(x + Math.cos(a) * 16, y + Math.sin(a) * 16 - 70); g.lineTo(x + Math.cos(a) * 36, y + Math.sin(a) * 36 - 70); stroke(6); } });
    } else if (mood === 'sad') {
      eyes(0, 12); brow(-1, 10, 2); brow(1, 10, 2);
      g.beginPath(); g.moveTo(186, my + 16); g.quadraticCurveTo(198, my - 6, 212, my + 2); g.quadraticCurveTo(224, my - 2, 236, my + 16); stroke(7);
      const tx = 210 - EX - 26, ty = ey + 44;
      g.beginPath(); g.moveTo(tx, ty - 16); g.quadraticCurveTo(tx + 15, ty + 10, tx, ty + 14); g.quadraticCurveTo(tx - 15, ty + 10, tx, ty - 16);
      g.fillStyle = '#8fd6ff'; g.fill(); stroke(5);
    } else if (mood === 'think') {
      eyes(-8, -12); brow(-1, -3, 14); brow(1, 5, 0);
      g.beginPath(); g.moveTo(184, my + 6); g.quadraticCurveTo(196, my - 8, 208, my + 4); g.quadraticCurveTo(218, my + 14, 228, my + 2); stroke(7);
      arm(318, ey + 128, 262, ey + 104);
      const tx = 318, ty = B.top + 34;   // Schweißtropfen
      g.beginPath(); g.moveTo(tx, ty - 18); g.quadraticCurveTo(tx + 16, ty + 10, tx, ty + 14); g.quadraticCurveTo(tx - 16, ty + 10, tx, ty - 18);
      g.fillStyle = '#8fd6ff'; g.fill(); stroke(5);
    }

    // Erkennungszeichen vor dem Körper
    if (style === 0) {   // Partyhut
      const hat = () => { g.beginPath(); g.moveTo(160, B.top + 30); g.quadraticCurveTo(214, B.top - 8, 268, B.top + 14); g.lineTo(244, B.top - 112); g.closePath(); };
      hat(); g.fillStyle = PAPER; g.fill();
      g.save(); g.clip(); g.strokeStyle = '#5cb8ff'; g.lineWidth = 15;
      for (let i = 0; i < 5; i++) { g.beginPath(); g.moveTo(130, B.top - 100 + i * 36); g.lineTo(300, B.top - 60 + i * 36); g.stroke(); }
      g.restore();
      hat(); ink(g, 8);
      blob(g, oval(245, B.top - 118, 17, 17, 8, r, 3)); g.fillStyle = SUN; g.fill(); ink(g, 6);
    } else if (style === 3) {   // Kappe
      const dome = () => { g.beginPath(); g.moveTo(124, B.top + 70); g.bezierCurveTo(118, B.top - 46, 300, B.top - 50, 296, B.top + 64); g.quadraticCurveTo(210, B.top + 46, 124, B.top + 70); g.closePath(); };
      blob(g, [[250, B.top + 44], [330, B.top + 40], [392, B.top + 66], [330, B.top + 84], [262, B.top + 78]]); g.fillStyle = RED; g.fill(); ink(g, 8);
      dome(); g.fillStyle = '#24395c'; g.fill();
      g.save(); g.clip(); halftone(g, 110, B.top - 50, 310, B.top + 80, 12, '#16263f', x => (x - 220) / 100);
      g.restore();
      dome(); ink(g, 8);
      blob(g, oval(210, B.top - 22, 12, 9, 7, r, 2)); g.fillStyle = PAPER; g.fill(); ink(g, 5);
    }
    return sticker(c, 9);
  }

  const figTex = new Map();
  function figureTex(style, color, mood) {
    const key = style + color + mood;
    let t = figTex.get(key);
    if (!t) { const c = drawFigure(style, color, mood); t = { front: tex(c), sil: tex(silhouette(c)) }; figTex.set(key, t); }
    return t;
  }
  const shadowT = (() => {
    const [c, g] = mk(128, 64);
    g.fillStyle = 'rgba(27,22,48,.3)'; g.beginPath(); g.ellipse(64, 32, 58, 26, 0, 0, 7); g.fill();
    return tex(c);
  })();
  const figGeo = new T.PlaneGeometry(FIG_W, FIG_H).translate(0, FIG_H / 2 - (FH - FEET) / FH * FIG_H, 0);
  const shadowGeo = new T.PlaneGeometry(1.75, .85).rotateX(-Math.PI / 2);

  const figs = new Map();
  const now = () => performance.now() / 1000;

  function makeFig(p, index) {
    const g = new T.Group(), card = new T.Group();
    g.add(card);
    const layers = [cutMat(null, CARD_D), cutMat(null, CARD)].map((m, i) => {
      const mesh = new T.Mesh(figGeo, m);
      mesh.position.set(.022 * (2 - i), -.022 * (2 - i), -.028 * (2 - i));
      card.add(mesh);
      return m;
    });
    const frontM = cutMat(null);
    card.add(new T.Mesh(figGeo, frontM));
    const shadow = new T.Mesh(shadowGeo, new T.MeshBasicMaterial({ map: shadowT, transparent: true, depthWrite: false }));
    shadow.renderOrder = -1;
    scene.add(g, shadow);
    const label = document.createElement('div');
    label.className = 'fig-label';
    label.innerHTML = '<span class="fig-status" hidden></span>';
    const tag = document.createElement('div');
    tag.className = 'fig-tag';
    labels.append(label, tag);
    return { id: p.id, style: index % 4, color: p.color, g, card, layers, frontM, shadow, label, tag, shown: '', pos: new T.Vector3(0, 9, 3), fresh: true, face: 1, faceGoal: 1, walk: null, gone: false, mood: 'idle', jumpT: -9, phase: Math.random() * 6, blinkAt: now() + 1 + Math.random() * 3, pops: [] };
  }

  function setPlayers(list) {
    const ids = new Set(list.map(p => p.id));
    figs.forEach((f, id) => { if (!ids.has(id)) { scene.remove(f.g, f.shadow); f.label.remove(); f.tag.remove(); f.pops.forEach(x => x.el.remove()); figs.delete(id); } });
    list.forEach((p, i) => {
      let f = figs.get(p.id);
      if (!f) { f = makeFig(p, i); figs.set(p.id, f); }
      if (f.color !== p.color) { f.color = p.color; f.shown = ''; }
      f.tag.style.setProperty('--pc', p.color);
      f.label.style.setProperty('--pc', p.color);
      f.tag.textContent = p.name;
      f.order = i;
    });
  }

  function walkTo(f, x, y, z, dur) {
    return new Promise(resolve => {
      if (f.walk) f.walk.resolve();
      const from = f.pos.clone(), to = new T.Vector3(x, y, z);
      const dist = from.distanceTo(to);
      if (dist < 0.01) { f.walk = null; return resolve(); }
      const d = calm ? 0.01 : (dur || Math.min(2, 0.45 + dist * 0.26));
      f.walk = { from, to, t0: now(), dur: d, hops: Math.max(1, Math.round(dist / 0.8)), resolve };
    });
  }

  const stairPos = (s, i, n) => { const k = Math.min(s, STEPS - 1); return [stepX(k) + (i - (n - 1) / 2) * stepW * .8 / Math.max(2, n), stepTop(k), -0.95 + i * 0.5]; };

  /* ---------- Kamera ---------- */
  // Jede Einstellung nennt die Punkte, die im freien Bereich zu sehen sein müssen.
  const SHOTS = {
    question: { look: [0, 1.4, 0], elev: 25, pts: [[-7.5, 3.75, SIGN_Z], [7.5, 3.75, SIGN_Z], [-7.3, 0, -0.1], [7.3, 0, -0.1], [-5.4, -0.5, 2.6], [5.4, -0.5, 2.6]] },
    reveal: { look: [0, 1.4, -1], elev: 20, pts: [[-7.5, 3.8, SIGN_Z], [7.5, 3.8, SIGN_Z], [-7.4, -0.35, 0.1], [7.4, -0.35, 0.1]] },
    doors: { look: [0, 1.9, -0.6], elev: 17, pts: [[-7.3, 4.75, DOOR_Z], [7.3, 4.75, DOOR_Z], [-7.3, 0, -0.1], [7.3, 0, -0.1], [-5.4, -0.5, 2.6], [5.4, -0.5, 2.6]] },
    lobby: { look: [0, 1.1, 0.6], elev: 9, pts: [[-4.8, -0.55, 0.6], [4.8, -0.55, 0.6], [-4.8, 3, 0.6], [4.8, 3, 0.6]] },
    climb: { look: [0, 2.4, 0], elev: 11, pts: [[-8.1, -0.45, 1.05], [8.4, -0.45, 1.05], [-8.1, 2.7, -0.2], [8.6, 6.4, -1.2]] },
    podium: { look: [0, 1.6, 0], elev: 8, pts: [[-6.1, -0.5, 0.9], [6.1, -0.5, 0.9], [0, 4.6, 0], [-4, 3.6, 0], [4, 3.6, 0]] }
  };
  let shot = 'question', snapUntil = 0;
  const ins = { top: 0, right: 0, bottom: 0, left: 0 };
  const cam = { look: new T.Vector3(0, 1.4, 0), elev: 25, dist: 18, ox: 0, oy: 0 };
  const goal = { look: new T.Vector3(0, 1.4, 0), elev: 25, dist: 18, ox: 0, oy: 0 };
  const v = new T.Vector3(), dirV = new T.Vector3();

  function place(c, look, elev, dist, sway) {
    const e = elev * Math.PI / 180;
    c.position.set(look.x + sway, look.y + Math.sin(e) * dist, look.z + Math.cos(e) * dist);
    c.lookAt(look);
    c.updateMatrixWorld();
    c.matrixWorldInverse.copy(c.matrixWorld).invert();
  }
  function aimCamera() {
    const s = SHOTS[shot];
    goal.look.set(...s.look); goal.elev = s.elev;
    // freier Bereich in Bildkoordinaten (-1 … 1)
    let fx0 = -1 + 2 * ins.left / W, fx1 = 1 - 2 * ins.right / W, fy0 = -1 + 2 * ins.bottom / H, fy1 = 1 - 2 * ins.top / H;
    if (fx1 - fx0 < .5) { fx0 = -1; fx1 = 1; }
    if (fy1 - fy0 < .4) { fy0 = -1; fy1 = 1; }
    const padX = 24 / W, padY = 20 / H;
    fx0 += padX; fx1 -= padX; fy0 += padY; fy1 -= padY;
    probe.aspect = W / H; probe.updateProjectionMatrix();
    let lo = 3, hi = 90, bb = null;
    const measure = d => {
      place(probe, goal.look, goal.elev, d, 0);
      const b = [9, -9, 9, -9];
      s.pts.forEach(p => { v.set(p[0], p[1], p[2]).project(probe); b[0] = Math.min(b[0], v.x); b[1] = Math.max(b[1], v.x); b[2] = Math.min(b[2], v.y); b[3] = Math.max(b[3], v.y); });
      return b;
    };
    for (let i = 0; i < 22; i++) {
      const d = (lo + hi) / 2, b = measure(d);
      if (b[1] - b[0] <= fx1 - fx0 && b[3] - b[2] <= fy1 - fy0) { hi = d; bb = b; } else lo = d;
    }
    if (!bb) bb = measure(hi);
    goal.dist = hi;
    goal.ox = (fx0 + fx1) / 2 - (bb[0] + bb[1]) / 2;
    goal.oy = (fy0 + fy1) / 2 - (bb[2] + bb[3]) / 2;
  }

  /* ---------- Öffentliche Befehle ---------- */
  let host = null;
  const ro = 'ResizeObserver' in window ? new ResizeObserver(() => resize()) : null;
  function resize() {
    if (!host) return;
    W = Math.max(1, host.clientWidth); H = Math.max(1, host.clientHeight);
    renderer.setSize(W, H, false);
    camera.aspect = W / H;
    aimCamera();
  }
  function mount(el) {
    if (!el) return;
    if (ro && host) ro.unobserve(host);
    host = el;
    ins.top = ins.right = ins.bottom = ins.left = 0;
    el.append(canvas, labels);
    if (ro) ro.observe(el);
    snapUntil = now() + 0.3;
    resize();
  }
  function setInsets(i) {
    ['top', 'right', 'bottom', 'left'].forEach(k => { ins[k] = Math.max(0, (i && i[k]) || 0); });
    aimCamera();
  }

  function layout(m, opts = {}) {
    mode = m; shot = m;
    if (opts.summit) buildStairs(opts.summit);
    else if (m === 'climb' && !STEPS) buildStairs(lastSummit);
    padGroup.visible = m === 'question';
    doorGroup.visible = m === 'doors';
    stairs.visible = m === 'climb';
    podium.visible = m === 'podium';
    marquee.visible = m === 'question';
    aimCamera();
    const list = [...figs.values()].sort((a, b) => a.order - b.order);
    const n = list.length;
    return Promise.all(list.map((f, i) => {
      f.mood = m === 'lobby' ? 'wave' : 'idle';
      setLabel(f.id, { status: '' });
      let x = 0, y = 0, z = 0;
      if (f.gone) { f.gone = false; f.fresh = true; }   // war durch eine Tür gegangen: plumpst wieder herein
      if (m === 'question' || m === 'doors') { x = (i - (n - 1) / 2) * 2.7; z = 2.2; }
      else if (m === 'lobby') { x = (i - (n - 1) / 2) * 2.4; z = 0.6; }
      else if (m === 'climb') { [x, y, z] = stairPos((opts.steps && opts.steps[f.id]) || 0, i, n); }
      else if (m === 'podium') {
        const r = opts.ranks ? opts.ranks.indexOf(f.id) : i;
        if (r < 3) { x = POD[r].x; y = POD[r].h; } else { x = 5; z = 0.5; }
        f.mood = r === 0 ? 'cheer' : r < 3 ? 'wave' : 'sad';
      }
      if (f.fresh) { f.fresh = false; f.pos.set(x, y + 9, z); return walkTo(f, x, y, z, 0.7); }
      return walkTo(f, x, y, z);
    }));
  }

  function setLabel(id, { status, fx }) {
    const f = figs.get(id); if (!f) return;
    const s = f.label.querySelector('.fig-status');
    if (status !== undefined || fx !== undefined) {
      const parts = [];
      if (fx && fx.length) parts.push(fx.join(' · '));
      if (status) parts.push(status);
      s.textContent = parts.join(' · ');
      s.hidden = !parts.length;
    }
  }

  function setAnswers(texts) {
    pads.forEach((p, i) => {
      p.text = texts ? texts[i] : null;
      p.state = ''; p.tipGoal = 0; p.bounce = texts ? now() + i * 0.07 : -9;
      drawPad(p); drawSign(p);
    });
  }

  /* names: bis zu vier Kategorien. Überzählige Türen verschwinden. */
  function setDoors(names) {
    doors.forEach((d, i) => {
      d.grp.visible = i < names.length;
      d.text = names[i] || ''; d.state = ''; d.open = 0; d.openGoal = 0; d.bounce = now() + i * 0.08;
      drawDoorFrame(d); drawDoorLeaf(d);
    });
  }
  /* Figur stellt sich vor die Tür, für die abgestimmt wurde. */
  function voteWalk(id, door) {
    const f = figs.get(id), d = doors[door];
    if (!f || !d) return done();
    const slot = [[-0.8, 0], [0.8, 0], [-0.4, 0.85], [0.4, 0.85]][f.order % 4];
    f.jumpT = now();
    return walkTo(f, d.x + slot[0], 0, DOOR_Z + 2.9 + slot[1]);
  }
  /* Gewinner-Tür leuchtet und schwingt auf, die anderen werden grau. */
  function openDoor(door) {
    doors.forEach((d, i) => {
      d.state = i === door ? 'won' : 'lost';
      if (i === door) { d.openGoal = 1; d.bounce = now(); }
      drawDoorFrame(d); drawDoorLeaf(d);
    });
    return new Promise(r => setTimeout(r, calm ? 50 : 750));
  }
  /* Alle Figuren laufen nacheinander durch die Tür und verschwinden dahinter. */
  function enterDoor(door) {
    const d = doors[door];
    if (!d) return done();
    const list = [...figs.values()].filter(f => !f.gone).sort((a, b) => Math.abs(a.pos.x - d.x) - Math.abs(b.pos.x - d.x));
    return Promise.all(list.map((f, i) => new Promise(resolve => {
      setTimeout(async () => {
        f.mood = 'cheer';
        await walkTo(f, d.x, 0, DOOR_Z + 1.2);
        f.mood = 'idle';
        await walkTo(f, d.x, 0, DOOR_Z - 0.2, 0.5);
        f.gone = true;
        resolve();
      }, calm ? 0 : i * 320);
    }))).then(() => { d.openGoal = 0; });
  }

  function lock(id) { const f = figs.get(id); if (f) f.jumpT = now(); }
  function mood(id, m) { const f = figs.get(id); if (f) f.mood = m; }

  /* choices: [{ id, pad }]. Mehrere Figuren auf einem Feld stellen sich nebeneinander. */
  const SLOTS = [[-0.85, 0.1], [0.85, 0.1], [0, 0.8], [0, -0.5]];
  function walkToPads(choices) {
    const used = [0, 0, 0, 0];
    shot = 'reveal'; aimCamera();
    return Promise.all(choices.map(c => {
      const f = figs.get(c.id); if (!f || !pads[c.pad]) return null;
      const slot = SLOTS[used[c.pad]++ % 4];
      f.mood = 'idle';
      return walkTo(f, PAD_X[c.pad] + slot[0], PAD_TOP, PAD_Z + slot[1]);
    }));
  }

  /* results: [{ id, correct }] */
  function reveal(correctPad, results) {
    pads.forEach((p, i) => {
      const right = i === correctPad;
      p.state = right ? 'right' : 'wrong';
      p.tipGoal = right ? 0 : -0.5;
      if (right) p.bounce = now();
      drawPad(p); drawSign(p);
    });
    results.forEach(r => mood(r.id, r.correct ? 'cheer' : 'sad'));
  }

  function pop(id, text, good) {
    const f = figs.get(id); if (!f) return;
    const el = document.createElement('div');
    el.className = 'fig-pop ' + (good ? 'is-good' : 'is-bad');
    el.innerHTML = '<span></span>';
    el.firstChild.textContent = text;
    labels.appendChild(el);
    f.pops.push({ el, t0: now() });
  }

  function climb(steps) {
    const list = [...figs.values()].sort((a, b) => a.order - b.order);
    return Promise.all(list.map((f, i) => { const [x, y, z] = stairPos(steps[f.id] || 0, i, list.length); return walkTo(f, x, y, z, 0.9); }));
  }

  /* ---------- Animation ---------- */
  function project(x, y, z) { v.set(x, y, z).project(camera); return [(v.x * 0.5 + 0.5) * W, (-v.y * 0.5 + 0.5) * H]; }

  function updateFig(f, t, dt) {
    f.g.visible = !f.gone;
    f.label.hidden = f.tag.hidden = f.gone;
    if (f.gone) { f.shadow.visible = false; return; }
    const wob = calm ? 0 : 1;
    let hop = 0, turn = 1, tilt = Math.sin(t * 1.7 + f.phase) * 0.035 * wob, look = f.mood, ground = f.pos.y;
    if (f.walk) {
      const w = f.walk, k = (t - w.t0) / w.dur;
      if (k >= 1) { f.pos.copy(w.to); f.walk = null; f.faceGoal = 1; w.resolve(); }
      else {
        const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
        f.pos.lerpVectors(w.from, w.to, e);
        ground = w.from.y - w.to.y > 5 ? w.to.y : f.pos.y;
        const beat = e * Math.PI * w.hops;
        hop = Math.abs(Math.sin(beat)) * 0.38;
        tilt = Math.cos(beat) * 0.16 * wob;
        const dx = w.to.x - w.from.x;
        if (Math.abs(dx) > 0.3) f.faceGoal = dx < 0 ? -1 : 1;
      }
    }
    const jk = (t - f.jumpT) / 0.6;
    if (jk >= 0 && jk < 1) { hop += Math.sin(jk * Math.PI) * 0.95; turn = Math.cos(jk * Math.PI * 2); look = 'cheer'; }

    let sx = 1, sy = 1 + Math.sin(t * 3 + f.phase) * 0.02 * wob;
    if (!f.walk && !(jk >= 0 && jk < 1)) {
      if (f.mood === 'cheer') { const b = Math.abs(Math.sin((t + f.phase) * 6.5)); hop += b * 0.42 * wob; tilt = Math.sin((t + f.phase) * 6.5) * 0.1 * wob; }
      else if (f.mood === 'sad') { sy = 0.93; sx = 1.04; tilt = -0.09; }
      else if (f.mood === 'wave') { tilt = Math.sin(t * 5 + f.phase) * 0.06 * wob; }
      else if (f.mood === 'think') { tilt = Math.sin(t * 1.9 + f.phase) * 0.08 * wob; }
    }
    if (hop > 0) { sy += hop * 0.14; sx -= hop * 0.07; }
    if (look === 'idle' && t > f.blinkAt) { look = 'blink'; if (t > f.blinkAt + 0.13) f.blinkAt = t + 2 + Math.random() * 3; }
    if (f.shown !== look) {
      f.shown = look;
      const tx = figureTex(f.style, f.color, look);
      f.frontM.map = tx.front; f.frontM.needsUpdate = true;
      f.layers.forEach(m => { m.map = tx.sil; m.needsUpdate = true; });
    }

    // Umdrehen wie eine Spielkarte: Breite geht durch null
    f.face += (f.faceGoal - f.face) * Math.min(1, dt * 11);
    let fx = f.face * turn;
    if (Math.abs(fx) < 0.03) fx = fx < 0 ? -0.03 : 0.03;
    f.g.position.set(f.pos.x, f.pos.y + hop, f.pos.z);
    f.card.scale.set(sx * fx, sy, 1);
    f.card.rotation.z = tilt;
    const air = clamp(1 - (f.pos.y + hop - ground) * 0.5, 0.25, 1);
    f.shadow.position.set(f.pos.x + 0.1, ground + 0.012, f.pos.z + 0.04);
    f.shadow.scale.set(air, 1, air);
    f.shadow.visible = f.pos.y - ground < 4;

    const [lx, ly] = project(f.g.position.x, f.g.position.y + FIG_H * 0.86, f.g.position.z);
    f.label.style.transform = `translate(${lx.toFixed(1)}px, ${ly.toFixed(1)}px) translate(-50%, -100%)`;
    const [tx, ty] = project(f.pos.x, f.pos.y - 0.06, f.pos.z);
    f.tag.style.transform = `translate(${tx.toFixed(1)}px, ${ty.toFixed(1)}px) translate(-50%, 0) rotate(${f.order % 2 ? 2 : -2}deg)`;
    f.pops = f.pops.filter(p => {
      const age = t - p.t0;
      if (age > 2.6) { p.el.remove(); return false; }
      const grow = Math.min(1, age * 5);
      p.el.style.transform = `translate(${lx.toFixed(1)}px, ${Math.max(50, ly - 6 - Math.min(age, .5) * 44).toFixed(1)}px) translate(-50%, -100%) scale(${(0.4 + grow * 0.6).toFixed(2)}) rotate(${f.order % 2 ? 5 : -6}deg)`;
      p.el.style.opacity = String(clamp(4 - age * 1.6, 0, 1));
      return true;
    });
  }

  let last = now();
  function tick() {
    requestAnimationFrame(tick);
    if (!canvas.isConnected) return;
    const t = now(), dt = Math.min(0.05, t - last);
    last = t;
    const k = t < snapUntil || calm ? 1 : 1 - Math.pow(0.02, dt);
    cam.look.lerp(goal.look, k);
    ['elev', 'dist', 'ox', 'oy'].forEach(key => { cam[key] += (goal[key] - cam[key]) * k; });
    camera.setViewOffset(W, H, -cam.ox * W / 2, cam.oy * H / 2, W, H);
    place(camera, cam.look, cam.elev, cam.dist, calm ? 0 : Math.sin(t * 0.27) * cam.dist * 0.035);

    curtains.forEach(c => {
      v.set(c.s, 0, 0.5).unproject(camera).sub(camera.position);
      const edge = camera.position.x + v.x * (c.o.position.z - camera.position.z) / v.z;
      c.o.position.x = edge + c.s * 1.3;
    });
    swayers.forEach(s => {
      const w = calm ? 0 : Math.sin(t * s.sp + s.ph);
      if (s.rz) s.o.rotation.z = (s.base || 0) + w * s.rz;
      if (s.by) s.o.position.y = s.y + Math.abs(w) * s.by;
    });
    if (padGroup.visible) pads.forEach(p => {
      p.tip += (p.tipGoal - p.tip) * Math.min(1, dt * 7);
      const b = (t - p.bounce) / 0.5;
      const pulse = b >= 0 && b < 1 && !calm ? Math.sin(b * Math.PI) : 0;
      p.sign.rotation.x = p.tip;
      p.sign.scale.setScalar(1 + pulse * 0.12);
      p.sign.rotation.z = p.state === 'right' && !calm ? Math.sin(t * 5) * 0.03 : 0;
      p.tile.position.y = PAD_TOP / 2 + (p.state === 'wrong' ? -0.07 : 0);
    });
    if (doorGroup.visible) doors.forEach(d => {
      d.open += (d.openGoal - d.open) * Math.min(1, dt * 6);
      d.hinge.rotation.y = d.side * d.open * 1.5;
      const b = (t - d.bounce) / 0.5;
      const pulse = b >= 0 && b < 1 && !calm ? Math.sin(b * Math.PI) : 0;
      d.frame.scale.setScalar(1 + pulse * 0.05);
    });
    if (stairs.visible) {
      clouds.forEach(c => { c.o.position.x = c.x + (calm ? 0 : Math.sin(t * 0.12 + c.ph) * 1.6); });
      if (flag) flag.userData.cloth.scale.x = calm ? 1 : 0.9 + Math.sin(t * 4) * 0.1;
    }
    if (podium.visible) {
      burst.rotation.z = calm ? 0 : t * 0.25;
      confetti.forEach(c => {
        c.y -= c.v * dt;
        if (c.y < 0) { c.y = 9 + Math.random() * 3; c.x = (Math.random() - .5) * 17; }
        c.m.position.set(c.x + Math.sin(t * 1.3 + c.ph) * 0.5, c.y, c.z);
        c.m.rotation.set(t * c.s, t * c.s * 0.7 + c.ph, c.ph);
      });
    }
    figs.forEach(f => updateFig(f, t, dt));
    renderer.render(scene, camera);
  }
  requestAnimationFrame(tick);

  // Sobald die Comic-Schrift geladen ist, alles Beschriftete neu zeichnen
  if (document.fonts && document.fonts.load) {
    document.fonts.load('40px Bangers').then(() => {
      refreshMarquee(); drawPodium();
      pads.forEach(drawSign);
      doors.forEach(d => { drawDoorFrame(d); drawDoorLeaf(d); });
      if (STEPS) { const s = STEPS - 1; STEPS = 0; buildStairs(s); }
    }).catch(noop);
  }

  return { ok: true, mount, setPlayers, setInsets, setDoors, voteWalk, openDoor, enterDoor, layout, setLabel, setAnswers, lock, walkToPads, reveal, pop, climb, mood };
})();
