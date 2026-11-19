import { sb } from '../sb.js';
import { state } from '../state.js';
import { h, icon, iconBtn, avatar, timeAgo, toast, sheet, errMsg, buzz, skeleton } from '../ui.js';
import { back } from '../nav.js';
import { statusPill, stamp, DECIDED, STATUS } from './conselho.js';
import { PollCard } from './votacao.js';

const numero = (id) => `Nº ${String(id).padStart(2, '0')}`;

export async function PautaScreen(root, route) {
  const id = Number(route.id);
  const cleanups = [];
  const head = h('div', null, skeleton(2));
  const verdictBox = h('div');
  const pollsBox = h('div', { style: { display: 'flex', flexDirection: 'column', gap: '14px' } });
  verdictBox.style.display = 'none';
  const comments = h('div', { style: { display: 'flex', flexDirection: 'column', gap: '18px' } });
  const commentsCount = h('span', { class: 'small muted num' });
  const scroller = h('div', { class: 'scroll' });
  const statusEl = h('span');
  const menuBtn = iconBtn('more', 'Decidir a pauta', () => openMenu());
  menuBtn.style.visibility = 'hidden';
  let pauta = null;
  let lastStatus = null;
  const commentIds = new Set();

  async function loadPauta() {
    const { data, error } = await sb.from('pautas').select('*').eq('id', id).maybeSingle();
    if (error || !data) { head.replaceChildren(h('div', { class: 'empty' }, error ? errMsg(error) : 'Essa pauta não existe mais.')); return false; }
    const justDecided = lastStatus && lastStatus !== data.status && DECIDED.includes(data.status);
    pauta = data;
    lastStatus = data.status;
    const author = state.members.get(pauta.author_id);
    const canManage = pauta.author_id === state.me.id || state.me.role === 'admin';
    menuBtn.style.visibility = canManage ? '' : 'hidden';
    statusEl.replaceChildren(statusPill(pauta.status));
    head.replaceChildren(h('div', { class: 'ata-head' }, ...[
      h('span', { class: 'no' }, `Pauta ${numero(pauta.id)} · apresentada ${timeAgo(pauta.created_at)}`),
      h('h2', { class: 'display' }, pauta.title),
      h('span', { class: 'row small muted', style: { gap: '8px' } }, avatar(author, 24), h('span', null, 'Proposta por ', h('b', { style: { color: 'var(--tx-2)' } }, author?.name || 'alguém'))),
      pauta.description ? h('p', null, pauta.description) : null,
      canManage && pauta.status === 'discussao'
        ? h('a', { class: 'btn line', style: { alignSelf: 'flex-start' }, href: `#nova-votacao?pauta=${pauta.id}` }, icon('vote', 18), 'Colocar em votação') : null,
    ].filter(Boolean)));
    if (DECIDED.includes(pauta.status)) {
      const st = stamp(pauta.status, true);
      if (!justDecided) st.style.animation = 'none';
      verdictBox.replaceChildren(h('div', { class: 'verdict' },
        h('span', { class: 'kicker' }, 'Decisão do Conselho'), st,
        h('span', { class: 'small muted' }, pauta.status === 'encerrada' ? 'Pauta arquivada sem decisão.' : `Registrado em ata. ${STATUS[pauta.status][0]} pelo grupo.`)));
      verdictBox.style.display = '';
      if (justDecided) buzz([20, 60, 30]);
    } else { verdictBox.replaceChildren(); verdictBox.style.display = 'none'; }
    return true;
  }

  async function loadPolls() {
    const { data } = await sb.from('polls').select('id').eq('pauta_id', id).order('id', { ascending: false });
    cleanups.splice(0).forEach((f) => f());
    pollsBox.replaceChildren(...(data || []).map((p) => { const c = PollCard(p.id); cleanups.push(c.destroy); return c.el; }));
  }

  function commentEl(c) {
    const a = state.members.get(c.user_id);
    return h('div', { class: 'comment' }, avatar(a, 34),
      h('div', { class: 'body' },
        h('span', { class: 'row small', style: { gap: '8px' } }, h('b', { style: { color: a?.color || 'var(--gold)' } }, a?.name || 'Alguém'), h('span', { class: 'muted' }, timeAgo(c.created_at))),
        h('span', { class: 'txt' }, c.body)));
  }

  const setCount = () => { commentsCount.textContent = commentIds.size ? `${commentIds.size} ${commentIds.size === 1 ? 'fala' : 'falas'}` : ''; };
  async function loadComments() {
    const { data, error } = await sb.from('pauta_comments').select('*').eq('pauta_id', id).order('created_at');
    if (error) return;
    commentIds.clear();
    data.forEach((c) => commentIds.add(c.id));
    setCount();
    comments.replaceChildren(...(data.length ? data.map(commentEl) : [h('p', { class: 'muted', style: { margin: 0, lineHeight: 1.5 } }, 'Ninguém se manifestou ainda. A palavra está aberta.')]));
  }

  function addComment(c) {
    if (commentIds.has(c.id)) return;
    if (!commentIds.size) comments.replaceChildren();
    commentIds.add(c.id);
    comments.append(commentEl(c));
    setCount();
  }

  function openMenu() {
    const set = async (status, msg) => {
      close();
      const { error } = await sb.from('pautas').update({ status }).eq('id', id);
      if (error) return toast(errMsg(error));
      toast(msg);
      loadPauta();
    };
    const close = sheet(
      h('h3', null, 'O que o Conselho decidiu?'),
      h('a', { class: 'sheet-item', href: `#nova-votacao?pauta=${id}` }, icon('vote', 20), 'Abrir uma votação'),
      h('button', { class: 'sheet-item', onClick: () => set('aprovada', 'Carimbado: aprovada') }, h('span', { style: { color: 'var(--grn)' } }, icon('check', 20, 2.4)), 'Aprovar'),
      h('button', { class: 'sheet-item', onClick: () => set('rejeitada', 'Carimbado: rejeitada') }, h('span', { style: { color: 'var(--red)' } }, icon('x', 20, 2.4)), 'Rejeitar'),
      h('button', { class: 'sheet-item', onClick: () => set('encerrada', 'Pauta arquivada') }, icon('lock', 20), 'Arquivar sem decidir'),
      pauta && DECIDED.includes(pauta.status) ? h('button', { class: 'sheet-item', onClick: () => set('discussao', 'Pauta reaberta') }, icon('refresh', 20), 'Reabrir a discussão') : null);
  }

  const input = h('input', { type: 'text', placeholder: 'Pedir a palavra…', 'aria-label': 'Comentar na pauta', maxlength: '2000' });
  const form = h('form', { class: 'bottom-input' }, input,
    h('button', { type: 'submit', class: 'icon-btn gold round', 'aria-label': 'Enviar comentário' }, icon('send', 18, 2)));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = input.value.trim();
    if (!body) return;
    input.value = '';
    const { data, error } = await sb.from('pauta_comments').insert({ pauta_id: id, body }).select().single();
    if (error) { input.value = body; return toast(errMsg(error)); }
    buzz(6);
    addComment(data);
    scroller.scrollTo({ top: scroller.scrollHeight, behavior: 'smooth' });
  });

  const rt = sb.channel(`pauta-${id}-${Date.now()}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'pauta_comments', filter: `pauta_id=eq.${id}` }, (p) => addComment(p.new))
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'pautas', filter: `id=eq.${id}` }, () => loadPauta())
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'polls', filter: `pauta_id=eq.${id}` }, () => loadPolls())
    .subscribe();

  scroller.append(h('div', { class: 'pad', style: { gap: '20px' } }, head, verdictBox, pollsBox,
    h('div', { class: 'rule left' }, h('span', { class: 'kicker' }, 'Discussão'), commentsCount),
    comments));
  root.replaceChildren(
    h('header', { class: 'topbar' }, iconBtn('back', 'Voltar', () => back('#conselho')),
      h('div', { class: 'grow row', style: { gap: '10px' } }, h('b', { class: 'serif', style: { fontSize: '18px' } }, numero(id)), statusEl),
      menuBtn),
    scroller, form);

  if (await loadPauta()) await Promise.all([loadPolls(), loadComments()]);
  return { destroy() { sb.removeChannel(rt); cleanups.forEach((f) => f()); } };
}

export async function NovaPauta(root) {
  const title = h('textarea', { class: 'input display', rows: 2, placeholder: 'Qual é a pauta?', maxlength: '140', required: true, style: { fontSize: '24px', minHeight: '0', padding: '14px 16px', lineHeight: '1.25' } });
  const desc = h('textarea', { class: 'input', rows: 6, placeholder: 'Explica a ideia: valores, datas, quem cuida do quê… (opcional)', maxlength: '4000' });
  const err = h('p', { class: 'err', role: 'alert' });
  const btn = h('button', { class: 'btn primary block', type: 'submit' }, icon('feather', 18, 2), 'Apresentar ao Conselho');
  const form = h('form', { class: 'pad' },
    h('p', { class: 'muted', style: { margin: 0, lineHeight: 1.55 } }, 'A pauta entra na ata do grupo e aparece no chat. O pessoal discute e, se precisar, você coloca em votação.'),
    h('label', { class: 'field' }, h('span', { class: 'label' }, 'Título'), title),
    h('label', { class: 'field' }, h('span', { class: 'label' }, 'Detalhes'), desc),
    err, btn);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    err.textContent = '';
    if (title.value.trim().length < 3) { err.textContent = 'O título precisa de pelo menos 3 letras.'; return; }
    btn.disabled = true;
    const { data: id, error } = await sb.rpc('create_pauta', { p_title: title.value.trim().replace(/\s+/g, ' '), p_description: desc.value.trim() });
    btn.disabled = false;
    if (error) { err.textContent = errMsg(error); return; }
    buzz(20);
    toast('Pauta apresentada.');
    location.replace(`#pauta/${id}`);
  });
  root.replaceChildren(
    h('header', { class: 'topbar' }, iconBtn('x', 'Cancelar', () => back('#conselho')), h('h1', { class: 'grow' }, 'Nova pauta')),
    h('div', { class: 'scroll' }, form));
  title.focus({ preventScroll: true });
}
