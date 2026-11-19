import { state } from './state.js';

// ---------- criação de elementos ----------
export function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'value' || k === 'checked' || k === 'disabled' || k === 'muted' || k === 'srcObject') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

// ---------- ícones (traço, 24x24) ----------
const P = {
  assembly: '<circle cx="17.46" cy="18.51" r="1.7" fill="currentColor" stroke="none"/><circle cx="11.51" cy="20.49" r="1.7" fill="currentColor" stroke="none"/><circle cx="5.82" cy="17.83" r="1.7" fill="currentColor" stroke="none"/><circle cx="3.50" cy="12.00" r="1.7" fill="currentColor" stroke="none"/><circle cx="5.82" cy="6.17" r="1.7" fill="currentColor" stroke="none"/><circle cx="11.51" cy="3.51" r="1.7" fill="currentColor" stroke="none"/><circle cx="17.46" cy="5.49" r="1.7" fill="currentColor" stroke="none"/><circle cx="13.50" cy="16.13" r="1.4" fill="currentColor" stroke="none"/><circle cx="8.47" cy="14.63" r="1.4" fill="currentColor" stroke="none"/><circle cx="8.47" cy="9.37" r="1.4" fill="currentColor" stroke="none"/><circle cx="13.50" cy="7.87" r="1.4" fill="currentColor" stroke="none"/>',
  reply: '<path d="M9 17l-5-5 5-5"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/>',
  arrowDown: '<path d="M12 5v14M19 12l-7 7-7-7"/>',
  eye: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
  eyeOff: '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19M14.12 14.12a3 3 0 1 1-4.24-4.24M1 1l22 22"/>',
  sticker: '<path d="M15.5 3H5a2 2 0 0 0-2 2v14c0 1.1.9 2 2 2h14a2 2 0 0 0 2-2V8.5L15.5 3z"/><path d="M15 3v6h6"/><path d="M8 13s1.5 2 4 2 4-2 4-2"/>',
  keyboard: '<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/>',
  feather: '<path d="M20.24 12.24a6 6 0 0 0-8.49-8.49L5 10.5V19h8.5z"/><path d="M16 8L2 22M17.5 15H9"/>',
  chat: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  landmark: '<path d="M3 22h18M6 18v-7M10 18v-7M14 18v-7M18 18v-7M12 2l9 5H3z"/>',
  smile: '<circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01"/>',
  users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  key: '<path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.78 7.78 5.5 5.5 0 0 1 7.78-7.78zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/>',
  lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>',
  more: '<circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/>',
  clip: '<path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>',
  mic: '<path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v4M8 23h8"/>',
  micOff: '<path d="M1 1l22 22M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23M12 19v4M8 23h8"/>',
  send: '<path d="M22 2L11 13M22 2l-7 20-4-9-9-4z"/>',
  checks: '<path d="M1 12l5 5L17 6M11 15l2 2L23 7"/>',
  check: '<path d="M20 6L9 17l-5-5"/>',
  vote: '<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  x: '<path d="M18 6L6 18M6 6l12 12"/>',
  back: '<path d="M15 18l-6-6 6-6"/>',
  chevR: '<path d="M9 18l6-6-6-6"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>',
  camera: '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>',
  film: '<rect x="2" y="2" width="20" height="20" rx="2.18"/><path d="M7 2v20M17 2v20M2 12h20M2 7h5M2 17h5M17 17h5M17 7h5"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
  share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.59 13.51l6.83 3.98M15.41 6.51l-6.83 3.98"/>',
  copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  crown: '<path d="M2 18h20l-2-11-5 4-3-7-3 7-5-4z"/>',
  phone: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/>',
  phoneOff: '<path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7a2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-3.33-2.67m-2.67-3.34a19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91"/><path d="M23 1L1 23"/>',
  video: '<path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2"/>',
  videoOff: '<path d="M16 16v1a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2m5.66 0H14a2 2 0 0 1 2 2v3.34l1 1L23 7v10M1 1l22 22"/>',
  flip: '<path d="M1 4v6h6M23 20v-6h-6"/><path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"/>',
  minimize: '<path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7"/>',
  play: '<path d="M7 4v16l13-8z" fill="currentColor"/>',
  pause: '<path d="M7 4h3v16H7zM14 4h3v16h-3z" fill="currentColor"/>',
  trash: '<path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/>',
  scissors: '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4L8.12 15.88M14.47 14.48L20 20M8.12 8.12L12 12"/>',
  wand: '<path d="M15 4V2M15 16v-2M8 9h2M20 9h2M17.8 11.8L19 13M17.8 6.2L19 5M3 21l9-9M12.2 6.2L11 5"/>',
  type: '<path d="M4 7V4h16v3M9 20h6M12 4v16"/>',
  pen: '<path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  gauge: '<path d="M12 14l4-4"/><path d="M3.34 19a10 10 0 1 1 17.32 0"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  refresh: '<path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>',
  palette: '<circle cx="13.5" cy="6.5" r="1.5"/><circle cx="17.5" cy="10.5" r="1.5"/><circle cx="8.5" cy="7.5" r="1.5"/><circle cx="6.5" cy="12.5" r="1.5"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.93 0 1.5-.75 1.5-1.5 0-.39-.15-.74-.39-1.01-.23-.26-.38-.61-.38-.99 0-.83.67-1.5 1.5-1.5H16c3.31 0 6-2.69 6-6 0-4.96-4.49-9-10-9z"/>',
};
export function icon(name, size = 22, sw = 1.8) {
  const s = h('span', { class: 'icon', 'aria-hidden': 'true' });
  s.innerHTML = `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">${P[name] || ''}</svg>`;
  return s;
}
export const iconBtn = (name, label, onClick, cls = '') =>
  h('button', { type: 'button', class: `icon-btn ${cls}`, 'aria-label': label, title: label, onClick }, icon(name, 20));

