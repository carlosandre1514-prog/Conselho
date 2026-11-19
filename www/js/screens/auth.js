import { h, icon, iconBtn, logo, errMsg, buzz } from '../ui.js';
import { sb, usernameToEmail } from '../sb.js';
import { savePassword, checkPassword, clearPassword } from '../lock.js';
import { SUPABASE_URL, SUPABASE_KEY } from '../config.js';

function field(label, input, hint) {
  return h('label', { class: 'field' }, h('span', { class: 'label' }, label), input, hint ? h('span', { class: 'small muted' }, hint) : null);
}

function busy(btn, on) {
  btn.disabled = on;
  if (on) { btn.dataset.t = btn.textContent; btn.replaceChildren(h('span', { class: 'spinner', style: { borderTopColor: '#17120A', borderColor: 'rgba(23,18,10,.25)' } })); }
  else btn.textContent = btn.dataset.t || btn.textContent;
}

function passwordInput(attrs) {
  const input = h('input', { class: 'input', type: 'password', ...attrs });
  const eye = iconBtn('eye', 'Mostrar senha', () => {
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    eye.replaceChildren(icon(show ? 'eyeOff' : 'eye', 20));
  });
  return { input, el: h('span', { style: { position: 'relative', display: 'block' } }, input, h('span', { style: { position: 'absolute', right: '5px', top: '5px' } }, eye)) };
}

const steps = (n) => h('div', { class: 'steps' }, [1, 2, 3].map((i) => h('i', { class: i <= n ? 'on' : '' })), h('span', null, `Passo ${n} de 3`));

// Tela de entrada: primeiro acesso (código) ou "já tenho conta".
export function renderAuth(root, onDone) {
  let mode = 'novo';
  let step = 1;
  const data = { code: '', group: '', name: '', username: '' };

  const draw = () => {
    const err = h('p', { class: 'err', role: 'alert' });
    let form;
    let heading;

    if (mode === 'login') {
      heading = ['De volta.', 'Entra com seu usuário e a senha que você criou.'];
      const user = h('input', { class: 'input', autocomplete: 'username', autocapitalize: 'none', spellcheck: 'false', placeholder: 'seu usuário', required: true });
      const pass = passwordInput({ autocomplete: 'current-password', placeholder: 'sua senha', required: true });
      const btn = h('button', { class: 'btn primary block', type: 'submit' }, 'Entrar');
      form = h('form', null, field('Usuário', user), field('Senha', pass.el), err, btn);
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        err.textContent = '';
        busy(btn, true);
        const { data: res, error } = await sb.auth.signInWithPassword({ email: usernameToEmail(user.value), password: pass.input.value });
        if (error) { busy(btn, false); err.textContent = errMsg(error); buzz([30, 50, 30]); return; }
        await savePassword(pass.input.value, res.user.id);
        onDone();
      });
    } else if (step === 1) {
      heading = ['Conselho', 'O grupo dos amigos. As decisões também.'];
      const code = h('input', { class: 'input code', autocapitalize: 'characters', autocomplete: 'off', spellcheck: 'false', placeholder: 'CNS-······', value: data.code, required: true });
      const btn = h('button', { class: 'btn primary block', type: 'submit' }, 'Continuar');
      form = h('form', null, steps(1), field('Código de acesso', code, 'Quem já é do grupo encontra o código na aba Membros.'), err, btn);
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        err.textContent = '';
        busy(btn, true);
        const { data: groupName, error } = await sb.rpc('check_code', { p_code: code.value.trim().toUpperCase() });
        busy(btn, false);
        if (error) { err.textContent = errMsg(error); return; }
        if (!groupName) { err.textContent = 'Esse código não abre nada. Confere com o pessoal.'; buzz([30, 50, 30]); return; }
        data.code = code.value.trim().toUpperCase();
        data.group = groupName;
        step = 2; draw();
      });
    } else if (step === 2) {
      heading = [`Bem-vindo ao ${data.group}.`, 'Como o grupo vai te chamar aqui dentro?'];
      const name = h('input', { class: 'input', autocomplete: 'name', placeholder: 'Ex.: Carlão', maxlength: '40', value: data.name, required: true });
      const user = h('input', { class: 'input', autocomplete: 'username', autocapitalize: 'none', spellcheck: 'false', placeholder: 'ex.: carlos', maxlength: '20', value: data.username, required: true });
      user.addEventListener('input', () => { user.value = user.value.toLowerCase().replace(/[^a-z0-9_.]/g, ''); });
      name.addEventListener('input', () => {
        if (!user.dataset.touched) user.value = name.value.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '').slice(0, 20);
      });
      user.addEventListener('keydown', () => { user.dataset.touched = '1'; });
      const btn = h('button', { class: 'btn primary block', type: 'submit' }, 'Continuar');
      form = h('form', null, steps(2), field('Seu nome', name), field('Usuário', user, 'É com ele que você entra em outro celular.'), err, btn,
        h('button', { type: 'button', class: 'btn line block', onClick: () => { step = 1; draw(); } }, 'Voltar'));
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        if (!/^[a-z0-9_.]{3,20}$/.test(user.value)) { err.textContent = 'Usuário: de 3 a 20 letras minúsculas, números, ponto ou _.'; return; }
        data.name = name.value.trim();
        data.username = user.value;
        step = 3; draw();
      });
    } else {
      heading = ['Sua chave.', 'Essa senha tranca o Conselho. Toda vez que você abrir o app, ela vai ser pedida.'];
      const p1 = passwordInput({ autocomplete: 'new-password', placeholder: 'mínimo 6 caracteres', minlength: '6', required: true });
      const p2 = passwordInput({ autocomplete: 'new-password', placeholder: 'repete a senha', required: true });
      const btn = h('button', { class: 'btn primary block', type: 'submit' }, 'Criar senha e entrar');
      form = h('form', null, steps(3), field('Crie a senha', p1.el), field('Confirme', p2.el), err, btn,
        h('button', { type: 'button', class: 'btn line block', onClick: () => { step = 2; draw(); } }, 'Voltar'));
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        err.textContent = '';
        if (p1.input.value.length < 6) { err.textContent = 'A senha precisa ter pelo menos 6 caracteres.'; return; }
        if (p1.input.value !== p2.input.value) { err.textContent = 'As duas senhas não batem.'; buzz([30, 50, 30]); return; }
        busy(btn, true);
        try {
          const res = await fetch(`${SUPABASE_URL}/functions/v1/entrar`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
            body: JSON.stringify({ code: data.code, name: data.name, username: data.username, password: p1.input.value }),
          });
          const out = await res.json().catch(() => ({}));
          if (!res.ok || !out.ok) throw new Error(out.error || 'Não deu pra criar a conta.');
          const { data: s, error } = await sb.auth.signInWithPassword({ email: usernameToEmail(data.username), password: p1.input.value });
          if (error) throw error;
          await savePassword(p1.input.value, s.user.id);
          buzz(30);
          onDone();
        } catch (ex) {
          busy(btn, false);
          err.textContent = errMsg(ex);
          if (/usuário já existe/i.test(err.textContent)) { step = 2; setTimeout(draw, 1400); }
        }
      });
    }

    const switcher = mode === 'login'
      ? h('p', { class: 'switch' }, 'Primeira vez aqui? ', h('button', { type: 'button', onClick: () => { mode = 'novo'; step = 1; draw(); } }, 'Tenho um código'))
      : step === 1 ? h('p', { class: 'switch' }, 'Já tem conta? ', h('button', { type: 'button', onClick: () => { mode = 'login'; draw(); } }, 'Entrar com usuário e senha')) : h('span');

    root.replaceChildren(h('main', { class: 'auth' },
      h('div', null, logo(56),
        h('h1', { class: 'display', style: { fontSize: heading[0].length > 14 ? '36px' : '48px' } }, heading[0]),
        h('p', { class: 'tagline' }, heading[1])),
      form,
      switcher,
    ));
    form.querySelector('input')?.focus({ preventScroll: true });
  };
  draw();
}

