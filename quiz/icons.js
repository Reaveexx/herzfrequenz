'use strict';
/*
  Gezeichnete Item-Icons im Papier-Comic-Stil: Tuschekontur, Rasterpunkte, weißer
  Schnittrand. Alles wird im Browser auf eine Zeichenfläche gemalt, es gibt keine
  Bilddateien. Bildschirm und Handy benutzen dieselben Zeichnungen.

  ItemArt.url('frost') liefert ein Bild als data:-Adresse für <img src="…">.
*/
const ItemArt = (() => {
  const INK = '#1b1630', PAPER = '#fffaf0', SUN = '#ffc83d', RED = '#e8433f';
  const S = 256;

  function mk() { const c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d'); g.lineJoin = g.lineCap = 'round'; return [c, g]; }
  function rnd(seed) { let a = seed >>> 0; return () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  /* weiche geschlossene Form durch Punkte */
  function blob(g, pts) {
    const n = pts.length, mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    g.beginPath();
    const s = mid(pts[n - 1], pts[0]);
    g.moveTo(s[0], s[1]);
    for (let i = 0; i < n; i++) { const m = mid(pts[i], pts[(i + 1) % n]); g.quadraticCurveTo(pts[i][0], pts[i][1], m[0], m[1]); }
    g.closePath();
  }
  function poly(g, pts) { g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.closePath(); }
  function ink(g, w = 9) { g.save(); g.strokeStyle = INK; g.lineWidth = w; g.shadowColor = INK; g.shadowOffsetX = w * .2; g.shadowOffsetY = w * .26; g.stroke(); g.restore(); }
  /* Rasterpunkte als eigenes Bild, damit das Zeichnen der Punkte die aktuelle Form nicht ersetzt */
  const dotCache = {};
  function dots(color) {
    if (dotCache[color]) return dotCache[color];
    const [c, g] = mk();
    g.fillStyle = color;
    let row = 0;
    for (let y = 0; y <= S; y += 11, row++) for (let x = row % 2 ? 6 : 0; x <= S; x += 13) {
      const rad = Math.max(0, Math.min(1, (x + y - 230) / 190)) * 6.4;
      if (rad > .4) { g.beginPath(); g.arc(x, y, rad, 0, 7); g.fill(); }
    }
    return (dotCache[color] = c);
  }
  /* füllt die aktuelle Form, legt Rasterpunkte als Schatten nach unten rechts und zieht die Kontur */
  function paint(g, color, dark, w = 9) {
    g.fillStyle = color; g.fill();
    g.save(); g.clip(); g.drawImage(dots(dark), 0, 0); g.restore();
    ink(g, w);
  }
  function sparkle(g, x, y, r) {
    g.beginPath();
    for (let i = 0; i < 8; i++) { const rad = i % 2 ? r * .32 : r, a = i / 8 * Math.PI * 2 - Math.PI / 2; g.lineTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad); }
    g.closePath(); g.fillStyle = PAPER; g.fill(); ink(g, 5);
  }
  /* weißer Papierrand wie ausgeschnitten */
  function sticker(src) {
    const [c, g] = mk();
    const tint = color => { const [t, tg] = mk(); tg.drawImage(src, 0, 0); tg.globalCompositeOperation = 'source-in'; tg.fillStyle = color; tg.fillRect(0, 0, S, S); return t; };
    const ring = (img, rad) => { for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2; g.drawImage(img, Math.cos(a) * rad, Math.sin(a) * rad); } };
    ring(tint('#a89c86'), 10); ring(tint(PAPER), 8);
    g.drawImage(src, 0, 0);
    return c;
  }

  const DRAW = {
    /* Frost: Eiswürfel mit Glanz */
    frost(g) {
      poly(g, [[58, 96], [128, 62], [204, 92], [204, 178], [130, 214], [58, 182]]); paint(g, '#9fdcff', '#5fb4e6');
      poly(g, [[58, 96], [128, 62], [204, 92], [132, 124]]); g.fillStyle = '#e2f6ff'; g.fill(); ink(g, 7);
      g.beginPath(); g.moveTo(132, 124); g.lineTo(130, 214); g.strokeStyle = INK; g.lineWidth = 7; g.stroke();
      g.strokeStyle = PAPER; g.lineWidth = 9;
      g.beginPath(); g.moveTo(78, 124); g.lineTo(78, 160); g.stroke();
      g.beginPath(); g.moveTo(96, 134); g.lineTo(96, 150); g.stroke();
      sparkle(g, 196, 58, 26); sparkle(g, 52, 212, 17);
    },
    /* Nebel: dicke Wolke, die Textzeilen verschluckt */
    nebel(g) {
      g.strokeStyle = INK; g.lineWidth = 9;
      [[36, 196, 220], [56, 224, 196]].forEach(([x0, y, x1]) => { g.beginPath(); g.moveTo(x0, y); g.lineTo(x1, y); g.stroke(); });
      blob(g, [[40, 172], [22, 124], [62, 96], [78, 52], [132, 40], [168, 66], [212, 64], [236, 112], [222, 162], [130, 182]]); paint(g, '#eef2f8', '#aab8cc');
      g.strokeStyle = INK; g.lineWidth = 7;
      g.beginPath(); g.moveTo(84, 122); g.quadraticCurveTo(108, 98, 130, 120); g.quadraticCurveTo(152, 142, 176, 118); g.stroke();
      g.beginPath(); g.moveTo(104, 150); g.quadraticCurveTo(120, 138, 136, 150); g.stroke();
    },
    /* Kreisel: bunter Brummkreisel mit Schwung */
    kreisel(g) {
      g.strokeStyle = INK; g.lineWidth = 8;
      g.beginPath(); g.arc(128, 150, 104, Math.PI * 1.08, Math.PI * 1.32); g.stroke();
      g.beginPath(); g.arc(128, 150, 104, -Math.PI * .32, -Math.PI * .08); g.stroke();
      g.beginPath(); g.moveTo(128, 60); g.lineTo(128, 26); g.lineWidth = 16; g.stroke(); g.strokeStyle = SUN; g.lineWidth = 7; g.stroke();
      g.beginPath(); g.arc(128, 24, 13, 0, 7); g.fillStyle = RED; g.fill(); ink(g, 6);
      const body = () => { g.beginPath(); g.moveTo(44, 104); g.quadraticCurveTo(128, 48, 212, 104); g.quadraticCurveTo(170, 190, 128, 232); g.quadraticCurveTo(86, 190, 44, 104); g.closePath(); };
      body(); g.fillStyle = RED; g.fill();
      g.save(); g.clip();
      g.fillStyle = SUN; g.fillRect(0, 118, S, 30);
      g.fillStyle = '#5cb8ff'; g.fillRect(0, 164, S, 22);
      g.restore();
      body(); paint(g, 'rgba(0,0,0,0)', 'rgba(27,22,48,.22)');
      g.beginPath(); g.ellipse(128, 100, 84, 22, 0, Math.PI, 0); g.strokeStyle = INK; g.lineWidth = 7; g.stroke();
    },
    /* Klecks: Tintenfleck mit Spritzern */
    klecks(g) {
      const r = rnd(8), pts = [];
      for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2, rad = (i % 2 ? 58 : 92) + r() * 14; pts.push([128 + Math.cos(a) * rad, 132 + Math.sin(a) * rad]); }
      blob(g, pts); paint(g, '#4a3a8c', '#2a1f5c');
      [[40, 44, 15], [218, 60, 11], [226, 204, 16], [38, 214, 10]].forEach(([x, y, rad]) => { g.beginPath(); g.arc(x, y, rad, 0, 7); g.fillStyle = '#4a3a8c'; g.fill(); ink(g, 6); });
      g.fillStyle = PAPER;
      g.save(); g.translate(98, 98); g.rotate(-.6); g.beginPath(); g.ellipse(0, 0, 26, 10, 0, 0, 7); g.fill(); g.restore();
      g.beginPath(); g.arc(76, 128, 7, 0, 7); g.fill();
    },
    /* Zeitdieb: Wecker mit Räubermaske */
    zeitdieb(g) {
      [[72, 54], [184, 54]].forEach(([x, y], i) => { g.save(); g.translate(x, y); g.rotate(i ? .55 : -.55); g.beginPath(); g.ellipse(0, 0, 34, 22, 0, Math.PI, 0); g.closePath(); g.fillStyle = SUN; g.fill(); ink(g, 7); g.restore(); });
      g.strokeStyle = INK; g.lineWidth = 12;
      g.beginPath(); g.moveTo(78, 214); g.lineTo(62, 238); g.moveTo(178, 214); g.lineTo(194, 238); g.stroke();
      g.beginPath(); g.arc(128, 140, 88, 0, 7); paint(g, RED, '#a81f29');
      g.beginPath(); g.arc(128, 140, 66, 0, 7); g.fillStyle = PAPER; g.fill(); ink(g, 7);
      g.strokeStyle = INK; g.lineWidth = 9;
      g.beginPath(); g.moveTo(128, 148); g.lineTo(128, 186); g.moveTo(128, 148); g.lineTo(158, 170); g.stroke();
      // Maske
      g.beginPath(); g.moveTo(50, 108); g.quadraticCurveTo(128, 84, 206, 108); g.lineTo(204, 146); g.quadraticCurveTo(128, 126, 52, 146); g.closePath(); g.fillStyle = INK; g.fill();
      g.fillStyle = PAPER; [[98, 122], [158, 122]].forEach(([x, y]) => { g.beginPath(); g.ellipse(x, y, 15, 10, 0, 0, 7); g.fill(); });
      g.fillStyle = INK; [[101, 123], [161, 123]].forEach(([x, y]) => { g.beginPath(); g.arc(x, y, 5.5, 0, 7); g.fill(); });
    },
    /* Spiegel: Handspiegel mit Glanzstreifen */
    spiegel(g) {
      g.save(); g.translate(128, 128); g.rotate(.5); g.translate(-128, -128);
      g.beginPath(); g.moveTo(116, 176); g.lineTo(140, 176); g.lineTo(146, 250); g.lineTo(110, 250); g.closePath(); paint(g, SUN, '#e08a1e', 8);
      g.beginPath(); g.ellipse(128, 100, 78, 90, 0, 0, 7); paint(g, SUN, '#e08a1e');
      g.beginPath(); g.ellipse(128, 100, 56, 68, 0, 0, 7); g.fillStyle = '#bfe9ff'; g.fill();
      g.save(); g.clip(); g.strokeStyle = PAPER; g.lineWidth = 16;
      g.beginPath(); g.moveTo(60, 110); g.lineTo(150, 20); g.stroke();
      g.lineWidth = 8; g.beginPath(); g.moveTo(96, 150); g.lineTo(190, 56); g.stroke();
      g.restore();
      g.beginPath(); g.ellipse(128, 100, 56, 68, 0, 0, 7); ink(g, 7);
      g.restore();
    },
    /* Schild: Wappenschild mit Stern */
    schild(g) {
      const shape = () => { g.beginPath(); g.moveTo(128, 24); g.quadraticCurveTo(176, 52, 222, 50); g.quadraticCurveTo(228, 176, 128, 238); g.quadraticCurveTo(28, 176, 34, 50); g.quadraticCurveTo(80, 52, 128, 24); g.closePath(); };
      shape(); paint(g, '#5cb8ff', '#2f7fc4', 10);
      g.save(); g.scale(.78, .78); g.translate(36, 36); shape(); g.strokeStyle = PAPER; g.lineWidth = 9; g.stroke(); g.restore();
      g.beginPath();
      for (let i = 0; i < 10; i++) { const rad = i % 2 ? 22 : 52, a = i / 10 * Math.PI * 2 - Math.PI / 2; g.lineTo(128 + Math.cos(a) * rad, 126 + Math.sin(a) * rad); }
      g.closePath(); g.fillStyle = SUN; g.fill(); ink(g, 7);
    }
  };

  const cache = {}, canvases = {};
  /* Zeichenfläche mit dem fertigen Icon, z. B. als Textur für die Bühne */
  function canvas(name) {
    if (canvases[name]) return canvases[name];
    if (!DRAW[name]) return null;
    const [c, g] = mk();
    DRAW[name](g);
    return (canvases[name] = sticker(c));
  }
  function url(name) {
    if (cache[name]) return cache[name];
    const c = canvas(name);
    return c ? (cache[name] = c.toDataURL('image/png')) : '';
  }
  const img = (name, cls = '') => `<img class="item-art ${cls}" src="${url(name)}" alt="" draggable="false">`;
  return { url, img, canvas, names: Object.keys(DRAW) };
})();
