import { sb } from '../sb.js';
import { state } from '../state.js';
import { h, icon, iconBtn, avatar, timeAgo, toast, sheet, errMsg } from '../ui.js';
import { back } from '../nav.js';
import { statusPill } from './conselho.js';
import { PollCard } from './votacao.js';

export async function PautaScreen(root, route) {
  const id = Number(route.id);
  const cleanups = [];
  const head = h('div', { style: { display: 'flex', flexDirection: 'column', gap: '12px' } }, h('div', { class: 'spinner' }));
  const pollsBox = h('div', { style: { display: 'flex', flexDirection: 'column', gap: '14px' } });
  const comments = h('div', { style: { display: 'flex', flexDirection: 'column', gap: '14px' } });
  const commentsTitle = h('span', { class: 'small muted' });
  const scroller = h('div', { class: 'scroll' });
  const subtitle = h('span', { class: 'small', style: { fontWeight: 700, color: 'var(--gold)' } });
  const menuBtn = iconBtn('more', 'Opções da pauta', () => openMenu());
  menuBtn.style.visibility = 'hidden';
  let pauta = null;
  const commentIds = new Set();

  async function loadPauta() {
    const { data, error } = await sb.from('pautas').select('*').eq('id', id).maybeSingle();
    if (error || !data) { head.replaceChildren(h('div', { class: 'empty' }, error ? errMsg(error) : 'Pauta não encontrada.')); return false; }
    pauta = data;
    const author = state.members.get(pauta.author_id);
    const canManage = pauta.author_id === state.me.id || state.me.role === 'admin';
    menuBtn.style.visibility = canManage ? '' : 'hidden';
    subtitle.replaceChildren(statusPill(pauta.status));
    head.replaceChildren(...[
      h('h2', { style: { margin: 0, fontSize: '25px', fontWeight: 800, lineHeight: '31px', letterSpacing: '-.02em' } }, pauta.title),
      h('span', { class: 'row small muted', style: { gap: '8px' } }, avatar(author, 26), `Proposta por ${author?.name || 'alguém'} · ${timeAgo(pauta.created_at)}`),
      pauta.description ? h('p', { style: { margin: 0, fontSize: '15px', lineHeight: '22px', color: 'var(--tx-2)', whiteSpace: 'pre-wrap' } }, pauta.description) : null,
      canManage && ['discussao', 'votacao'].includes(pauta.status)
        ? h('a', { class: 'btn ghost block', href: `#nova-votacao?pauta=${pauta.id}` }, icon('vote', 18), 'Abrir uma votação nesta pauta') : null].filter(Boolean));
    return true;
  }

  async function loadPolls() {
    const { data } = await sb.from('polls').select('id').eq('pauta_id', id).order('id', { ascending: false });
    cleanups.splice(0).forEach((f) => f());
    pollsBox.replaceChildren(...(data || []).map((p) => { const c = PollCard(p.id); cleanups.push(c.destroy); return c.el; }));
  }

  function commentEl(c) {
    const a = state.members.get(c.user_id);
    return h('div', { class: 'comment' }, avatar(a, 32),
      h('div', { class: 'body' },
        h('span', { class: 'row small', style: { gap: '6px' } }, h('b', { style: { color: a?.color || 'var(--gold)' } }, a?.name || 'Alguém'), h('span', { class: 'muted' }, timeAgo(c.created_at))),
        h('span', { class: 'txt' }, c.body)));
  }

  async function loadComments() {
    const { data, error } = await sb.from('pauta_comments').select('*').eq('pauta_id', id).order('created_at');
    if (error) return;
    commentIds.clear();
    data.forEach((c) => commentIds.add(c.id));
    commentsTitle.textContent = `${data.length} ${data.length === 1 ? 'comentário' : 'comentários'}`;
    comments.replaceChildren(...(data.length ? data.map(commentEl) : [h('p', { class: 'muted', style: { margin: 0 } }, 'Ninguém comentou ainda.')]));
  }

  function addComment(c) {
    if (commentIds.has(c.id)) return;
    if (!commentIds.size) comments.replaceChildren();
    commentIds.add(c.id);
    comments.append(commentEl(c));
    commentsTitle.textContent = `${commentIds.size} ${commentIds.size === 1 ? 'comentário' : 'comentários'}`;
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
      h('h3', null, 'Decisão da pauta'),
      h('a', { class: 'sheet-item', href: `#nova-votacao?pauta=${id}` }, icon('vote', 20), 'Abrir votação'),
      h('button', { class: 'sheet-item', onClick: () => set('aprovada', 'Pauta aprovada') }, h('span', { style: { color: 'var(--grn)' } }, icon('check', 20)), 'Marcar como aprovada'),
      h('button', { class: 'sheet-item', onClick: () => set('rejeitada', 'Pauta rejeitada') }, h('span', { style: { color: 'var(--red)' } }, icon('x', 20)), 'Marcar como rejeitada'),
      h('button', { class: 'sheet-item', onClick: () => set('encerrada', 'Pauta encerrada') }, icon('lock', 20), 'Encerrar sem decisão'),
      h('button', { class: 'sheet-item', onClick: () => set('discussao', 'Pauta voltou pra discussão') }, icon('refresh', 20), 'Voltar pra discussão'));
  }

  const input = h('input', { type: 'text', placeholder: 'Comentar na pauta…', 'aria-label': 'Comentar na pauta', maxlength: '2000' });
  const form = h('form', { class: 'bottom-input' }, input,
    h('button', { type: 'submit', class: 'icon-btn gold round', 'aria-label': 'Enviar comentário' }, icon('send', 18, 2)));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = input.value.trim();
    if (!body) return;
    input.value = '';
    const { data, error } = await sb.from('pauta_comments').insert({ pauta_id: id, body }).select().single();
    if (error) { input.value = body; return toast(errMsg(error)); }
    addComment(data);
    scroller.scrollTop = scroller.scrollHeight;
  });

  const rt = sb.channel(`pauta-${id}-${Date.now()}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'pauta_comments', filter: `pauta_id=eq.${id}` }, (p) => addComment(p.new))
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'pautas', filter: `id=eq.${id}` }, () => loadPauta())
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'polls', filter: `pauta_id=eq.${id}` }, () => loadPolls())
    .subscribe();

  scroller.append(h('div', { class: 'pad' }, head, pollsBox,
    h('div', { class: 'row between', style: { marginTop: '6px' } }, h('h2', { style: { margin: 0, fontSize: '17px', fontWeight: 800 } }, 'Discussão'), commentsTitle),
    comments));
  root.replaceChildren(
    h('header', { class: 'topbar' }, iconBtn('back', 'Voltar', () => back('#conselho')),
      h('div', { class: 'grow', style: { display: 'flex', flexDirection: 'column', gap: '2px' } }, h('b', { style: { fontSize: '16px' } }, `Pauta #${id}`), subtitle),
      menuBtn),
    scroller, form);

  if (await loadPauta()) await Promise.all([loadPolls(), loadComments()]);
  return { destroy() { sb.removeChannel(rt); cleanups.forEach((f) => f()); } };
}