// ---------- marca do Conselho (assembleia em "C") ----------
const LOGO = '<g fill="currentColor"><rect x="1344" y="1418" width="132" height="132" rx="40" transform="rotate(50.0 1410 1484)"/><rect x="1103" y="1540" width="132" height="132" rx="40" transform="rotate(76.0 1169 1606)"/><rect x="833" y="1545" width="132" height="132" rx="40" transform="rotate(102.0 899 1611)"/><rect x="589" y="1431" width="132" height="132" rx="40" transform="rotate(128.0 655 1497)"/><rect x="419" y="1221" width="132" height="132" rx="40" transform="rotate(154.0 485 1287)"/><rect x="358" y="958" width="132" height="132" rx="40" transform="rotate(180.0 424 1024)"/><rect x="419" y="695" width="132" height="132" rx="40" transform="rotate(206.0 485 761)"/><rect x="589" y="485" width="132" height="132" rx="40" transform="rotate(232.0 655 551)"/><rect x="833" y="371" width="132" height="132" rx="40" transform="rotate(258.0 899 437)"/><rect x="1103" y="376" width="132" height="132" rx="40" transform="rotate(284.0 1169 442)"/><rect x="1344" y="498" width="132" height="132" rx="40" transform="rotate(310.0 1410 564)"/><rect x="1213" y="1261" width="116" height="116" rx="35" transform="rotate(50.0 1271 1319)"/><rect x="944" y="1350" width="116" height="116" rx="35" transform="rotate(93.3 1002 1408)"/><rect x="686" y="1230" width="116" height="116" rx="35" transform="rotate(136.7 744 1288)"/><rect x="581" y="966" width="116" height="116" rx="35" transform="rotate(180.0 639 1024)"/><rect x="686" y="702" width="116" height="116" rx="35" transform="rotate(223.3 744 760)"/><rect x="944" y="582" width="116" height="116" rx="35" transform="rotate(266.7 1002 640)"/><rect x="1213" y="671" width="116" height="116" rx="35" transform="rotate(310.0 1271 729)"/></g><circle cx="1239" cy="1024" r="118" fill="#ECEAE4"/>';
export function logo(size = 44) {
  const s = h('span', { class: 'mark', 'aria-hidden': 'true' });
  s.innerHTML = `<svg width="${size}" height="${size}" viewBox="0 0 2048 2048">${LOGO}</svg>`;
  return s;
}

// vibração curtinha (Android); no iPhone simplesmente não faz nada
export function buzz(p = 12) { try { navigator.vibrate?.(p); } catch { /* ok */ } }

// blocos de "carregando"
export function skeleton(lines = 4) {
  return h('div', { style: { display: 'flex', flexDirection: 'column', gap: '14px', padding: '6px 0' }, 'aria-hidden': 'true' },
    Array.from({ length: lines }, (_, i) => h('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } },
      h('div', { class: 'sk', style: { height: '12px', width: '28%' } }),
      h('div', { class: 'sk', style: { height: '18px', width: `${70 + ((i * 17) % 25)}%` } }),
      h('div', { class: 'sk', style: { height: '12px', width: '45%' } }))));
}