// Tela de bloqueio: "Conselho · digite a senha"
let lockEl = null;
export function showLock({ userId, username, name, onUnlock, onLogout }) {
  if (lockEl) return;
  let fails = 0;
  let waitUntil = 0;
  const pass = passwordInput({ autocomplete: 'current-password', placeholder: 'Senha', 'aria-label': 'Senha', required: true });
  const err = h('p', { class: 'err', role: 'alert' });
  const btn = h('button', { class: 'btn primary block', type: 'submit' }, 'Abrir o Conselho');
  const form = h('form', null, h('div', { class: 'pw' }, pass.el), err, btn);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (Date.now() < waitUntil) { err.textContent = `Calma. Tenta de novo em ${Math.ceil((waitUntil - Date.now()) / 1000)}s.`; return; }
    err.textContent = '';
    busy(btn, true);
    let ok = await checkPassword(pass.input.value, userId);
    if (ok === null) {
      const { error } = await sb.auth.signInWithPassword({ email: usernameToEmail(username), password: pass.input.value });
      ok = !error;
      if (ok) await savePassword(pass.input.value, userId);
    }
    busy(btn, false);
    if (ok) { buzz(12); hideLock(); onUnlock?.(); return; }
    fails++;
    buzz([40, 60, 40]);
    pass.input.value = '';
    form.classList.remove('shake'); void form.offsetWidth; form.classList.add('shake');
    if (fails >= 5) { waitUntil = Date.now() + 30000; fails = 0; err.textContent = 'Muitas tentativas. Espera 30 segundos.'; }
    else err.textContent = 'Senha errada.';
  });
  const hour = new Date().getHours();
  const greet = hour < 5 ? 'Boa madrugada' : hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';
  lockEl = h('div', { class: 'lock', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Conselho trancado' },
    h('div', { class: 'top' },
      logo(56),
      h('h1', { class: 'display' }, 'Conselho'),
      h('p', { class: 'muted', style: { margin: 0, fontSize: '16px' } }, `${greet}${name ? ', ' + name.split(' ')[0] : ''}. Digite a senha pra entrar.`)),
    form,
    h('button', { type: 'button', class: 'btn sm', style: { background: 'none', color: 'var(--mu)', marginTop: '14px' }, onClick: async () => {
      hideLock();
      clearPassword();
      await onLogout?.();
    } }, 'Não é você? Sair desta conta'),
  );
  document.body.append(lockEl);
  setTimeout(() => pass.input.focus(), 60);
}
export function hideLock() { lockEl?.remove(); lockEl = null; }
export const isLocked = () => !!lockEl;
