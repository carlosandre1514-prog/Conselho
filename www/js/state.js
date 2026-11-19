// Estado global simples + barramento de eventos.
export const state = {
  session: null,
  me: null,          // perfil do usuário logado
  group: null,       // { id, name }
  members: new Map(),// id -> perfil
  online: new Set(), // ids online
  ready: false,
  suppressLock: false,
  pendingSticker: null,
  unread: 0, // arquivo escolhido para o editor de figurinha
  settings: loadSettings(),
};

export const bus = new EventTarget();
export const emit = (name, detail) => bus.dispatchEvent(new CustomEvent(name, { detail }));
export const on = (name, fn) => {
  const h = (e) => fn(e.detail);
  bus.addEventListener(name, h);
  return () => bus.removeEventListener(name, h);
};

const SETTINGS_KEY = 'conselho-settings';
function loadSettings() {
  const def = { bgType: 'color', bgColor: '#11100D', bgImage: null, bubbleAlpha: 1, bgDim: 0.25 };
  try { return { ...def, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') }; } catch { return def; }
}
export function saveSettings(patch) {
  Object.assign(state.settings, patch);
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings));
  } catch {
    // imagem grande demais pro armazenamento: guarda sem a imagem
    const { bgImage, ...rest } = state.settings;
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...rest, bgType: 'color' }));
    throw new Error('Imagem grande demais. Tente outra.');
  }
  applySettings();
}
export function applySettings() {
  const r = document.documentElement.style;
  r.setProperty('--bubble-alpha', String(state.settings.bubbleAlpha));
  r.setProperty('--bg-dim', String(state.settings.bgType === 'image' ? state.settings.bgDim : 0));
}
export function chatBgStyle(el) {
  const s = state.settings;
  if (s.bgType === 'image' && s.bgImage) {
    el.style.backgroundImage = `url("${s.bgImage}")`;
    el.style.backgroundColor = '#000';
  } else {
    el.style.backgroundImage = '';
    el.style.backgroundColor = s.bgColor || '#11100D';
  }
}

export const memberName = (id) => state.members.get(id)?.name || 'Alguém';
