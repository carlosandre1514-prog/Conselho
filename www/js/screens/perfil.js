import { sb, usernameToEmail } from '../sb.js';
import { state, saveSettings, chatBgStyle } from '../state.js';
import { h, icon, iconBtn, avatar, toast, sheet, pickFile, errMsg } from '../ui.js';
import { uploadFile, compressImage, imageToDataUrl } from '../media.js';
import { savePassword } from '../lock.js';
import { back } from '../nav.js';
import { logout, lockNow, loadMembers } from '../app.js';
import { APP_VERSION } from '../config.js';

const BG_COLORS = ['#11100D', '#16222B', '#18261C', '#2A1A20', '#2B2417'];
const NAME_COLORS = ['#D9AE55', '#6FA8DC', '#5BBF86', '#E58BB8', '#E0675A', '#B39DDB', '#4DD0E1', '#FFB74D'];

export default async function Perfil(root) {
  const me = state.me;

  // ---------- perfil ----------
  const avBox = h('span');
  const drawAv = () => avBox.replaceChildren(avatar(state.me, 76));
  drawAv();
  const name = h('input', { class: 'input', value: me.name, maxlength: '40', 'aria-label': 'Seu nome' });
  let color = me.color;
  const colorRow = h('div', { class: 'swatches' });
  const drawColors = () => colorRow.replaceChildren(...NAME_COLORS.map((c) => h('button', {
    type: 'button', class: `swatch ${c === color ? 'on' : ''}`, style: { background: c }, 'aria-label': `Cor ${c}`,
    onClick: () => { color = c; drawColors(); },
  })));
  drawColors();

  async function saveProfile(patch) {
    const { error } = await sb.from('profiles').update(patch).eq('id', me.id);
    if (error) throw error;
    await loadMembers();
    drawAv();
  }

  const changePhoto = async () => {
    const file = await pickFile('image/*');
    if (!file) return;
    try {
      const { blob } = await compressImage(file, 400, 0.85);
      const url = await uploadFile(blob, 'jpg');
      await saveProfile({ avatar_url: url });
      toast('Foto atualizada');
    } catch (e) { toast(errMsg(e)); }
  };

  // ---------- aparência ----------
  const preview = h('div', { class: 'preview-chat' });
  const prevBg = h('div', { class: 'chat-bg', style: { borderRadius: '18px' } });
  const drawPreview = () => {
    chatBgStyle(prevBg);
    preview.replaceChildren(prevBg,
      h('div', { class: 'msg first' }, h('div', { class: 'bubble' }, h('span', { class: 'who', style: { color: 'var(--blue)' } }, 'Bruno'), h('span', { class: 'txt' }, 'Esse fundo ficou brabo'))),
      h('div', { class: 'msg mine first' }, h('div', { class: 'bubble' }, h('span', { class: 'txt' }, 'Né? 😎'))));
  };
  const presets = h('div', { class: 'bg-presets' });
  const drawPresets = () => {
    const s = state.settings;
    presets.replaceChildren(
      ...BG_COLORS.map((c) => h('button', { type: 'button', class: `bg-preset ${s.bgType === 'color' && s.bgColor === c ? 'on' : ''}`, style: { background: c }, 'aria-label': 'Fundo de cor',
        onClick: () => { saveSettings({ bgType: 'color', bgColor: c }); drawPresets(); drawPreview(); } })));
  };
  const pickBg = async () => {
    const file = await pickFile('image/*');
    if (!file) return;
    try {
      const dataUrl = await imageToDataUrl(file, 1280, 0.78);
      saveSettings({ bgType: 'image', bgImage: dataUrl });
      drawPresets(); drawPreview();
      toast('Fundo trocado');
    } catch (e) { toast(errMsg(e)); }
  };
  const range = (label, min, max, step, val, fn, fmt) => {
    const out = h('span', { style: { minWidth: '44px', textAlign: 'right', color: 'var(--gold)' } }, fmt(val));
    const r = h('input', { type: 'range', min, max, step, value: String(val), 'aria-label': label });
    r.addEventListener('input', () => { out.textContent = fmt(Number(r.value)); fn(Number(r.value)); });
    return h('label', { class: 'range-row' }, h('span', null, label), r, out);
  };

  // ---------- senha ----------
  const changePassword = () => {
    const cur = h('input', { class: 'input', type: 'password', placeholder: 'senha atual', autocomplete: 'current-password' });
    const p1 = h('input', { class: 'input', type: 'password', placeholder: 'nova senha (mín. 6)', autocomplete: 'new-password' });
    const p2 = h('input', { class: 'input', type: 'password', placeholder: 'repita a nova senha', autocomplete: 'new-password' });
    const err = h('p', { class: 'err' });
    const btn = h('button', { class: 'btn primary block' }, 'Trocar senha');
    const close = sheet(h('h3', null, 'Trocar senha'), cur, p1, p2, err, btn);
    btn.addEventListener('click', async () => {
      err.textContent = '';
      if (p1.value.length < 6) { err.textContent = 'A nova senha precisa ter 6 caracteres ou mais.'; return; }
      if (p1.value !== p2.value) { err.textContent = 'As senhas novas não são iguais.'; return; }
      btn.disabled = true;
      const { error: e1 } = await sb.auth.signInWithPassword({ email: usernameToEmail(me.username), password: cur.value });
      if (e1) { btn.disabled = false; err.textContent = 'Senha atual errada.'; return; }
      const { error } = await sb.auth.updateUser({ password: p1.value });
      btn.disabled = false;
      if (error) { err.textContent = errMsg(error); return; }
      await savePassword(p1.value, me.id);
      close();
      toast('Senha trocada');
    });
  };

  const saveBtn = h('button', { class: 'btn primary block' }, 'Salvar perfil');
  saveBtn.addEventListener('click', async () => {
    if (!name.value.trim()) return toast('Escreva seu nome.');
    saveBtn.disabled = true;
    try { await saveProfile({ name: name.value.trim(), color }); toast('Perfil salvo'); } catch (e) { toast(errMsg(e)); }
    saveBtn.disabled = false;
  });

  root.replaceChildren(
    h('header', { class: 'topbar' }, iconBtn('back', 'Voltar', () => back('#chat')), h('h1', { class: 'grow' }, 'Você')),
    h('div', { class: 'scroll' }, h('div', { class: 'pad' },
      h('div', { class: 'row', style: { gap: '16px' } }, avBox,
        h('div', { class: 'grow' }, h('b', { class: 'display', style: { fontSize: '26px', display: 'block' } }, me.name), h('span', { class: 'small muted' }, `@${me.username}${me.role === 'admin' ? ' · presidência' : ''}`),
          h('div', null, h('button', { class: 'btn sm line', style: { marginTop: '10px' }, onClick: changePhoto }, icon('camera', 16), 'Trocar foto')))),
      h('label', { class: 'field' }, h('span', { class: 'label' }, 'Nome'), name),
      h('div', { class: 'field' }, h('span', { class: 'label' }, 'Cor do seu nome no chat'), colorRow),
      saveBtn,

      h('div', { class: 'rule left' }, h('span', { class: 'kicker' }, 'Fundo da conversa')),
      preview,
      presets,
      h('div', { class: 'row' },
        h('button', { class: 'btn sm line grow', onClick: pickBg }, icon('image', 16), 'Usar uma foto'),
        h('button', { class: 'btn sm line', onClick: () => { saveSettings({ bgType: 'color', bgImage: null }); drawPresets(); drawPreview(); } }, 'Sem foto')),
      range('Bolhas', 0.3, 1, 0.05, state.settings.bubbleAlpha, (v) => { saveSettings({ bubbleAlpha: v }); }, (v) => Math.round(v * 100) + '%'),
      range('Escurecer', 0, 0.7, 0.05, state.settings.bgDim, (v) => { saveSettings({ bgDim: v }); }, (v) => Math.round(v * 100) + '%'),
      h('p', { class: 'small muted', style: { margin: 0 } }, '"Bolhas" deixa os balões mais transparentes pra aparecer o fundo. "Escurecer" ajuda a ler em cima de foto clara. Vale só neste celular.'),

      h('div', { class: 'rule left' }, h('span', { class: 'kicker' }, 'Segurança')),
      h('div', { class: 'settings-list' },
        h('button', { class: 'setting', onClick: changePassword }, h('span', { class: 'ib' }, icon('key', 18)), h('span', { class: 'grow tt' }, 'Trocar senha'), icon('chevR', 16)),
        h('button', { class: 'setting', onClick: () => lockNow() }, h('span', { class: 'ib' }, icon('lock', 18)), h('span', { class: 'grow tt' }, 'Bloquear agora'), icon('chevR', 16)),
        h('button', { class: 'setting', onClick: () => logout() }, h('span', { class: 'ib', style: { color: 'var(--red)', background: 'rgba(224,103,90,.12)' } }, icon('logout', 18)), h('span', { class: 'grow tt', style: { color: 'var(--red)' } }, 'Sair da conta'))),
      h('p', { class: 'small muted', style: { textAlign: 'center', margin: '8px 0 0' } }, `Conselho v${APP_VERSION}`))));
  drawPresets();
  drawPreview();
}
