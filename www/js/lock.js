// Senha de desbloqueio do app guardada só neste aparelho (como "hash", nunca a senha em si).
const KEY = 'conselho-lock';
const ITER = 150000;

const b64 = (u8) => btoa(String.fromCharCode(...u8));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function derive(pass, salt) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: ITER, hash: 'SHA-256' }, base, 256);
  return b64(new Uint8Array(bits));
}

export async function savePassword(pass, uid) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derive(pass, salt);
  localStorage.setItem(KEY, JSON.stringify({ uid, salt: b64(salt), hash }));
}

// true = certa, false = errada, null = este aparelho ainda não tem a senha salva
export async function checkPassword(pass, uid) {
  try {
    const d = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (!d || d.uid !== uid) return null;
    return (await derive(pass, unb64(d.salt))) === d.hash;
  } catch {
    return null;
  }
}

export const clearPassword = () => localStorage.removeItem(KEY);
