import { h, icon, errMsg } from '../ui.js';
import { sb, usernameToEmail } from '../sb.js';
import { savePassword, checkPassword, clearPassword } from '../lock.js';
import { SUPABASE_URL, SUPABASE_KEY } from '../config.js';

const logo = () => h('div', { class: 'logo-badge big' }, icon('landmark', 38, 1.6));

function field(label, input, hint) {
  return h('label', { class: 'field' }, h('span', { class: 'label' }, label), input, hint ? h('span', { class: 'small muted' }, hint) : null);
}

function busy(btn, on, text) {
  btn.disabled = on;
  if (on) { btn.dataset.t = btn.textContent; btn.replaceChildren(h('span', { class: 'spinner', style: { borderTopColor: '#1A1306' } })); }
  else btn.textContent = text || btn.dataset.t || btn.textContent;
}

// Tela de entrada: primeiro acesso (código) ou "já tenho conta".
export function renderAuth(root, onDone) {
  let mode = 'novo';
  let step = 1;
  const data = { code: '', group: '', name: '', username: '', password: '' };

  const draw = () => {
    const err = h('p', { class: 'err', role: 'alert' });
    let form;

    if (mode === 'login') {
      const user = h('input', { class: 'input', autocomplete: 'username', autocapitalize: 'none', spellcheck: 'false', placeholder: 'seu usuário', required: true });
      const pass = h('input', { class: 'input', type: 'password', autocomplete: 'current-password', placeholder: 'sua senha', required: true });
      const btn = h('button', { class: 'btn primary block', type: 'submit' }, 'Entrar');
      form = h('form', null, field('Usuário', user), field('Senha', pass), err, btn);
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        err.textContent = '';
        busy(btn, true);
        const { data: res, error } = await sb.auth.signInWithPassword({ email: usernameToEmail(user.value), password: pass.value });
        if (error) { busy(btn, false); err.textContent = errMsg(error); return; }
        await savePassword(pass.value, res.user.id);
        onDone();
      });
    } else if (step === 1) {
      const code = h('input', { class: 'input code', autocapitalize: 'characters', autocomplete: 'off', spellcheck: 'false', placeholder: 'CNS-XXXXXX', value: data.code, required: true });
      const btn = h('button', { class: 'btn primary block', type: 'submit' }, 'Continuar');
      form = h('form', null, h('div', { class: 'steps' }, h('span', { class: 'on' }), h('span'), h('span')),
        field('Código de acesso', code, 'Peça o código para alguém do grupo.'), err, btn);
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        err.textContent = '';
        busy(btn, true);
        const { data: groupName, error } = await sb.rpc('check_code', { p_code: code.value.trim().toUpperCase() });
        busy(btn, false);
        if (error) { err.textContent = errMsg(error); return; }
        if (!groupName) { err.textContent = 'Código inválido. Confira com o pessoal.'; return; }
        data.code = code.value.trim().toUpperCase();
        data.group = groupName;
        step = 2; draw();
      });
    } else if (step === 2) {
      const name = h('input', { class: 'input', autocomplete: 'name', placeholder: 'Como o grupo te chama', maxlength: '40', value: data.name, required: true });
      const user = h('input', { class: 'input', autocomplete: 'username', autocapitalize: 'none', spellcheck: 'false', placeholder: 'ex: carlos', maxlength: '20', value: data.username, required: true });
      user.addEventListener('input', () => { user.value = user.value.toLowerCase().replace(/[^a-z0-9_.]/g, ''); });
      const btn = h('button', { class: 'btn primary block', type: 'submit' }, 'Continuar');
      form = h('form', null, h('div', { class: 'steps' }, h('span', { class: 'on' }), h('span', { class: 'on' }), h('span')),
        h('p', { class: 'muted', style: { margin: 0 } }, 'Entrando em ', h('b', { style: { color: 'var(--gold)' } }, data.group)),
        field('Seu nome', name), field('Usuário', user, 'Você usa ele pra entrar em outro celular.'), err, btn,
        h('button', { type: 'button', class: 'btn ghost block', onClick: () => { step = 1; draw(); } }, 'Voltar'));
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        if (!/^[a-z0-9_.]{3,20}$/.test(user.value)) { err.textContent = 'Usuário: de 3 a 20 letras minúsculas, números, ponto ou _.'; return; }
        data.name = name.value.trim();
        data.username = user.value;
        step = 3; draw();
      });
    } else {
      const p1 = h('input', { class: 'input', type: 'password', autocomplete: 'new-password', placeholder: 'mínimo 6 caracteres', minlength: '6', required: true });
      const p2 = h('input', { class: 'input', type: 'password', autocomplete: 'new-password', placeholder: 'repita a senha', required: true });
      const btn = h('button', { class: 'btn primary block', type: 'submit' }, 'Criar senha e entrar');
      form = h('form', null, h('div', { class: 'steps' }, h('span', { class: 'on' }), h('span', { class: 'on' }), h('span', { class: 'on' })),
        h('p', { class: 'muted', style: { margin: 0, lineHeight: '1.5' } }, 'Essa senha desbloqueia o Conselho toda vez que você abrir o app.'),
        field('Crie sua senha', p1), field('Confirme a senha', p2), err, btn,
        h('button', { type: 'button', class: 'btn ghost block', onClick: () => { step = 2; draw(); } }, 'Voltar'));
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        err.textContent = '';
        if (p1.value.length < 6) { err.textContent = 'A senha precisa ter pelo menos 6 caracteres.'; return; }
        if (p1.value !== p2.value) { err.textContent = 'As senhas não são iguais.'; return; }
        busy(btn, true);
        try {
          const res = await fetch(`${SUPABASE_URL}/functions/v1/entrar`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
            body: JSON.stringify({ code: data.code, name: data.name, username: data.username, password: p1.value }),
          });
          const out = await res.json().catch(() => ({}));
          if (!res.ok || !out.ok) throw new Error(out.error || 'Não deu pra criar a conta.');
          const { data: s, error } = await sb.auth.signInWithPassword({ email: usernameToEmail(data.username), password: p1.value });
          if (error) throw error;
          await savePassword(p1.value, s.user.id);
          onDone();
        } catch (ex) {
          busy(btn, false);
          err.textContent = errMsg(ex);
          if (/usuário já existe/i.test(err.textContent)) { step = 2; setTimeout(draw, 1200); }
        }
      });
    }

    const switcher = mode === 'login'
      ? h('p', { class: 'switch' }, 'Primeira vez aqui? ', h('button', { type: 'button', onClick: () => { mode = 'novo'; step = 1; draw(); } }, 'Usar código de acesso'))
      : h('p', { class: 'switch' }, 'Já tem conta? ', h('button', { type: 'button', onClick: () => { mode = 'login'; draw(); } }, 'Entrar com usuário e senha'));

    root.replaceChildren(h('main', { class: 'auth' },
      h('div', { style: { display: 'flex', flexDirection: 'column', gap: '22px' } }, logo(),
        h('div', null, h('h1', null, 'Conselho'), h('p', { class: 'tagline' }, 'O grupo dos amigos.', h('br'), 'As decisões também.'))),
      form,
      switcher,
    ));
    form.querySelector('input')?.focus({ preventScroll: true });
  };
  draw();
}