// ---------- avatar ----------
export function avatar(profile, size = 36) {
  const color = profile?.color || '#D9AE55';
  const el = h('span', { class: 'avatar', style: { width: size + 'px', height: size + 'px', fontSize: Math.round(size * 0.38) + 'px', color: '#fff', background: `linear-gradient(150deg, ${shade(color, 0.18)}, ${shade(color, -0.28)})` } });
  if (profile?.avatar_url) el.style.backgroundImage = `url("${profile.avatar_url}")`;
  else el.textContent = initials(profile?.name);
  return el;
}
export const initials = (name = '?') => name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase() || '?';
export function shade(hex, amt) {
  const n = parseInt((hex || '#E8835F').slice(1), 16);
  const f = (c) => Math.round(Math.min(255, Math.max(0, amt > 0 ? c + (255 - c) * amt : c * (1 + amt))));
  return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
}
export function hexA(hex, a) {
  const n = parseInt((hex || '#D9AE55').slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

// ---------- tempo ----------
export const fmtTime = (d) => new Date(d).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
export function fmtDay(d) {
  const x = new Date(d); const t = new Date();
  const y = new Date(); y.setDate(t.getDate() - 1);
  if (x.toDateString() === t.toDateString()) return 'Hoje';
  if (x.toDateString() === y.toDateString()) return 'Ontem';
  return x.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: x.getFullYear() === t.getFullYear() ? undefined : 'numeric' });
}
export function timeAgo(d) {
  const s = (Date.now() - new Date(d).getTime()) / 1000;
  if (s < 60) return 'agora';
  if (s < 3600) return `há ${Math.floor(s / 60)} min`;
  if (s < 86400) return `há ${Math.floor(s / 3600)} h`;
  if (s < 172800) return 'ontem';
  if (s < 604800) return `há ${Math.floor(s / 86400)} dias`;
  return new Date(d).toLocaleDateString('pt-BR');
}
export function timeLeft(d) {
  const s = (new Date(d).getTime() - Date.now()) / 1000;
  if (s <= 0) return 'encerrada';
  const days = Math.floor(s / 86400), hrs = Math.floor((s % 86400) / 3600), min = Math.floor((s % 3600) / 60);
  if (days) return `encerra em ${days}d ${hrs}h`;
  if (hrs) return `encerra em ${hrs}h ${min}min`;
  return `encerra em ${Math.max(1, min)} min`;
}
export const fmtDur = (sec) => { sec = Math.max(0, Math.round(sec || 0)); return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`; };

// ---------- avisos e janelas ----------
let toastTimer;
export function toast(msg, ms = 2600) {
  document.querySelector('.toast')?.remove();
  const t = h('div', { class: 'toast', role: 'status' }, msg);
  document.body.append(t);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.remove(), ms);
}

export function sheet(...content) {
  const wrap = h('div', { class: 'sheet-wrap' });
  const box = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true' }, h('div', { class: 'grab' }), ...content);
  wrap.append(box);
  const close = () => { wrap.remove(); window.removeEventListener('hashchange', close); };
  wrap.addEventListener('click', (e) => { if (e.target === wrap) close(); });
  window.addEventListener('hashchange', close);
  document.body.append(wrap);
  return close;
}

export function confirmBox(text, okLabel = 'Confirmar', danger = false) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (done) return; done = true; close(); resolve(v); };
    const close = sheet(
      h('h3', null, text),
      h('button', { class: `btn block ${danger ? 'danger' : 'primary'}`, onClick: () => finish(true) }, okLabel),
      h('button', { class: 'btn block ghost', onClick: () => finish(false) }, 'Cancelar'),
    );
    const wrap = document.querySelector('.sheet-wrap:last-of-type');
    wrap?.addEventListener('click', (e) => { if (e.target === wrap) finish(false); });
  });
}

export function viewer(url, kind = 'image') {
  const media = kind === 'video'
    ? h('video', { src: url, controls: true, autoplay: true, playsinline: true })
    : h('img', { src: url, alt: '' });
  const v = h('div', { class: 'viewer', onClick: (e) => { if (e.target === v) v.remove(); } }, media, iconBtn('x', 'Fechar', () => v.remove()));
  document.body.append(v);
}

// Abre o seletor de arquivos sem disparar o bloqueio por senha.
export function pickFile(accept, { capture } = {}) {
  return new Promise((resolve) => {
    const input = h('input', { type: 'file', accept, style: { display: 'none' } });
    if (capture) input.setAttribute('capture', capture);
    state.suppressLock = true;
    const release = () => setTimeout(() => { state.suppressLock = false; }, 1500);
    input.addEventListener('change', () => { release(); resolve(input.files?.[0] || null); input.remove(); });
    input.addEventListener('cancel', () => { release(); resolve(null); input.remove(); });
    document.body.append(input);
    input.click();
  });
}

export function switchToggle(on, onChange, label) {
  const b = h('button', { type: 'button', class: 'switch-t', role: 'switch', 'aria-checked': String(!!on), 'aria-label': label }, h('span'));
  b.addEventListener('click', () => {
    const v = b.getAttribute('aria-checked') !== 'true';
    b.setAttribute('aria-checked', String(v));
    onChange(v);
  });
  return b;
}

export function autosize(ta) {
  const fit = () => { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 120) + 'px'; };
  ta.addEventListener('input', fit);
  return fit;
}

export function errMsg(e) {
  const m = e?.message || String(e || 'Erro');
  if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return 'Sem conexão com a internet.';
  if (/Invalid login credentials/i.test(m)) return 'Usuário ou senha errados.';
  return m;
}
