import { sb } from './sb.js';
import { state } from './state.js';

// Envia um arquivo para o Storage e devolve a URL pública.
export async function uploadFile(blob, ext) {
  const path = `${state.me.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await sb.storage.from('media').upload(path, blob, {
    contentType: blob.type || undefined,
    cacheControl: '31536000',
    upsert: false,
  });
  if (error) throw error;
  return sb.storage.from('media').getPublicUrl(path).data.publicUrl;
}

export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Não deu pra abrir a imagem.'));
    img.src = src;
  });
}

// Reduz a foto para mandar mais rápido.
export async function compressImage(file, max = 1600, quality = 0.82) {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.round(img.naturalWidth * scale), h = Math.round(img.naturalHeight * scale);
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    c.getContext('2d').drawImage(img, 0, 0, w, h);
    const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', quality));
    return { blob: blob || file, w, h };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function imageToDataUrl(file, max = 1280, quality = 0.78) {
  const { blob } = await compressImage(file, max, quality);
  return new Promise((resolve) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.readAsDataURL(blob); });
}

export function extOf(file, fallback = 'bin') {
  const fromName = (file.name || '').split('.').pop();
  if (fromName && fromName.length <= 5 && fromName !== file.name) return fromName.toLowerCase();
  const t = file.type || '';
  if (t.includes('webm')) return 'webm';
  if (t.includes('mp4')) return 'mp4';
  if (t.includes('ogg')) return 'ogg';
  if (t.includes('mpeg')) return 'mp3';
  if (t.includes('png')) return 'png';
  if (t.includes('gif')) return 'gif';
  if (t.includes('webp')) return 'webp';
  if (t.includes('jpeg')) return 'jpg';
  return fallback;
}

export const isVideoUrl = (u) => /\.(webm|mp4|mov|m4v)(\?|$)/i.test(u || '');

// ---------- gravação de áudio ----------
// Devolve controles da gravação + leitura do volume ao vivo (pra desenhar a ondinha).
export async function startRecording() {
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
    throw new Error('Este aparelho não permite gravar áudio aqui.');
  }
  state.suppressLock = true;
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  } finally {
    setTimeout(() => { state.suppressLock = false; }, 1500);
  }
  const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
  const mime = types.find((t) => MediaRecorder.isTypeSupported?.(t)) || '';
  const rec = new MediaRecorder(stream, mime ? { mimeType: mime, audioBitsPerSecond: 48000 } : undefined);
  const chunks = [];
  rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };

  // volume ao vivo
  let ctx = null, analyser = null, buf = null;
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    const src = ctx.createMediaStreamSource(stream);
    analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    buf = new Uint8Array(analyser.fftSize);
    src.connect(analyser);
  } catch { /* sem ondinha, tudo bem */ }
  const peaks = [];
  const level = () => {
    if (!analyser) return 0.3;
    analyser.getByteTimeDomainData(buf);
    let sum = 0;
    for (let i = 0; i < buf.length; i++) { const v = (buf[i] - 128) / 128; sum += v * v; }
    return Math.min(1, Math.sqrt(sum / buf.length) * 3.2);
  };
  const sampler = setInterval(() => peaks.push(level()), 70);

  rec.start(250);
  const t0 = Date.now();
  const cleanup = () => {
    clearInterval(sampler);
    stream.getTracks().forEach((t) => t.stop());
    try { ctx?.close(); } catch { /* ok */ }
  };
  return {
    startedAt: t0,
    level,
    stop: () => new Promise((resolve) => {
      rec.onstop = () => {
        cleanup();
        const type = rec.mimeType || mime || 'audio/webm';
        resolve({
          blob: new Blob(chunks, { type }),
          duration: (Date.now() - t0) / 1000,
          ext: type.includes('mp4') ? 'm4a' : type.includes('ogg') ? 'ogg' : 'webm',
          wave: downsample(peaks, 44),
        });
      };
      rec.stop();
    }),
    cancel: () => { rec.onstop = cleanup; try { rec.stop(); } catch { cleanup(); } },
  };
}

function downsample(arr, n) {
  if (!arr.length) return [];
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = Math.floor((i * arr.length) / n), b = Math.max(a + 1, Math.floor(((i + 1) * arr.length) / n));
    let m = 0;
    for (let j = a; j < b && j < arr.length; j++) m = Math.max(m, arr[j]);
    out.push(Math.round(Math.max(0.08, m) * 100) / 100);
  }
  return out;
}

// Baixa ou compartilha um arquivo
export async function shareOrDownload(url, filename) {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    const file = new File([blob], filename, { type: blob.type });
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: 'Conselho' });
      return;
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.append(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
  } catch (e) {
    if (e?.name !== 'AbortError') window.open(url, '_blank');
  }
}
