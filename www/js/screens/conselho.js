import { sb } from '../sb.js';
import { state } from '../state.js';
import { h, icon, avatar, timeAgo, timeLeft, errMsg, skeleton } from '../ui.js';

export const STATUS = {
  discussao: ['Em discussão', 'mu'],
  votacao: ['Em votação', 'gold'],
  aprovada: ['Aprovada', 'grn'],
  rejeitada: ['Rejeitada', 'red'],
  encerrada: ['Arquivada', 'mu'],
};
export const DECIDED = ['aprovada', 'rejeitada', 'encerrada'];
export const statusPill = (s) => {
  const [t, c] = STATUS[s] || STATUS.discussao;
  return h('span', { class: `pill ${c}` }, s === 'votacao' ? h('span', { class: 'live-dot' }) : null, t);
};
export const stamp = (s, big = false) => {
  if (!DECIDED.includes(s)) return null;
  const [t, c] = STATUS[s];
  return h('span', { class: `stamp ${c} ${big ? 'big' : ''}`, 'aria-label': t }, t.toUpperCase());
};

const FILTERS = [['todas', 'Todas'], ['votacao', 'Em votação'], ['discussao', 'Em discussão'], ['decididas', 'Decididas']];

export default async function Conselho(root) {
  let filter = sessionStorage.getItem('conselho-filter') || 'todas';
  let pautas = null;
  const tally = h('div', { class: 'tally' });
  const chips = h('div', { class: 'chips', role: 'tablist' });
  const list = h('div', { class: 'dossier' }, skeleton(4));

  function draw() {
    if (!pautas) return;
    const count = (f) => pautas.filter(f).length;
    tally.replaceChildren(
      h('div', null, h('b', null, count((p) => p.status === 'discussao')), h('span', null, 'em discussão')),
      h('div', null, h('b', { style: { color: 'var(--gold)' } }, count((p) => p.status === 'votacao')), h('span', null, 'em votação')),
      h('div', null, h('b', { style: { color: 'var(--grn)' } }, count((p) => DECIDED.includes(p.status))), h('span', null, 'decididas')));
    chips.replaceChildren(...FILTERS.map(([id, label]) => h('button', {
      type: 'button', role: 'tab', 'aria-selected': String(filter === id), class: `chip ${filter === id ? 'on' : ''}`,
      onClick: () => { filter = id; sessionStorage.setItem('conselho-filter', id); draw(); },
    }, label)));
    const shown = pautas.filter((p) => filter === 'todas' || (filter === 'decididas' ? DECIDED.includes(p.status) : p.status === filter));
    if (!shown.length) {
      list.replaceChildren(pautas.length
        ? h('div', { class: 'empty' }, 'Nada por aqui nesse filtro.')
        : h('div', { class: 'empty' }, h('span', { class: 'display' }, 'Pauta zerada.'), 'Ninguém propôs nada ainda. Tem churrasco pra marcar? Vaquinha pra fazer? Abre a primeira pauta.'));
      return;
    }
    list.replaceChildren(...shown.map(doc));
  }

  function doc(p) {
    const author = state.members.get(p.author_id);
    const comments = p.pauta_comments?.[0]?.count ?? 0;
    const poll = (p.polls || []).sort((a, b) => b.id - a.id)[0];
    const total = state.members.size || 1;
    const decided = DECIDED.includes(p.status);
    return h('a', { class: `doc ${decided ? 'decided' : ''}`, href: `#pauta/${p.id}` },
      h('span', { class: 'no' }, 'Nº', h('b', null, String(p.id).padStart(2, '0'))),
      h('span', { class: 'body' },
        h('span', { class: 'row', style: { gap: '8px' } }, decided ? null : statusPill(p.status)),
        h('span', { class: 't' }, p.title),
        poll && p.status === 'votacao' ? h('span', { class: 'meter' },
          h('span', { class: 'track' }, h('i', { style: { width: Math.round((poll.voters / total) * 100) + '%' } })),
          h('span', { class: 'num' }, `${poll.voters}/${total}`),
          poll.closes_at ? h('span', null, '· ' + timeLeft(poll.closes_at).replace('encerra em ', 'faltam ')) : null) : null,
        h('span', { class: 'foot' },
          avatar(author, 20), h('span', null, author?.name?.split(' ')[0] || 'Alguém'), h('span', { class: 'sep' }), h('span', null, timeAgo(p.created_at)),
          h('span', { class: 'grow' }),
          comments && !decided ? h('span', { class: 'row', style: { gap: '4px' } }, icon('chat', 14), comments) : null)),
      stamp(p.status));
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
    h('div', { class: 'masthead' },
      h('div', null, h('span', { class: 'kicker' }, `Ata do grupo · ${new Date().getFullYear()}`), h('h1', { class: 'display' }, 'Conselho')),
      h('a', { class: 'icon-btn filled', href: '#nova-votacao', 'aria-label': 'Nova votação rápida', title: 'Votação rápida' }, icon('vote', 20))),
    h('div', { class: 'scroll' }, h('div', { class: 'pad', style: { paddingBottom: '100px', gap: '16px' } }, tally, chips, list)),
    h('a', { class: 'fab', href: '#nova-pauta' }, icon('feather', 19, 2), 'Propor pauta'));
  await load();
  return { destroy: () => sb.removeChannel(rt) };
}
