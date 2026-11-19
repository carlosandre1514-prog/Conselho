import { sb } from '../sb.js';
import { state } from '../state.js';
import { h, icon, iconBtn, toast, sheet, pickFile, errMsg } from '../ui.js';
import { uploadFile, loadImage, shareOrDownload } from '../media.js';
import { go, back } from '../nav.js';

const S = 512; // tamanho da figurinha
const COLORS = ['#FFFFFF', '#000000', '#D9AE55', '#E0675A', '#5BBF86', '#6FA8DC', '#E58BB8', '#FFD54F'];

export default async function Editor(root) {
  let file = state.pendingSticker;
  state.pendingSticker = null;

  const pickAgain = async (accept) => {
    const f = await pickFile(accept);
    if (f) { state.pendingSticker = f; Editor(root).then((r) => { current = r; }); }
  };
  let current = null;

  if (!file) {
    root.replaceChildren(
      h('header', { class: 'topbar' }, iconBtn('x', 'Fechar', () => back('#figurinhas')), h('h1', { class: 'grow' }, 'Nova figurinha')),
      h('div', { class: 'pad' }, h('div', { class: 'empty' }, 'Escolha de onde vem a figurinha.'),
        h('button', { class: 'btn primary block', onClick: () => pickAgain('image/*') }, icon('image', 18), 'Foto da galeria'),
        h('button', { class: 'btn ghost block', onClick: () => pickAgain('video/*,image/gif') }, icon('film', 18), 'Vídeo ou GIF')));
    return { destroy: () => current?.destroy?.() };
  }

  const isGif = file.type === 'image/gif';
  const isVideo = file.type.startsWith('video/');
  const srcUrl = URL.createObjectURL(file);
  let raf = 0;
  let destroyed = false;

  // ---------- GIF: salva do jeito que está ----------
  if (isGif) {
    const saveBtn = h('button', { class: 'btn primary block' }, icon('check', 18, 2.4), 'Salvar no pacote');
    saveBtn.addEventListener('click', () => askPackAndSave(async () => ({ blob: file, ext: 'gif' })));
    root.replaceChildren(
      h('header', { class: 'topbar' }, iconBtn('x', 'Fechar', () => back('#figurinhas')), h('h1', { class: 'grow' }, 'Figurinha de GIF')),
      h('div', { class: 'scroll' }, h('div', { class: 'pad' },
        h('div', { class: 'editor-stage' }, h('img', { src: srcUrl, alt: 'Prévia', style: { maxWidth: '320px', maxHeight: '320px' } })),
        h('p', { class: 'small muted', style: { margin: 0 } }, 'GIF animado é salvo do jeito que está. Pra cortar ou escrever, use um vídeo.'),
        saveBtn)));
    return { destroy: () => URL.revokeObjectURL(srcUrl) };
  }

  // ---------- fonte (foto ou vídeo) ----------
  let source;
  try {
    if (isVideo) {
      source = h('video', { src: srcUrl, muted: true, playsinline: true, preload: 'auto', loop: false });
      source.setAttribute('playsinline', '');
      source.muted = true;
      await new Promise((res, rej) => { source.onloadeddata = res; source.onerror = () => rej(new Error('Não deu pra abrir esse vídeo.')); });
    } else {
      source = await loadImage(srcUrl);
    }
  } catch (e) {
    toast(errMsg(e));
    back('#figurinhas');
    return { destroy() {} };
  }
  const srcW = () => (isVideo ? source.videoWidth : source.naturalWidth);
  const srcH = () => (isVideo ? source.videoHeight : source.naturalHeight);

  // ---------- estado do editor ----------
  const ed = {
    tool: isVideo ? 'cut' : 'cut',
    zoom: 1, ox: 0, oy: 0,
    shape: 'round-rect', border: true,
    keyed: null, keyColor: null, tol: 40,
    text: '', textColor: '#FFFFFF', textSize: 64, tx: 0.5, ty: 0.82,
    penColor: '#D9AE55', penSize: 10,
    speed: 1, start: 0, len: Math.min(4, Math.max(1, (source.duration || 4) - 0.1)),
  };
  let dirty = true;

  const canvas = h('canvas', { width: S, height: S, 'aria-label': 'Prévia da figurinha' });
  const ctx = canvas.getContext('2d');
  const drawLayer = document.createElement('canvas');
  drawLayer.width = S; drawLayer.height = S;
  const dctx = drawLayer.getContext('2d');

  const baseScale = () => Math.max(S / srcW(), S / srcH());
  const geom = () => {
    const sc = baseScale() * ed.zoom;
    const dw = srcW() * sc, dh = srcH() * sc;
    return { sc, x: S / 2 - dw / 2 + ed.ox, y: S / 2 - dh / 2 + ed.oy, dw, dh };
  };

  function shapePath(c) {
    c.beginPath();
    const m = ed.border ? 14 : 4;
    if (ed.shape === 'circle') c.arc(S / 2, S / 2, S / 2 - m, 0, Math.PI * 2);
    else if (ed.shape === 'round-rect') roundRect(c, m, m, S - 2 * m, S - 2 * m, 90);
    else c.rect(0, 0, S, S);
  }
  function roundRect(c, x, y, w, hh, r) {
    c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + hh, r); c.arcTo(x + w, y + hh, x, y + hh, r);
    c.arcTo(x, y + hh, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
  }

  function render() {
    ctx.clearRect(0, 0, S, S);
    const g = geom();
    ctx.save();
    if (ed.shape !== 'none') { shapePath(ctx); ctx.clip(); }
    ctx.drawImage(ed.keyed || source, g.x, g.y, g.dw, g.dh);
    ctx.restore();
    if (ed.border && ed.shape !== 'none') {
      shapePath(ctx);
      ctx.lineWidth = 16; ctx.strokeStyle = '#FFFFFF'; ctx.stroke();
    }
    ctx.drawImage(drawLayer, 0, 0);
    if (ed.text.trim()) {
      const lines = ed.text.split('\n');
      ctx.font = `800 ${ed.textSize}px Manrope, sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';
      ctx.lineWidth = Math.max(4, ed.textSize / 5);
      ctx.strokeStyle = ed.textColor === '#000000' ? '#FFFFFF' : '#000000';
      const lh = ed.textSize * 1.05;
      const y0 = ed.ty * S - ((lines.length - 1) * lh) / 2;
      lines.forEach((ln, i) => {
        ctx.strokeText(ln, ed.tx * S, y0 + i * lh, S - 24);
        ctx.fillStyle = ed.textColor;
        ctx.fillText(ln, ed.tx * S, y0 + i * lh, S - 24);
      });
    }
  }

  function loop() {
    if (destroyed) return;
    if (isVideo && !recording) {
      if (source.paused) source.play().catch(() => {});
      if (source.currentTime < ed.start || source.currentTime > ed.start + ed.len) source.currentTime = ed.start;
      source.playbackRate = ed.speed;
      dirty = true;
    }
    if (dirty || isVideo) { render(); dirty = false; }
    raf = requestAnimationFrame(loop);
  }

  // ---------- remover fundo (foto) ----------
  function removeBg(color) {
    const max = 1024;
    const k = Math.min(1, max / Math.max(srcW(), srcH()));
    const c = document.createElement('canvas');
    c.width = Math.round(srcW() * k); c.height = Math.round(srcH() * k);
    const cc = c.getContext('2d', { willReadFrequently: true });
    cc.drawImage(source, 0, 0, c.width, c.height);
    const img = cc.getImageData(0, 0, c.width, c.height);
    const d = img.data;
    const t = ed.tol * 4.4; // 0..~440
    for (let i = 0; i < d.length; i += 4) {
      const dist = Math.hypot(d[i] - color[0], d[i + 1] - color[1], d[i + 2] - color[2]);
      if (dist < t) d[i + 3] = 0;
      else if (dist < t * 1.25) d[i + 3] = Math.round(d[i + 3] * ((dist - t) / (t * 0.25)));
    }
    cc.putImageData(img, 0, 0);
    ed.keyed = c;
    dirty = true;
  }
  function pickColorAt(px, py) {
    const g = geom();
    const sx = (px - g.x) / g.sc, sy = (py - g.y) / g.sc;
    if (sx < 0 || sy < 0 || sx >= srcW() || sy >= srcH()) return null;
    const c = document.createElement('canvas'); c.width = 1; c.height = 1;
    const cc = c.getContext('2d', { willReadFrequently: true });
    cc.drawImage(source, sx, sy, 1, 1, 0, 0, 1, 1);
    const [r, g2, b] = cc.getImageData(0, 0, 1, 1).data;
    return [r, g2, b];
  }

  // ---------- toques no canvas ----------
  const pt = (e) => { const r = canvas.getBoundingClientRect(); return [((e.clientX - r.left) / r.width) * S, ((e.clientY - r.top) / r.height) * S]; };
  let drag = null;
  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    const [x, y] = pt(e);
    if (ed.tool === 'bg' && !isVideo) {
      const col = pickColorAt(x, y);
      if (col) { ed.keyColor = col; removeBg(col); }
      return;
    }
    drag = { x, y, ox: ed.ox, oy: ed.oy, tx: ed.tx, ty: ed.ty };
    if (ed.tool === 'pen') {
      dctx.lineCap = 'round'; dctx.lineJoin = 'round';
      dctx.strokeStyle = ed.penColor; dctx.lineWidth = ed.penSize;
      dctx.beginPath(); dctx.moveTo(x, y); dctx.lineTo(x + 0.1, y + 0.1); dctx.stroke();
      dirty = true;
    }
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const [x, y] = pt(e);
    if (ed.tool === 'cut' || ed.tool === 'speed') { ed.ox = drag.ox + (x - drag.x); ed.oy = drag.oy + (y - drag.y); }
    else if (ed.tool === 'text') { ed.tx = Math.min(0.95, Math.max(0.05, drag.tx + (x - drag.x) / S)); ed.ty = Math.min(0.95, Math.max(0.05, drag.ty + (y - drag.y) / S)); }
    else if (ed.tool === 'pen') { dctx.lineTo(x, y); dctx.stroke(); }
    dirty = true;
  });
  const end = () => { drag = null; };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);

  // ---------- painéis de ferramentas ----------
  const panel = h('div', { class: 'card tool-panel' });
  const toolsBar = h('div', { class: 'tools', role: 'toolbar', 'aria-label': 'Ferramentas' });
  const TOOLS = [
    ['cut', 'Recortar', 'scissors'],
    ...(isVideo ? [] : [['bg', 'Tirar fundo', 'wand']]),
    ['text', 'Texto', 'type'],
    ['pen', 'Desenhar', 'pen'],
    ...(isVideo ? [['speed', 'Trecho', 'gauge']] : []),
  ];
  const range = (label, min, max, step, val, fn, fmt = (v) => v) => {
    const out = h('span', { style: { minWidth: '44px', textAlign: 'right', color: 'var(--gold)' } }, fmt(val));
    const r = h('input', { type: 'range', min, max, step, value: String(val), 'aria-label': label });
    r.addEventListener('input', () => { out.textContent = fmt(Number(r.value)); fn(Number(r.value)); dirty = true; });
    return h('label', { class: 'range-row' }, h('span', null, label), r, out);
  };
  const swatches = (cur, fn) => {
    const box = h('div', { class: 'swatches' });
    const draw = (sel) => box.replaceChildren(...COLORS.map((c) => h('button', {
      type: 'button', class: `swatch ${c === sel ? 'on' : ''}`, style: { background: c }, 'aria-label': `Cor ${c}`,
      onClick: () => { fn(c); dirty = true; draw(c); },
    })));
    draw(cur);
    return box;
  };
  const chips = (opts, cur, fn) => {
    const box = h('div', { class: 'chips' });
    const draw = (sel) => box.replaceChildren(...opts.map(([v, t]) => h('button', { type: 'button', class: `chip ${v === sel ? 'on' : ''}`, onClick: () => { fn(v); dirty = true; draw(v); } }, t)));
    draw(cur);
    return box;
  };

  function drawPanel() {
    toolsBar.replaceChildren(...TOOLS.map(([id, label, ic]) => h('button', {
      type: 'button', class: `tool ${ed.tool === id ? 'on' : ''}`, 'aria-pressed': String(ed.tool === id),
      onClick: () => { ed.tool = id; drawPanel(); },
    }, h('span', { class: 'tb' }, icon(ic, 22)), label)));
    let content;
    if (ed.tool === 'cut') {
      content = [
        h('span', { class: 'small muted' }, 'Arraste a imagem pra posicionar.'),
        range('Zoom', 1, 4, 0.01, ed.zoom, (v) => { ed.zoom = v; }, (v) => v.toFixed(1) + 'x'),
        chips([['round-rect', 'Arredondada'], ['circle', 'Redonda'], ['none', 'Inteira']], ed.shape, (v) => { ed.shape = v; }),
        h('label', { class: 'row between' }, h('span', { class: 'label' }, 'Borda branca'),
          (() => { const b = h('button', { type: 'button', class: 'switch-t', role: 'switch', 'aria-checked': String(ed.border), 'aria-label': 'Borda branca' }, h('span'));
            b.addEventListener('click', () => { ed.border = !ed.border; b.setAttribute('aria-checked', String(ed.border)); dirty = true; }); return b; })()),
      ];
    } else if (ed.tool === 'bg') {
      content = [
        h('span', { class: 'small muted', style: { lineHeight: 1.5 } }, 'Toque na cor do fundo pra apagar. Funciona melhor com fundo liso (parede, céu, tela verde).'),
        range('Força', 5, 100, 1, ed.tol, (v) => { ed.tol = v; if (ed.keyColor) removeBg(ed.keyColor); }),
        h('button', { class: 'btn sm ghost', onClick: () => { ed.keyed = null; ed.keyColor = null; dirty = true; } }, icon('refresh', 16), 'Desfazer fundo'),
      ];
    } else if (ed.tool === 'text') {
      const ta = h('textarea', { class: 'input', rows: 2, placeholder: 'Escreva aqui…', maxlength: '60', value: ed.text });
      ta.addEventListener('input', () => { ed.text = ta.value; dirty = true; });
      content = [ta, h('span', { class: 'small muted' }, 'Arraste o texto na figurinha pra mudar de lugar.'),
        swatches(ed.textColor, (c) => { ed.textColor = c; }),
        range('Tamanho', 24, 120, 1, ed.textSize, (v) => { ed.textSize = v; })];
    } else if (ed.tool === 'pen') {
      content = [swatches(ed.penColor, (c) => { ed.penColor = c; }),
        range('Espessura', 3, 40, 1, ed.penSize, (v) => { ed.penSize = v; }),
        h('button', { class: 'btn sm ghost', onClick: () => { dctx.clearRect(0, 0, S, S); dirty = true; } }, icon('trash', 16), 'Limpar desenho')];
    } else {
      const dur = source.duration || 4;
      content = [
        range('Começa em', 0, Math.max(0, dur - 0.5), 0.1, ed.start, (v) => { ed.start = v; source.currentTime = v; }, (v) => v.toFixed(1) + 's'),
        range('Duração', 0.5, Math.min(6, dur), 0.1, ed.len, (v) => { ed.len = v; }, (v) => v.toFixed(1) + 's'),
        chips([[0.5, '0,5x'], [1, '1x'], [1.5, '1,5x'], [2, '2x']], ed.speed, (v) => { ed.speed = v; }),
        h('span', { class: 'small muted' }, 'Figurinha animada: até 6 segundos, sem som.'),
      ];
    }
    panel.replaceChildren(...content);
  }

  // ---------- gerar arquivo ----------
  let recording = false;
  async function makeStatic() {
    render();
    let blob = await new Promise((r) => canvas.toBlob(r, 'image/webp', 0.9));
    if (!blob || blob.type !== 'image/webp') blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
    return { blob, ext: blob.type === 'image/webp' ? 'webp' : 'png' };
  }
  async function makeAnimated() {
    if (!canvas.captureStream || typeof MediaRecorder === 'undefined') throw new Error('Este aparelho não grava figurinha animada.');
    const types = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'];
    const mime = types.find((t) => MediaRecorder.isTypeSupported(t)) || '';
    recording = true;
    source.pause();
    source.currentTime = ed.start;
    await new Promise((r) => { source.onseeked = r; setTimeout(r, 800); });
    const stream = canvas.captureStream(30);
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 1_200_000 } : undefined);
    const chunks = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    const done = new Promise((r) => { rec.onstop = r; });
    source.playbackRate = ed.speed;
    rec.start(100);
    await source.play().catch(() => {});
    const wall = (ed.len / ed.speed) * 1000;
    const t0 = performance.now();
    await new Promise((resolve) => {
      const tick = () => {
        render();
        if (performance.now() - t0 >= wall) resolve(); else requestAnimationFrame(tick);
      };
      tick();
    });
    rec.stop();
    await done;
    stream.getTracks().forEach((t) => t.stop());
    recording = false;
    const type = rec.mimeType || mime || 'video/webm';
    return { blob: new Blob(chunks, { type }), ext: type.includes('mp4') ? 'mp4' : 'webm' };
  }
  const make = () => (isVideo ? makeAnimated() : makeStatic());

  function askPackAndSave(maker) {
    const last = localStorage.getItem('conselho-pack') || 'Do grupo';
    const input = h('input', { class: 'input', value: last, maxlength: '40', list: 'packs-list', 'aria-label': 'Nome do pacote' });
    const dl = h('datalist', { id: 'packs-list' });
    sb.from('stickers').select('pack').limit(300).then(({ data }) => {
      [...new Set((data || []).map((x) => x.pack))].forEach((p) => dl.append(h('option', { value: p })));
    });
    const btn = h('button', { class: 'btn primary block' }, 'Salvar');
    const close = sheet(h('h3', null, 'Salvar no pacote'), h('label', { class: 'field' }, h('span', { class: 'label' }, 'Pacote'), input, dl), btn);
    btn.addEventListener('click', async () => {
      const pack = input.value.trim() || 'Do grupo';
      btn.disabled = true;
      btn.replaceChildren(h('span', { class: 'spinner', style: { borderTopColor: '#1A1306' } }), isVideo ? 'Gravando…' : 'Salvando…');
      try {
        const { blob, ext } = await maker();
        const url = await uploadFile(blob, ext);
        const { error } = await sb.from('stickers').insert({ url, pack });
        if (error) throw error;
        localStorage.setItem('conselho-pack', pack);
        close();
        toast('Figurinha salva!');
        go('#figurinhas');
      } catch (e) {
        btn.disabled = false; btn.textContent = 'Salvar';
        toast(errMsg(e));
      }
    });
  }

  const exportBtn = h('button', { class: 'btn ghost', style: { flex: 1 } }, icon('download', 18), isVideo ? 'Exportar' : 'Exportar .webp');
  exportBtn.addEventListener('click', async () => {
    exportBtn.disabled = true;
    try {
      const { blob, ext } = await make();
      const url = URL.createObjectURL(blob);
      await shareOrDownload(url, `figurinha.${ext}`);
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (e) { toast(errMsg(e)); } finally { exportBtn.disabled = false; }
  });
  const saveBtn = h('button', { class: 'btn primary', style: { flex: 1 }, onClick: () => askPackAndSave(make) }, icon('check', 18, 2.4), 'Salvar no pacote');

  root.replaceChildren(
    h('header', { class: 'topbar' }, iconBtn('x', 'Fechar', () => back('#figurinhas')), h('h1', { class: 'grow' }, isVideo ? 'Figurinha animada' : 'Nova figurinha'),
      h('button', { class: 'btn sm primary', onClick: () => askPackAndSave(make) }, 'Salvar')),
    h('div', { class: 'scroll' }, h('div', { class: 'pad' }, h('div', { class: 'editor-stage' }, canvas), toolsBar, panel)),
    h('div', { class: 'row', style: { padding: '10px 20px calc(16px + var(--safe-bottom))' } }, exportBtn, saveBtn));
  drawPanel();
  if (document.fonts?.load) document.fonts.load('800 40px Manrope').then(() => { dirty = true; });
  loop();

  return {
    destroy() {
      destroyed = true;
      cancelAnimationFrame(raf);
      if (isVideo) { source.pause(); source.removeAttribute('src'); source.load(); }
      URL.revokeObjectURL(srcUrl);
    },
  };
}
