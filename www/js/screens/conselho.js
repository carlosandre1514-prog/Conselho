import { sb } from '../sb.js';
import { state } from '../state.js';
import { h, icon, avatar, timeAgo, timeLeft, errMsg } from '../ui.js';

export const STATUS = {
  discussao: ['Em discussão', 'mu'],
  votacao: ['● Em votação', 'gold'],
  aprovada: ['✓ Aprovada', 'grn'],
  rejeitada: ['✕ Rejeitada', 'red'],
  encerrada: ['Encerrada', 'mu'],
};
export const statusPill = (s) => { const [t, c] = STATUS[s] || STATUS.discussao; return h('span', { class: `pill ${c}` }, t); };

const FILTERS = [['todas', 'Todas'], ['votacao', 'Em votação'], ['discussao', 'Em discussão'], ['decididas', 'Decididas']];

export default async function Conselho(root) {
  let filter = sessionStorage.getItem('conselho-filter') || 'todas';
  let pautas = [];
  const statsEl = h('div', { class: 'stats' });
  const chips = h('div', { class: 'chips', role: 'tablist' });
  const list = h('div', { style: { display: 'flex', flexDirection: 'column', gap: '12px' } }, h('div', { class: 'spinner', style: { alignSelf: 'center' } }));

  function draw() {
    const count = (f) => pautas.filter(f).length;
    statsEl.replaceChildren(
      h('div', { class: 'card stat' }, h('b', null, count((p) => p.status === 'discussao')), h('span', null, 'Em discussão')),
      h('div', { class: 'card stat' }, h('b', { style: { color: 'var(--gold)' } }, count((p) => p.status === 'votacao')), h('span', null, 'Em votação')),
      h('div', { class: 'card stat' }, h('b', { style: { color: 'var(--grn)' } }, count((p) => ['aprovada', 'rejeitada', 'encerrada'].includes(p.status))), h('span', null, 'Decididas')));
    chips.replaceChildren(...FILTERS.map(([id, label]) => h('button', {
      type: 'button', role: 'tab', 'aria-selected': String(filter === id), class: `chip ${filter === id ? 'on' : ''}`,
      onClick: () => { filter = id; sessionStorage.setItem('conselho-filter', id); draw(); },
    }, label)));
    const shown = pautas.filter((p) => filter === 'todas' || (filter === 'decididas' ? ['aprovada', 'rejeitada', 'encerrada'].includes(p.status) : p.status === filter));
    if (!shown.length) {
      list.replaceChildren(h('div', { class: 'empty' }, pautas.length ? 'Nada nesse filtro.' : 'Nenhuma pauta ainda. Que tal abrir a primeira?'));
      return;
    }
    list.replaceChildren(...shown.map(card));
  }

  function card(p) {
    const author = state.members.get(p.author_id);
    const comments = p.pauta_comments?.[0]?.count ?? 0;
    const poll = (p.polls || []).sort((a, b) => b.id - a.id)[0];
    const total = state.members.size || 1;
    return h('a', { class: 'card pauta-card', href: `#pauta/${p.id}` },
      h('span', { class: 'row between' }, statusPill(p.status), h('span', { class: 'small muted', style: { fontWeight: 700 } }, `#${p.id}`)),
      h('span', { class: 't' }, p.title),
      poll && p.status === 'votacao' ? [
        h('span', { class: 'bar' }, h('i', { style: { width: Math.round((poll.voters / total) * 100) + '%' } })),
        h('span', { class: 'row small muted', style: { gap: '6px' } }, icon('clock', 13, 2),
          `${poll.voters} de ${total} votaram${poll.closes_at ? ' · ' + timeLeft(poll.closes_at) : ''}`),
      ] : null,
      h('span', { class: 'row between' },
        h('span', { class: 'row small muted', style: { gap: '8px' } }, avatar(author, 24), `${author?.name?.split(' ')[0] || 'Alguém'} · ${timeAgo(p.created_at)}`),
        h('span', { class: 'row small muted', style: { gap: '5px', fontWeight: 700 } }, icon('chat', 15), comments)));
  }

  async function load() {
    const { data, error } = await sb.from('pautas')
      .select('*, pauta_comments(count), polls(id, voters, closes_at)')
      .order('created_at', { ascending: false }).limit(200);
    if (error) { list.replaceChildren(h('div', { class: 'empty' }, errMsg(error))); return; }
    pautas = data;
    draw();
  }

  const rt = sb.channel(`pautas-${Date.now()}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'pautas', filter: `group_id=eq.${state.group.id}` }, load)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'polls', filter: `group_id=eq.${state.group.id}` }, load)
    .subscribe();

  root.replaceChildren(
    h('div', { class: 'big-title' }, h('div', null, h('h1', null, 'Conselho'), h('p', null, 'Pautas e decisões do grupo')),
      h('a', { class: 'icon-btn', href: '#nova-votacao', 'aria-label': 'Nova votação', title: 'Nova votação' }, icon('vote', 20))),
    h('div', { class: 'scroll' }, h('div', { class: 'pad', style: { paddingBottom: '96px' } }, statsEl, chips, list)),
    h('a', { class: 'fab', href: '#nova-pauta' }, icon('plus', 20, 2.4), 'Nova pauta'));
  draw();
  await load();
  return { destroy: () => sb.removeChannel(rt) };
}
