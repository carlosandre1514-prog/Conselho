// Desbloqueio por biometria (digital ou rosto) no APK Android.
// Usa o plugin nativo NativeBiometric; no navegador simplesmente não aparece.
import { state } from './state.js';

const plugin = () => window.Capacitor?.Plugins?.NativeBiometric;
const KEY = 'conselho-bio';

export async function bioAvailable() {
  try {
    const p = plugin();
    if (!p) return false;
    const r = await p.isAvailable();
    return !!r?.isAvailable;
  } catch { return false; }
}

export async function bioVerify() {
  const p = plugin();
  if (!p) throw new Error('Biometria indisponível');
  state.suppressLock = true;
  try {
    await p.verifyIdentity({
      reason: 'Desbloquear o Conselho',
      title: 'Conselho',
      subtitle: 'Use sua digital ou o rosto',
      description: '',
      negativeButtonText: 'Usar senha',
      maxAttempts: 4,
    });
    return true;
  } finally {
    setTimeout(() => { state.suppressLock = false; }, 1200);
  }
}

export const bioEnabled = () => localStorage.getItem(KEY) === '1';
export const setBio = (on) => localStorage.setItem(KEY, on ? '1' : '0');
