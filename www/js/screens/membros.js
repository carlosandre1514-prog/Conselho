import { sb } from '../sb.js';
import { state, on } from '../state.js';
import { h, icon, iconBtn, avatar, timeAgo, toast, confirmBox, errMsg } from '../ui.js';
import { go } from '../nav.js';

export default async function Membros(root) {
  const offs = [];
  const sub = h('p');
  const list = h('ul', { class: 'card', style: { margin: 0, padding: 0, listStyle: 'none', overflow: 'hidden' } });
  const codeEl = h('span', { class: 'invite-code' }, '••••••••');
  let code = '';
  const isAdmin = state.me.role === 'admin';

  function draw() {
    const members = [...state.members.values()].sort((a, b) => {
      if (a.id === state.me.id) return -1;
      if (b.id === state.me.id) return 1;
      const oa = state.online.has(a.id), ob = state.online.has(b.id);
      if (oa !== ob) return oa ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    sub.textContent = `${members.length} no grupo · ${state.online.size} online`;
    list.replaceChildren(...members.map((m) => {
      const online = state.online.has(m.id);
      return h('li', { class: 'member' },
        h('span', { class: 'av-wrap' }, avatar(m, 42), online ? h('span', { class: 'on', role: 'img', 'aria-label': 'online' }) : null),
        h('span', { class: 'grow' },
          h('span', { class: 'row', style: { gap: '6px' } },
            h('b', { style: { fontSize: '15px' } }, m.name + (m.id === state.me.id ? ' (você)' : '')),
            m.role === 'admin' ? h('span', { class: 'pill gold', style: { padding: '2px 8px', fontSize: '10px' } }, icon('crown', 11, 2.2), 'Admin') : null),
          h('span', { class: 'small', style: { color: online ? 'var(--grn)' : 'var(--mu)', display: 'block' } },
            online ? 'online' : m.last_seen ? `visto ${timeAgo(m.last_seen)}` : `@${m.username}`)));
    }));
  }

  async function loadCode() {
    const { data, error } = await sb.rpc('my_invite_code');
    if (error) return;
    code = data || '';
    codeEl.textContent = code;
  }

  const shareCode = async () => {
    const text = `Entra no nosso Conselho! Baixe o app e use o código de acesso: ${code}`;
    if (navigator.share) { try { await navigator.share({ title: 'Conselho', text }); } catch { /* cancelado */ } }
    else { await navigator.clipboard?.writeText(text); toast('Convite copiado'); }
  };

  offs.push(on('online', draw), on('members', draw));

  root.replaceChildren(
    h('div', { class: 'big-title' }, h('div', null, h('h1', null, 'Membros'), sub),
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Meu perfil', onClick: () => go('#perfil'), style: { padding: 0, overflow: 'hidden' } }, avatar(state.me, 44))),
    h('div', { class: 'scroll' }, h('div', { class: 'pad' },
      h('section', { class: 'card gold', style: { padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: '12px' } },
        h('h2', { class: 'row', style: { margin: 0, fontSize: '16px', fontWeight: 800, gap: '8px' } }, h('span', { style: { color: 'var(--gold)' } }, icon('link', 18)), 'Código de acesso'),
        h('div', { class: 'row', style: { gap: '8px' } }, codeEl,
          iconBtn('copy', 'Copiar código', async () => { await navigator.clipboard?.writeText(code); toast('Código copiado'); }),
          iconBtn('share', 'Compartilhar convite', shareCode)),
        h('p', { class: 'small', style: { margin: 0, color: '#B5AD9E', lineHeight: 1.5 } }, 'Quem tiver esse código consegue entrar no grupo. Mande só pra quem é do Conselho.'),
        isAdmin ? h('button', { class: 'btn sm ghost', style: { alignSelf: 'flex-start' }, onClick: async () => {
          if (!(await confirmBox('Gerar um código novo? O antigo para de funcionar (quem já entrou continua no grupo).', 'Gerar novo'))) return;
          const { data, error } = await sb.rpc('regenerate_code');
          if (error) return toast(errMsg(error));
          code = data; codeEl.textContent = data; toast('Código novo gerado');
        } }, icon('refresh', 16), 'Gerar novo código') : null),
      h('h2', { class: 'section-title' }, 'No grupo'),
      list)));
  draw();
  await loadCode();
  return { destroy: () => offs.forEach((f) => f()) };
}