export async function NovaPauta(root) {
  const title = h('input', { class: 'input', placeholder: 'Ex.: Vaquinha pra caixa de som', maxlength: '140', required: true });
  const desc = h('textarea', { class: 'input', rows: 6, placeholder: 'Explique a ideia, valores, prazos… (opcional)', maxlength: '4000' });
  const err = h('p', { class: 'err', role: 'alert' });
  const btn = h('button', { class: 'btn primary block', type: 'submit' }, 'Apresentar pauta');
  const form = h('form', { class: 'pad' },
    h('p', { class: 'muted', style: { margin: 0, lineHeight: 1.5 } }, 'A pauta aparece no Conselho e no chat. O grupo discute nos comentários e, se precisar, você abre uma votação.'),
    h('label', { class: 'field' }, h('span', { class: 'label' }, 'Título'), title),
    h('label', { class: 'field' }, h('span', { class: 'label' }, 'Descrição'), desc),
    err, btn);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    err.textContent = '';
    if (title.value.trim().length < 3) { err.textContent = 'O título precisa ter pelo menos 3 letras.'; return; }
    btn.disabled = true;
    const { data: id, error } = await sb.rpc('create_pauta', { p_title: title.value.trim(), p_description: desc.value.trim() });
    btn.disabled = false;
    if (error) { err.textContent = errMsg(error); return; }
    toast('Pauta apresentada!');
    location.replace(`#pauta/${id}`);
  });
  root.replaceChildren(
    h('header', { class: 'topbar' }, iconBtn('back', 'Cancelar', () => back('#conselho')), h('h1', { class: 'grow' }, 'Nova pauta')),
    h('div', { class: 'scroll' }, form));
  title.focus({ preventScroll: true });
}
