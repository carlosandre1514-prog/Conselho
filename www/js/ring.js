// Toques de chamada gerados na hora (sem arquivo de áudio).
// 'out' = chamando (tom de espera, como no telefone); 'in' = recebendo (toque com melodia + vibração).
let ctx = null;
let timer = null;
let current = null;

function audio() {
  ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

// libera o áudio no primeiro toque na tela (regra dos navegadores)
export function unlockAudio() {
  const go = () => { try { audio(); } catch { /* ok */ } };
  window.addEventListener('pointerdown', go, { passive: true });
  window.addEventListener('keydown', go);
}

function tone(freq, start, dur, vol = 0.18, type = 'sine') {
  const c = audio();
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.value = freq;
  const t0 = c.currentTime + start;
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(vol, t0 + 0.02);
  g.gain.setValueAtTime(vol, t0 + dur - 0.05);
  g.gain.linearRampToValueAtTime(0, t0 + dur);
  o.connect(g).connect(c.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.05);
}

function ringOut() {
  // tom de chamada brasileiro: 425 Hz, 1 s tocando, 4 s de silêncio
  tone(425, 0, 1.0, 0.12);
}

function ringIn() {
  // pequena melodia dourada, repetida
  const notes = [659.25, 830.61, 987.77, 1318.51];
  notes.forEach((f, i) => tone(f, i * 0.13, 0.32, 0.16, 'triangle'));
  notes.slice(0, 3).forEach((f, i) => tone(f, 0.75 + i * 0.13, 0.3, 0.13, 'triangle'));
  try { navigator.vibrate?.([400, 200, 400]); } catch { /* ok */ }
}

export function startRing(kind) {
  if (current === kind) return;
  stopRing();
  current = kind;
  try {
    const fn = kind === 'in' ? ringIn : ringOut;
    fn();
    timer = setInterval(fn, kind === 'in' ? 2400 : 5000);
  } catch { current = null; }
}

export function stopRing(kind) {
  if (kind && current !== kind) return;
  clearInterval(timer);
  timer = null;
  current = null;
  try { navigator.vibrate?.(0); } catch { /* ok */ }
}

export const ringing = () => current;
