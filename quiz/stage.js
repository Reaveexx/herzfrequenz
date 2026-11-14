'use strict';
/*
  3D-Bühne mit Spielfiguren für den großen Bildschirm (three.js r128).

  Die Figuren stehen an der Startlinie, hüpfen beim Einloggen und laufen bei
  der Auflösung auf das Feld ihrer Antwort. Im Finale klettern sie eine Treppe
  hoch, am Ende gibt es ein Siegerpodest.

  Ohne three.js oder ohne WebGL ist Stage.ok = false. Das Spiel zeigt dann
  einfach die 2D-Ansicht.
*/
const Stage = (() => {
  const T = window.THREE;
  const noop = () => {};
  const done = () => Promise.resolve();
  const fallback = { ok: false, mount: noop, setPlayers: noop, layout: done, setLabel: noop, setAnswers: noop, lock: noop, walkToPads: done, reveal: noop, pop: noop, climb: done, mood: noop };
  if (!T) return fallback;

  let renderer;
  try { renderer = new T.WebGLRenderer({ antialias: true }); } catch { return fallback; }

  const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  const canvas = renderer.domElement;
  canvas.className = 'stage-canvas';
  const labels = document.createElement('div');
  labels.className = 'stage-labels';

  const scene = new T.Scene();
  const BG = new T.Color(0x1d1655);
  scene.background = BG;
  scene.fog = new T.Fog(BG, 17, 36);
  const camera = new T.PerspectiveCamera(38, 16 / 9, 0.1, 100);
  const camPos = new T.Vector3(0, 6, 11), camLook = new T.Vector3(0, 0.6, 0);
  const camPosGoal = camPos.clone(), camLookGoal = camLook.clone();
  let W = 800, H = 450, mode = 'question';

  /* ---------- Licht und Studio ---------- */
  scene.add(new T.HemisphereLight(0xd8d2ff, 0x2b2170, 0.85));
  const sun = new T.DirectionalLight(0xffffff, 0.85);
  sun.position.set(5, 12, 8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12, near: 1, far: 40 });
  scene.add(sun);
  const rim = new T.PointLight(0xffd23f, 0.7, 26);
  rim.position.set(0, 6, -7);
  scene.add(rim);

  const mat = (color, extra = {}) => new T.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0, ...extra });
  const glow = (color, k = 0.8) => mat(color, { emissive: color, emissiveIntensity: k });

  const floor = new T.Mesh(new T.CylinderGeometry(12, 12, 0.4, 72), mat(0x33288a, { roughness: 0.95 }));
  floor.position.y = -0.2;
  floor.receiveShadow = true;
  scene.add(floor);
  [[11.6, 0.07, 0xffd23f, 0.8], [7.2, 0.04, 0x6d60e0, 0.6]].forEach(([r, w, c, k]) => {
    const ring = new T.Mesh(new T.TorusGeometry(r, w, 8, 140), glow(c, k));
    ring.rotation.x = Math.PI / 2; ring.position.y = 0.02; scene.add(ring);
  });
  const PILLARS = [0xff6b57, 0xffc83d, 0x3ee0a1, 0x5cb8ff];
  for (let i = 0; i < 12; i++) {
    const a = Math.PI + 0.25 + (Math.PI - 0.5) * (i / 11);
    const h = 6 + (i % 3) * 2.2;
    const p = new T.Mesh(new T.BoxGeometry(0.26, h, 0.26), glow(PILLARS[i % 4], 0.9));
    p.position.set(Math.cos(a) * 15, h / 2, Math.sin(a) * 15);
    scene.add(p);
  }

  /* ---------- Antwortfelder ---------- */
  const PAD_X = [-5.4, -1.8, 1.8, 5.4], PAD_Z = -1.6, PAD_TOP = 0.34;
  const PAPER = 0xf6f4ff, GOOD = 0x2fd18a, BAD = 0xff4d6d;
  const padGroup = new T.Group();
  scene.add(padGroup);
  const pads = PAD_X.map(x => {
    const g = new T.Group();
    g.position.set(x, 0, PAD_Z);
    const base = new T.Mesh(new T.CylinderGeometry(1.5, 1.6, 0.3, 6), mat(0x4a3fb5));
    base.position.y = 0.15; base.castShadow = true; base.receiveShadow = true;
    const topM = mat(PAPER, { roughness: 0.4 });
    const top = new T.Mesh(new T.CylinderGeometry(1.32, 1.32, 0.06, 6), topM);
    top.position.y = 0.31; top.receiveShadow = true;
    g.add(base, top);
    padGroup.add(g);
    const label = document.createElement('div');
    label.className = 'pad-label';
    labels.appendChild(label);
    return { g, topM, x, label, sink: 0, sinkGoal: 0 };
  });

  /* ---------- Treppe fürs Finale ---------- */
  // Die Treppe passt sich an die Gipfelhöhe aus SETTINGS.summit an
  let STEPS = 0, stepW = 1.4, rise = 0.32;
  const stepX = s => -7 + s * stepW;
  const stepTop = s => 0.25 + s * rise;
  const stairs = new T.Group();
  stairs.visible = false;
  scene.add(stairs);
  function buildStairs(summit) {
    if (summit + 1 === STEPS) return;
    while (stairs.children.length) stairs.remove(stairs.children[0]);
    STEPS = summit + 1;
    stepW = 14 / summit;
    rise = 3.2 / summit;
    for (let s = 0; s < STEPS; s++) {
      const h = stepTop(s);
      const b = new T.Mesh(new T.BoxGeometry(stepW * 0.93, h, 2.4), mat(s === STEPS - 1 ? 0xffd23f : s % 2 ? 0x5548c4 : 0x4a3fb5));
      b.position.set(stepX(s), h / 2, -0.2);
      b.castShadow = true; b.receiveShadow = true;
      stairs.add(b);
    }
    const top = STEPS - 1;
    const pole = new T.Mesh(new T.CylinderGeometry(0.04, 0.04, 1.7, 8), mat(0xf6f4ff));
    pole.position.set(stepX(top) + 0.4, stepTop(top) + 0.85, -1.1);
    const flag = new T.Mesh(new T.BoxGeometry(0.7, 0.42, 0.03), glow(0xff6b57, 0.4));
    flag.position.set(stepX(top) + 0.78, stepTop(top) + 1.45, -1.1);
    stairs.add(pole, flag);
  }
  buildStairs(10);

  /* ---------- Siegerpodest ---------- */
  const POD = [{ x: 0, h: 1.2 }, { x: -2.3, h: 0.8 }, { x: 2.3, h: 0.5 }];
  const podium = new T.Group();
  POD.forEach((p, i) => {
    const b = new T.Mesh(new T.BoxGeometry(2, p.h, 2), mat(i === 0 ? 0xffd23f : 0x5548c4));
    b.position.set(p.x, p.h / 2, 0); b.castShadow = true; b.receiveShadow = true;
    podium.add(b);
  });
  podium.visible = false;
  scene.add(podium);

  /* ---------- Spielfiguren ---------- */
  const bean = new T.LatheGeometry([[0, 0], [0.3, 0.02], [0.46, 0.14], [0.54, 0.4], [0.55, 0.7], [0.5, 0.98], [0.4, 1.18], [0.24, 1.31], [0, 1.36]].map(([x, y]) => new T.Vector2(x, y)), 28);
  const ball = new T.SphereGeometry(1, 20, 14);
  const INK = 0x120c33;
  const inkM = mat(INK, { roughness: 0.4 });
  const whiteM = mat(0xffffff, { roughness: 0.3 });
  const cheekM = mat(0xff8fa3, { roughness: 0.6 });

  function part(geo, m, s, x, y, z) {
    const mesh = new T.Mesh(geo, m);
    mesh.scale.set(s[0], s[1], s[2]); mesh.position.set(x, y, z); mesh.castShadow = true;
    return mesh;
  }

  function buildFigure(color, style) {
    const g = new T.Group(), bob = new T.Group();
    g.add(bob);
    const bodyM = mat(color, { roughness: 0.45 });
    const body = new T.Mesh(bean, bodyM); body.castShadow = true;
    bob.add(body);

    const eyes = new T.Group(); eyes.position.set(0, 0.98, 0.42);
    eyes.add(part(ball, whiteM, [0.13, 0.15, 0.1], -0.17, 0, 0), part(ball, whiteM, [0.13, 0.15, 0.1], 0.17, 0, 0),
      part(ball, inkM, [0.066, 0.078, 0.05], -0.16, -0.01, 0.08), part(ball, inkM, [0.066, 0.078, 0.05], 0.16, -0.01, 0.08));
    bob.add(eyes);
    const mouth = new T.Mesh(new T.TorusGeometry(0.09, 0.024, 6, 14, Math.PI), inkM);
    mouth.position.set(0, 0.8, 0.52); mouth.rotation.z = Math.PI;
    bob.add(mouth, part(ball, cheekM, [0.07, 0.04, 0.03], -0.3, 0.84, 0.46), part(ball, cheekM, [0.07, 0.04, 0.03], 0.3, 0.84, 0.46));

    const hands = [part(ball, bodyM, [0.12, 0.12, 0.12], -0.58, 0.55, 0.05), part(ball, bodyM, [0.12, 0.12, 0.12], 0.58, 0.55, 0.05)];
    bob.add(...hands);
    g.add(part(ball, inkM, [0.15, 0.08, 0.2], -0.2, 0.05, 0.06), part(ball, inkM, [0.15, 0.08, 0.2], 0.2, 0.05, 0.06));

    // Erkennungszeichen, damit man die Figuren auch ohne Farbe unterscheidet
    if (style === 0) {
      const hat = part(new T.ConeGeometry(1, 1, 18), whiteM, [0.2, 0.5, 0.2], 0.06, 1.55, 0); hat.rotation.z = -0.25;
      bob.add(hat, part(ball, glow(0xffd23f, 0.5), [0.07, 0.07, 0.07], 0.17, 1.79, 0));
    } else if (style === 1) {
      bob.add(part(new T.CylinderGeometry(1, 1, 1, 8), inkM, [0.02, 0.4, 0.02], 0, 1.52, 0), part(ball, glow(0xff6b57, 0.7), [0.09, 0.09, 0.09], 0, 1.76, 0));
    } else if (style === 2) {
      bob.add(part(ball, bodyM, [0.17, 0.17, 0.1], -0.3, 1.27, 0), part(ball, bodyM, [0.17, 0.17, 0.1], 0.3, 1.27, 0),
        part(ball, cheekM, [0.09, 0.09, 0.05], -0.3, 1.27, 0.06), part(ball, cheekM, [0.09, 0.09, 0.05], 0.3, 1.27, 0.06));
    } else {
      const cyl = new T.CylinderGeometry(1, 1, 1, 24);
      bob.add(part(cyl, inkM, [0.36, 0.16, 0.36], 0, 1.3, 0), part(cyl, inkM, [0.3, 0.03, 0.4], 0, 1.24, 0.3));
    }
    return { g, bob, bodyM, hands, mouth, eyes };
  }

  const figs = new Map();
  const now = () => performance.now() / 1000;

  function makeFig(p, index) {
    const parts = buildFigure(new T.Color(p.color), index % 4);
    scene.add(parts.g);
    const label = document.createElement('div');
    label.className = 'fig-label';
    label.innerHTML = '<span class="fig-status" hidden></span><span class="fig-name"></span>';
    labels.appendChild(label);
    return { id: p.id, ...parts, label, pos: new T.Vector3(0, 7, 3), fresh: true, face: 0, faceGoal: 0, walk: null, mood: 'idle', jumpT: -9, phase: Math.random() * 6, blinkAt: now() + 1 + Math.random() * 3, pops: [] };
  }

  function setPlayers(list) {
    const ids = new Set(list.map(p => p.id));
    figs.forEach((f, id) => { if (!ids.has(id)) { scene.remove(f.g); f.label.remove(); f.pops.forEach(x => x.el.remove()); figs.delete(id); } });
    list.forEach((p, i) => {
      let f = figs.get(p.id);
      if (!f) { f = makeFig(p, i); figs.set(p.id, f); }
      f.bodyM.color.set(p.color);
      f.label.style.setProperty('--pc', p.color);
      f.label.querySelector('.fig-name').textContent = p.name;
      f.order = i;
    });
  }

  function walkTo(f, x, y, z, dur) {
    return new Promise(resolve => {
      if (f.walk) f.walk.resolve();
      const from = f.pos.clone(), to = new T.Vector3(x, y, z);
      const dist = from.distanceTo(to);
      if (dist < 0.01) { f.walk = null; return resolve(); }
      const d = calm ? 0.01 : (dur || Math.min(2, 0.4 + dist * 0.26));
      f.walk = { from, to, t0: now(), dur: d, hops: Math.max(1, Math.round(dist / 0.75)), resolve };
    });
  }

  const stairPos = (s, i) => [stepX(Math.min(s, STEPS - 1)), stepTop(Math.min(s, STEPS - 1)), -0.9 + i * 0.5];

  /* ---------- Kamera ---------- */
  const CAMS = {
    question: { pos: [0, 6.6, 9.8], look: [0, 0.3, 1.3], need: 2.5 },
    lobby: { pos: [0, 2.7, 7.6], look: [0, 0.9, 0], need: 1.3 },
    climb: { pos: [0, 5.2, 13], look: [0, 1.7, 0], need: 1.8 },
    podium: { pos: [0, 3.1, 8.2], look: [0, 1.3, 0], need: 1.3 },
    reveal: { pos: [0, 5.4, 7.6], look: [0, 0.8, -1.3], need: 2.5 }
  };
  let shot = 'question';
  function aimCamera(instant) {
    const c = CAMS[shot];
    camLookGoal.set(...c.look);
    camPosGoal.set(...c.pos);
    const aspect = W / H;
    if (aspect < c.need) camPosGoal.sub(camLookGoal).multiplyScalar(Math.min(2.4, c.need / aspect)).add(camLookGoal);
    if (instant) { camPos.copy(camPosGoal); camLook.copy(camLookGoal); }
  }

  /* ---------- Öffentliche Befehle ---------- */
  let host = null;
  const ro = 'ResizeObserver' in window ? new ResizeObserver(() => resize()) : null;
  function resize() {
    if (!host) return;
    W = Math.max(1, host.clientWidth); H = Math.max(1, host.clientHeight);
    renderer.setSize(W, H, false);
    camera.aspect = W / H;
    camera.updateProjectionMatrix();
    aimCamera(false);
  }
  function mount(el) {
    if (!el) return;
    if (ro && host) ro.unobserve(host);
    host = el;
    el.append(canvas, labels);
    if (ro) ro.observe(el);
    resize();
  }

  function layout(m, opts = {}) {
    const first = mode !== m && !figs.size;
    mode = m; shot = m;
    if (opts.summit) buildStairs(opts.summit);
    padGroup.visible = m === 'question';
    stairs.visible = m === 'climb';
    podium.visible = m === 'podium';
    aimCamera(first);
    const list = [...figs.values()].sort((a, b) => a.order - b.order);
    const n = list.length;
    return Promise.all(list.map((f, i) => {
      f.mood = m === 'lobby' ? 'wave' : 'idle';
      setLabel(f.id, { status: '' });
      let x = 0, y = 0, z = 0;
      if (m === 'question') { x = (i - (n - 1) / 2) * 2.1; z = 4.4; }
      else if (m === 'lobby') { x = (i - (n - 1) / 2) * 2; }
      else if (m === 'climb') { [x, y, z] = stairPos((opts.steps && opts.steps[f.id]) || 0, i); }
      else if (m === 'podium') {
        const r = opts.ranks ? opts.ranks.indexOf(f.id) : i;
        if (r < 3) { x = POD[r].x; y = POD[r].h; } else { x = 4.6; z = 0.6; }
        f.mood = r === 0 ? 'cheer' : 'idle';
      }
      if (f.fresh) { f.fresh = false; f.pos.set(x, 7, z); return walkTo(f, x, y, z, 0.7); }
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
      p.label.textContent = texts ? texts[i] : '';
      p.label.className = 'pad-label' + (texts ? ' is-on' : '');
      p.topM.color.set(PAPER); p.topM.emissive.set(0x000000);
      p.sinkGoal = 0;
    });
  }

  function lock(id) { const f = figs.get(id); if (f) f.jumpT = now(); }
  function mood(id, m) { const f = figs.get(id); if (f) f.mood = m; }

  /* choices: [{ id, pad }]. Mehrere Figuren auf einem Feld stellen sich nebeneinander. */
  const SLOTS = [[-0.5, -0.35], [0.5, -0.35], [-0.5, 0.5], [0.5, 0.5]];
  function walkToPads(choices) {
    const used = [0, 0, 0, 0];
    shot = 'reveal'; aimCamera(false);
    return Promise.all(choices.map(c => {
      const f = figs.get(c.id); if (!f) return null;
      const slot = SLOTS[used[c.pad]++ % 4];
      f.mood = 'idle';
      return walkTo(f, PAD_X[c.pad] + slot[0], PAD_TOP, PAD_Z + slot[1]);
    }));
  }

  /* results: [{ id, correct, answered }] */
  function reveal(correctPad, results) {
    pads.forEach((p, i) => {
      const right = i === correctPad;
      p.topM.color.set(right ? GOOD : BAD);
      p.topM.emissive.set(right ? GOOD : BAD);
      p.topM.emissiveIntensity = right ? 0.45 : 0.15;
      p.sinkGoal = right ? 0.08 : -0.12;
      p.label.className = 'pad-label is-on ' + (right ? 'is-right' : 'is-wrong');
    });
    results.forEach(r => mood(r.id, r.correct ? 'cheer' : 'sad'));
  }

  function pop(id, text, good) {
    const f = figs.get(id); if (!f) return;
    const el = document.createElement('div');
    el.className = 'fig-pop ' + (good ? 'is-good' : 'is-bad');
    el.textContent = text;
    labels.appendChild(el);
    f.pops.push({ el, t0: now() });
  }

  function climb(steps) {
    const list = [...figs.values()].sort((a, b) => a.order - b.order);
    return Promise.all(list.map((f, i) => { const [x, y, z] = stairPos(steps[f.id] || 0, i); return walkTo(f, x, y, z, 0.9); }));
  }

  /* ---------- Animation ---------- */
  const v = new T.Vector3();
  function project(x, y, z) { v.set(x, y, z).project(camera); return [(v.x * 0.5 + 0.5) * W, (-v.y * 0.5 + 0.5) * H]; }

  function updateFig(f, t, dt) {
    let hop = 0, spin = 0;
    if (f.walk) {
      const w = f.walk, k = (t - w.t0) / w.dur;
      if (k >= 1) { f.pos.copy(w.to); f.walk = null; w.resolve(); }
      else {
        const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
        f.pos.lerpVectors(w.from, w.to, e);
        hop = Math.abs(Math.sin(k * Math.PI * w.hops)) * 0.32;
        const dx = w.to.x - w.from.x, dz = w.to.z - w.from.z;
        if (Math.abs(dx) + Math.abs(dz) > 0.05) f.faceGoal = Math.atan2(dx, dz);
      }
    } else f.faceGoal = 0;

    const jk = (t - f.jumpT) / 0.55;
    if (jk >= 0 && jk < 1) { hop += Math.sin(jk * Math.PI) * 0.8; spin = jk * Math.PI * 2; }

    const wob = calm ? 0 : 1;
    let sx = 1, sy = 1 + Math.sin(t * 3 + f.phase) * 0.025 * wob;
    let hl = 0.55, hr = 0.55;
    f.bob.rotation.z = 0;
    if (f.mood === 'cheer') { hop += Math.abs(Math.sin((t + f.phase) * 7)) * 0.42 * wob; hl = hr = 1.1 + Math.sin(t * 14) * 0.06; }
    else if (f.mood === 'sad') { sy = 0.86; sx = 1.08; hl = hr = 0.38; f.bob.rotation.z = 0.12; }
    else if (f.mood === 'wave') { hr = 0.95 + Math.sin(t * 10 + f.phase) * 0.14 * wob; }
    else if (f.mood === 'think') { f.bob.rotation.z = Math.sin(t * 2 + f.phase) * 0.07 * wob; }
    if (hop > 0) sy += hop * 0.12;
    f.bob.scale.set(sx, sy, sx);
    f.hands[0].position.y = hl; f.hands[1].position.y = hr;
    f.mouth.rotation.z = f.mood === 'sad' ? 0 : Math.PI;
    f.mouth.position.y = f.mood === 'sad' ? 0.74 : 0.8;

    if (t > f.blinkAt) { f.eyes.scale.y = 0.1; if (t > f.blinkAt + 0.12) { f.eyes.scale.y = 1; f.blinkAt = t + 2 + Math.random() * 3; } }

    const diff = Math.atan2(Math.sin(f.faceGoal - f.face), Math.cos(f.faceGoal - f.face));
    f.face += diff * Math.min(1, dt * 10);
    f.g.position.set(f.pos.x, f.pos.y + hop, f.pos.z);
    f.g.rotation.y = f.face + spin;

    const [lx, ly] = project(f.g.position.x, f.g.position.y + 1.95, f.g.position.z);
    f.label.style.transform = `translate(${lx.toFixed(1)}px, ${ly.toFixed(1)}px) translate(-50%, -100%)`;
    f.pops = f.pops.filter(p => {
      const age = t - p.t0;
      if (age > 2.2) { p.el.remove(); return false; }
      p.el.style.transform = `translate(${lx.toFixed(1)}px, ${Math.max(34, ly - 34 - age * 26).toFixed(1)}px) translate(-50%, -100%)`;
      p.el.style.opacity = String(Math.min(1, 3 - age * 1.3));
      return true;
    });
  }

  let last = now();
  function tick() {
    requestAnimationFrame(tick);
    if (!canvas.isConnected) return;
    const t = now(), dt = Math.min(0.05, t - last);
    last = t;
    const k = 1 - Math.pow(0.03, dt);
    camPos.lerp(camPosGoal, k); camLook.lerp(camLookGoal, k);
    camera.position.copy(camPos);
    if (!calm) camera.position.x += Math.sin(t * 0.23) * 0.3;
    camera.lookAt(camLook);
    pads.forEach(p => {
      p.sink += (p.sinkGoal - p.sink) * Math.min(1, dt * 6);
      p.g.position.y = p.sink;
      if (padGroup.visible && p.label.textContent) {
        const [x, y] = project(p.x, PAD_TOP + p.sink, PAD_Z + 1.45);
        p.label.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, 0)`;
        p.label.hidden = false;
      } else p.label.hidden = true;
    });
    figs.forEach(f => updateFig(f, t, dt));
    renderer.render(scene, camera);
  }
  requestAnimationFrame(tick);

  return { ok: true, mount, setPlayers, layout, setLabel, setAnswers, lock, walkToPads, reveal, pop, climb, mood };
})();
