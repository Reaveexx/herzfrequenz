'use strict';
/*
  Antwortfeld mit Sabotage-Effekten. Wird am großen Bildschirm (eine Spalte
  pro Person) und auf dem Handy benutzt.

  createPad({
    root,      // Element, das die Effekt-Klassen bekommt (Spalte oder Handy-Ansicht)
    zone,      // leeres Element, in das die Antworten gezeichnet werden
    answers,   // ["Text A", "Text B", ...]
    order,     // Reihenfolge der Antwort-Indizes, z. B. [2, 0, 3, 1]
    keys,      // optional: Tastenbeschriftungen pro Platz
    fx,        // Liste der Sabotagen, z. B. ["frost", "nebel"]
    limit,     // Gesamtzeit in ms (für Nebel und Kleckse)
    onAnswer   // wird mit dem gewählten Antwort-Index aufgerufen
  })
*/
function createPad({ root, zone, answers, order, keys = null, fx = [], limit = 15000, onAnswer }) {
  const st = { order: order.slice(), frost: fx.includes('frost') ? 5 : 0, done: false, choice: null };

  zone.innerHTML = `
    <div class="answers"></div>
    <div class="blobs"></div>
    ${st.frost ? `<button class="frost" aria-label="Eis freikratzen">${icon('frost', 'frost-ic')}<span>Freikratzen <b>${st.frost}×</b></span></button>` : ''}
    <div class="stamp" hidden></div>`;
  const answersEl = $('.answers', zone);
  const stamp = $('.stamp', zone);

  function render() {
    answersEl.innerHTML = st.order.map((a, slot) => `
      <button class="ans" data-slot="${slot}">
        ${keys ? `<kbd>${esc(keys[slot])}</kbd>` : ''}<span class="atext">${esc(answers[a])}</span>
      </button>`).join('');
    $$('.ans', answersEl).forEach(b => b.addEventListener('click', () => press(+b.dataset.slot)));
  }
  render();

  if (fx.includes('spiegel')) root.classList.add('fx-spiegel');
  if (fx.includes('nebel')) root.classList.add('fx-nebel');
  if (fx.includes('klecks')) {
    const layer = $('.blobs', zone);
    for (let b = 0; b < 6; b++) {
      const el = document.createElement('button');
      el.className = 'blob';
      el.setAttribute('aria-label', 'Klecks wegwischen');
      el.style.cssText = `left:${5 + Math.random() * 70}%;top:${Math.random() * 78}%;--s:${48 + Math.random() * 46}px;--r:${Math.random() * 360}deg`;
      el.addEventListener('click', e => { e.stopPropagation(); el.classList.add('gone'); Sound.crack(); });
      layer.appendChild(el);
    }
  }
  const frostEl = $('.frost', zone);
  if (frostEl) frostEl.addEventListener('click', () => press(0));

  const spinner = fx.includes('kreisel') ? setInterval(() => {
    if (st.done || st.frost) return;
    st.order = shuffle(st.order);
    render();
    answersEl.animate([{ transform: 'scale(.96)', opacity: .4 }, { transform: 'none', opacity: 1 }], { duration: 220 });
  }, 1600) : null;

  function press(slot) {
    if (st.done) return;
    if (st.frost > 0) {
      st.frost--;
      Sound.crack();
      if (navigator.vibrate) navigator.vibrate(15);
      if (st.frost === 0) { frostEl.classList.add('broken'); setTimeout(() => frostEl.remove(), 300); }
      else { $('b', frostEl).textContent = `${st.frost}×`; frostEl.animate([{ transform: 'translateX(-4px)' }, { transform: 'translateX(4px)' }, { transform: 'none' }], { duration: 140 }); }
      return;
    }
    st.done = true;
    st.choice = st.order[slot];
    root.classList.add('locked');
    const btn = $$('.ans', answersEl)[slot];
    if (btn) btn.classList.add('picked');
    onAnswer(st.choice);
  }

  function tick(elapsed) {
    if (fx.includes('nebel')) root.style.setProperty('--fog', `${(10 * Math.max(0, 1 - elapsed / (limit * 0.8))).toFixed(2)}px`);
    if (fx.includes('klecks') && elapsed > limit * 0.7) root.classList.add('blobs-fading');
  }

  function lock(text) {
    st.done = true;
    root.classList.add('locked');
    stamp.textContent = text;
    stamp.hidden = false;
  }

  function destroy() { if (spinner) clearInterval(spinner); }

  function reveal(correct, choice = st.choice) {
    destroy();
    root.classList.remove('fx-spiegel', 'fx-nebel', 'blobs-fading');
    root.style.setProperty('--fog', '0px');
    root.classList.add('revealed');
    $('.blobs', zone).innerHTML = '';
    const fr = $('.frost', zone); if (fr) fr.remove();
    stamp.hidden = true;
    $$('.ans', answersEl).forEach((b, slot) => {
      const a = st.order[slot];
      if (a === correct) b.classList.add('right');
      else if (a === choice) b.classList.add('wrong');
    });
  }

  return { press, tick, lock, reveal, destroy, get done() { return st.done; } };
}