// Tela de bloqueio: "Conselho · digite a senha"
let lockEl = null;
export function showLock({ userId, username, onUnlock, onLogout }) {
  if (lockEl) return;
  let fails = 0;
  let waitUntil = 0;
  const pass = h('input', { class: 'input', type: 'password', autocomplete: 'current-password', placeholder: 'Digite a senha', 'aria-label': 'Senha', required: true });
  const err = h('p', { class: 'err', role: 'alert', style: { textAlign: 'center' } });
  const btn = h('button', { class: 'btn primary block', type: 'submit' }, 'Desbloquear');
  const form = h('form', null, pass, err, btn);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (Date.now() < waitUntil) { err.textContent = `Aguarde ${Math.ceil((waitUntil - Date.now()) / 1000)}s para tentar de novo.`; return; }
    err.textContent = '';
    busy(btn, true);
    let ok = await checkPassword(pass.value, userId);
    if (ok === null) {
      // aparelho sem a senha guardada: confere online
      const { error } = await sb.auth.signInWithPassword({ email: usernameToEmail(username), password: pass.value });
      ok = !error;
      if (ok) await savePassword(pass.value, userId);
    }
    busy(btn, false);
    if (ok) { hideLock(); onUnlock?.(); return; }
    fails++;
    pass.value = '';
    form.classList.remove('shake'); void form.offsetWidth; form.classList.add('shake');
    if (fails >= 5) { waitUntil = Date.now() + 30000; fails = 0; err.textContent = 'Muitas tentativas. Aguarde 30 segundos.'; }
    else err.textContent = 'Senha errada.';
  });
  lockEl = h('div', { class: 'lock', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Conselho bloqueado' },
    logo(),
    h('h1', null, 'Conselho'),
    h('p', { class: 'muted', style: { margin: 0 } }, 'Digite a senha para entrar'),
    form,
    h('button', { type: 'button', class: 'btn ghost sm', onClick: async () => {
      hideLock();
      clearPassword();
      await onLogout?.();
    } }, icon('logout', 16), 'Sair desta conta'),
  );
  document.body.append(lockEl);
  setTimeout(() => pass.focus(), 50);
}
export function hideLock() { lockEl?.remove(); lockEl = null; }
export const isLocked = () => !!lockEl;
