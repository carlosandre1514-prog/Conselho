import { sb } from '../sb.js';
import { state, on } from '../state.js';
import { h, icon, iconBtn, avatar, timeAgo, toast, sheet, confirmBox, errMsg, buzz } from '../ui.js';
import { loadMembers } from '../app.js';
import { go } from '../nav.js';

export default async function Membros(root) {
  const offs = [];
  const sub = h('span', { class: 'kicker' });
  const list = h('ul', { style: { margin: 0, padding: 0, listStyle: 'none' } });
  const codeEl = h('span', { class: 'invite-code' }, 'CNS-······');
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
    sub.textContent = `${members.length} ${members.length === 1 ? 'cadeira ocupada' : 'cadeiras ocupadas'} · ${state.online.size} aqui agora`;
    list.replaceChildren(...members.map((m) => {
      const online = state.online.has(m.id);
      const canRemove = isAdmin && m.id !== state.me.id;
      return h('li', { class: 'member', style: canRemove ? { cursor: 'pointer' } : null, onClick: canRemove ? () => manage(m) : null },
        h('span', { class: 'av-wrap' }, avatar(m, 42), online ? h('span', { class: 'on', role: 'img', 'aria-label': 'online' }) : null),
        h('span', { class: 'grow' },
          h('span', { class: 'row', style: { gap: '6px' } },
            h('b', { style: { fontSize: '15px' } }, m.name + (m.id === state.me.id ? ' (você)' : '')),
            m.role === 'admin' ? h('span', { class: 'pill gold plain', style: { fontSize: '12px' } }, icon('crown', 12, 2), 'presidência') : null),
          h('span', { class: 'small', style: { color: online ? 'var(--grn)' : 'var(--mu)', display: 'block' } },
            online ? 'aqui agora' : m.last_seen ? `@${m.username} · visto ${timeAgo(m.last_seen)}` : `@${m.username}`)));
    }));
  }

  function manage(m) {
    const close = sheet(
      h('div', { class: 'row', style: { gap: '12px', padding: '4px' } }, avatar(m, 44), h('div', null, h('b', { style: { fontSize: '17px' } }, m.name), h('div', { class: 'small muted' }, `@${m.username}`))),
      h('button', { class: 'sheet-item danger', onClick: async () => {
        close();
        if (!(await confirmBox(`Remover ${m.name} do Conselho? A conta é apagada; as mensagens ficam.`, 'Remover', true))) return;
        const { error } = await sb.rpc('remove_member', { p_user: m.id });
        if (error) return toast(errMsg(error));
        buzz([20, 40, 20]);
        toast(`${m.name} foi removido`);
        loadMembers().catch(() => {});
      } }, icon('trash', 20), 'Remover do Conselho'));
  }

  async function loadCode() {
    const { data, error } = await sb.rpc('my_invite_code');
    if (error) return;
    code = data || '';
    codeEl.textContent = code;
  }

  const shareCode = async () => {
    const text = `Tá convidado pro Conselho. Baixa o app e entra com o código ${code}`;
    if (navigator.share) { try { await navigator.share({ title: 'Conselho', text }); } catch { /* cancelado */ } }
    else { await navigator.clipboard?.writeText(text); toast('Convite copiado'); }
  };

  offs.push(on('online', draw), on('members', draw));

  root.replaceChildren(
    h('div', { class: 'masthead' }, h('div', null, sub, h('h1', { class: 'display' }, 'Membros')),
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Meu perfil', onClick: () => go('#perfil') }, avatar(state.me, 36))),
    h('div', { class: 'scroll' }, h('div', { class: 'pad' },
      h('section', { class: 'panel brass invite' },
        h('span', { class: 'kicker' }, 'Código de acesso'),
        h('div', { class: 'row between' }, codeEl,
          h('span', { class: 'row', style: { gap: '4px' } },
            iconBtn('copy', 'Copiar código', async () => { await navigator.clipboard?.writeText(code); buzz(8); toast('Código copiado'); }),
            iconBtn('share', 'Mandar convite', shareCode))),
        h('p', { class: 'small', style: { margin: 0, color: '#BDB3A0', lineHeight: 1.5 } }, 'Quem tiver esse código entra no grupo. Manda só pra quem é do Conselho.'),
        isAdmin ? h('button', { class: 'btn sm line', style: { alignSelf: 'flex-start' }, onClick: async () => {
          if (!(await confirmBox('Trocar o código? O atual para de funcionar na hora (quem já entrou continua).', 'Trocar código'))) return;
          const { data, error } = await sb.rpc('regenerate_code');
          if (error) return toast(errMsg(error));
          code = data; codeEl.textContent = data; buzz(15); toast('Código novo valendo');
        } }, icon('refresh', 16), 'Trocar código') : null),
      h('div', { class: 'rule left' }, h('span', { class: 'kicker' }, 'Quem está no Conselho')),
      list)));
  draw();
  await loadCode();
  return { destroy: () => offs.forEach((f) => f()) };
}
