import { sb } from '../sb.js';
import { state, on } from '../state.js';
import { h, icon, iconBtn, avatar, logo, viewer, timeAgo, toast, sheet, confirmBox, errMsg, buzz } from '../ui.js';
import { loadMembers } from '../app.js';
import { go } from '../nav.js';

export default async function Membros(root) {
  const offs = [];
  const sub = h('span', { class: 'kicker' });
  const list = h('ul', { style: { margin: 0, padding: 0, listStyle: 'none' } });
  const invitesBox = h('div', { style: { display: 'flex', flexDirection: 'column', gap: '0' } });
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

  const shareInvite = async (code) => {
    const text = `Você foi convidado pro Conselho. Baixa o app e entra com este convite (vale só pra você, uma vez): ${code}`;
    if (navigator.share) { try { await navigator.share({ title: 'Convite do Conselho', text }); } catch { /* cancelado */ } }
    else { await navigator.clipboard?.writeText(text); toast('Convite copiado'); }
  };

  async function loadInvites() {
    if (!isAdmin) return;
    const { data, error } = await sb.from('invites').select('*').order('created_at', { ascending: false }).limit(50);
    if (error) { invitesBox.replaceChildren(h('p', { class: 'small muted' }, errMsg(error))); return; }
    const open = data.filter((i) => !i.used_at);
    const used = data.filter((i) => i.used_at).slice(0, 5);
    invitesBox.replaceChildren(
      ...open.map((i) => h('div', { class: 'member' },
        h('span', { class: 'grow' }, h('span', { class: 'invite-code', style: { fontSize: '24px' } }, i.code), h('span', { class: 'small muted', style: { display: 'block' } }, `criado ${timeAgo(i.created_at)} · ainda não usado`)),
        iconBtn('copy', 'Copiar convite', async () => { await navigator.clipboard?.writeText(i.code); buzz(8); toast('Convite copiado'); }),
        iconBtn('share', 'Mandar convite', () => shareInvite(i.code)),
        iconBtn('x', 'Cancelar convite', async () => {
          if (!(await confirmBox(`Cancelar o convite ${i.code}?`, 'Cancelar convite', true))) return;
          const { error: e } = await sb.rpc('cancel_invite', { p_code: i.code });
          if (e) return toast(errMsg(e));
          loadInvites();
        }))),
      ...used.map((i) => h('div', { class: 'member', style: { opacity: 0.6 } },
        h('span', { class: 'grow' }, h('span', { style: { textDecoration: 'line-through', fontFamily: 'var(--serif)', fontSize: '18px' } }, i.code),
          h('span', { class: 'small muted', style: { display: 'block' } }, `usado por ${i.used_name || 'alguém'} · ${timeAgo(i.used_at)}`)))),
      !open.length && !used.length ? h('p', { class: 'small muted', style: { margin: '6px 0' } }, 'Nenhum convite ainda.') : null,
    );
  }

  async function newInvite(btn) {
    btn.disabled = true;
    const { data: code, error } = await sb.rpc('create_invite');
    btn.disabled = false;
    if (error) return toast(errMsg(error));
    buzz(15);
    await loadInvites();
    shareInvite(code);
  }

  offs.push(on('online', draw), on('members', draw));

  root.replaceChildren(
    h('div', { class: 'masthead' }, h('div', null, sub, h('h1', { class: 'display' }, 'Membros')),
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Meu perfil', onClick: () => go('#perfil') }, avatar(state.me, 36))),
    h('div', { class: 'scroll' }, h('div', { class: 'pad' },
      h('button', { type: 'button', class: 'group-card', onClick: () => viewer('img/conselho.jpg') },
        logo(64),
        h('div', null, h('b', { class: 'display' }, state.group?.name || 'Conselho'), h('span', { class: 'small muted' }, `${state.members.size} ${state.members.size === 1 ? 'membro' : 'membros'}`))),
      isAdmin ? h('section', { class: 'invite' },
        h('div', { class: 'row between' }, h('span', { class: 'kicker' }, 'Convites'),
          (() => { const b = h('button', { class: 'btn sm primary' }, icon('plus', 16, 2.4), 'Novo convite'); b.addEventListener('click', () => newInvite(b)); return b; })()),
        h('p', { class: 'small muted', style: { margin: 0, lineHeight: 1.5 } }, 'Cada convite entra uma pessoa só. Depois de usado, não vale mais.'),
        invitesBox) : h('p', { class: 'small muted', style: { margin: 0, lineHeight: 1.5 } }, 'Pra chamar alguém pro Conselho, peça um convite à presidência.'),
      h('div', { class: 'rule left' }, h('span', { class: 'kicker' }, 'Quem está no Conselho')),
      list)));
  draw();
  await loadInvites();
  return { destroy: () => offs.forEach((f) => f()) };
}
