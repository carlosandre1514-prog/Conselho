import { sb } from '../sb.js';
import { state } from '../state.js';
import { h, icon, iconBtn, timeLeft, toast, switchToggle, errMsg } from '../ui.js';
import { back } from '../nav.js';

// ---------- cartão de votação (usado na pauta e na tela da votação) ----------
export function PollCard(pollId) {
  const el = h('section', { class: 'card poll', 'aria-label': 'Votação' }, h('div', { class: 'spinner' }));
  let poll = null, results = [], picked = new Set(), sending = false;

  async function load() {
    const [{ data: p, error: e1 }, { data: r, error: e2 }] = await Promise.all([
      sb.from('polls').select('*').eq('id', pollId).maybeSingle(),
      sb.rpc('poll_results', { p_poll_id: Number(pollId) }),
    ]);
    if (e1 || e2) { el.replaceChildren(h('p', { class: 'muted' }, errMsg(e1 || e2))); return; }
    if (!p) { el.replaceChildren(h('p', { class: 'muted' }, 'Votação não encontrada.')); return; }
    poll = p; results = r || [];
    if (!sending) picked = new Set(results.filter((x) => x.mine).map((x) => x.option_id));
    draw();
  }

  async function vote(ids) {
    sending = true;
    const { error } = await sb.rpc('vote', { p_poll_id: poll.id, p_option_ids: ids });
    sending = false;
    if (error) { toast(errMsg(error)); await load(); return; }
    toast(ids.length ? 'Voto registrado' : 'Voto retirado');
    await load();
  }

  function draw() {
    const closed = poll.closes_at && new Date(poll.closes_at) < new Date();
    const totalVotes = results.reduce((a, x) => a + x.votes, 0) || 0;
    const members = state.members.size || 1;
    const myVotes = results.filter((x) => x.mine);
    const opts = results.map((o) => {
      const sel = picked.has(o.option_id);
      const pct = totalVotes ? Math.round((o.votes / totalVotes) * 100) : 0;
      const b = h('button', { type: 'button', class: `opt ${sel ? 'sel' : ''} ${closed ? 'closed' : ''}`, 'aria-pressed': String(sel) },
        h('span', { class: 'top' },
          h('span', { class: 'row', style: { gap: '10px', minWidth: 0 } },
            h('span', { class: `radio ${poll.multiple ? 'sq' : ''}` }, sel ? icon('check', 12, 3.2) : null),
            h('span', { class: 'lab' }, o.label),
            h('span', { class: 'small muted' }, `${o.votes} ${o.votes === 1 ? 'voto' : 'votos'}`)),
          h('span', { class: 'pct' }, pct + '%')),
        h('span', { class: 'bar' }, h('i', { style: { width: pct + '%' } })),
        !poll.anonymous && o.voters?.length ? h('span', { class: 'names' }, o.voters.join(', ')) : null);
      if (!closed) b.addEventListener('click', () => {
        if (poll.multiple) {
          sel ? picked.delete(o.option_id) : picked.add(o.option_id);
          draw();
        } else {
          picked = new Set([o.option_id]);
          draw();
          vote([o.option_id]);
        }
      });
      return b;
    });
    const changed = poll.multiple && (picked.size !== myVotes.length || myVotes.some((x) => !picked.has(x.option_id)));
    el.replaceChildren(...[
      h('div', { class: 'row between' },
        h('span', { class: 'row', style: { gap: '8px' } }, h('span', { style: { color: 'var(--gold)' } }, icon('vote', 18)), h('b', null, 'Votação')),
        h('span', { class: 'pill mu' }, icon(poll.anonymous ? 'lock' : 'users', 12, 2), poll.anonymous ? 'Anônima' : 'Aberta')),
      h('span', { class: 'q' }, poll.question),
      h('span', { class: 'row small muted', style: { gap: '6px' } }, icon('clock', 13, 2),
        closed ? 'Votação encerrada' : poll.closes_at ? timeLeft(poll.closes_at) : 'Sem prazo',
        poll.multiple ? ' · pode marcar mais de uma' : ' · toque pra votar ou mudar o voto'),
      ...opts,
      changed && !closed ? h('button', { class: 'btn primary block', onClick: () => vote([...picked]) }, 'Confirmar votos') : null,
      h('span', { class: 'small muted' }, `${poll.voters} de ${members} votaram${myVotes.length ? ' · você já votou' : ''}`)].filter(Boolean));
  }

  const rt = sb.channel(`poll-${pollId}-${Math.random().toString(36).slice(2)}`)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'polls', filter: `id=eq.${pollId}` }, () => { if (!sending) load(); })
    .subscribe();
  load();
  return { el, destroy: () => sb.removeChannel(rt), get poll() { return poll; } };
}

// ---------- tela de uma votação ----------
export async function VotacaoScreen(root, route) {
  const card = PollCard(route.id);
  const link = h('div');
  root.replaceChildren(
    h('header', { class: 'topbar' }, iconBtn('back', 'Voltar', () => back('#chat')), h('h1', { class: 'grow' }, `Votação #${route.id}`)),
    h('div', { class: 'scroll' }, h('div', { class: 'pad' }, card.el, link)));
  const { data } = await sb.from('polls').select('pauta_id').eq('id', route.id).maybeSingle();
  if (data?.pauta_id) link.replaceChildren(h('a', { class: 'btn ghost block', href: `#pauta/${data.pauta_id}` }, icon('landmark', 18), 'Ver a pauta e a discussão'));
  return { destroy: card.destroy };
}

// ---------- criar votação ----------
export async function NovaVotacao(root, route) {
  const pautaFromRoute = route.q.get('pauta');
  const question = h('input', { class: 'input', placeholder: 'Ex.: Onde vai ser o churrasco?', maxlength: '200', required: true });
  const optsBox = h('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } });
  let anonymous = true, multiple = false;
  const hours = h('select', { 'aria-label': 'Prazo' },
    [['0', 'Sem prazo'], ['1', '1 hora'], ['6', '6 horas'], ['24', '24 horas'], ['48', '48 horas'], ['168', '7 dias']]
      .map(([v, t]) => h('option', { value: v }, t)));
  hours.value = '48';
  const pautaSel = h('select', { 'aria-label': 'Vincular à pauta' }, h('option', { value: '' }, 'Nenhuma'));
  const err = h('p', { class: 'err', role: 'alert' });

  const addOpt = (val = '') => {
    if (optsBox.children.length >= 10) return toast('No máximo 10 opções.');
    const input = h('input', { placeholder: `Opção ${optsBox.children.length + 1}`, maxlength: '100', value: val, 'aria-label': `Opção ${optsBox.children.length + 1}` });
    const row = h('div', { class: 'opt-row' }, h('b', null, String(optsBox.children.length + 1)), input,
      iconBtn('x', 'Remover opção', () => { if (optsBox.children.length <= 2) return toast('Precisa de pelo menos 2 opções.'); row.remove(); renumber(); }, 'plain'));
    optsBox.append(row);
    return input;
  };
  const renumber = () => [...optsBox.children].forEach((r, i) => { r.querySelector('b').textContent = String(i + 1); r.querySelector('input').placeholder = `Opção ${i + 1}`; });
  addOpt(); addOpt();

  const submit = h('button', { class: 'btn primary block', type: 'submit' }, 'Abrir votação');
  const form = h('form', { class: 'pad' },
    h('label', { class: 'field' }, h('span', { class: 'label' }, 'Pergunta'), question),
    h('div', { class: 'field' }, h('span', { class: 'label' }, 'Opções'), optsBox,
      h('button', { type: 'button', class: 'add-opt', onClick: () => addOpt().focus() }, icon('plus', 18, 2.2), 'Adicionar opção')),
    h('div', { class: 'field' }, h('span', { class: 'label' }, 'Configurações'),
      h('div', { class: 'card settings-list' },
        h('div', { class: 'setting' }, h('span', { class: 'ib' }, icon('lock', 18)),
          h('span', { class: 'grow' }, h('div', { class: 'tt' }, 'Votação anônima'), h('div', { class: 'st', id: 'anon-st' }, 'Ninguém vê quem votou em quê')),
          switchToggle(true, (v) => { anonymous = v; form.querySelector('#anon-st').textContent = v ? 'Ninguém vê quem votou em quê' : 'Todos veem quem votou em quê'; }, 'Votação anônima')),
        h('div', { class: 'setting' }, h('span', { class: 'ib' }, icon('vote', 18)),
          h('span', { class: 'grow' }, h('div', { class: 'tt' }, 'Várias escolhas'), h('div', { class: 'st' }, 'Cada um pode marcar mais de uma')),
          switchToggle(false, (v) => { multiple = v; }, 'Várias escolhas')),
        h('label', { class: 'setting' }, h('span', { class: 'ib' }, icon('clock', 18)),
          h('span', { class: 'grow' }, h('div', { class: 'tt' }, 'Prazo'), h('div', { class: 'st' }, 'Encerra sozinha no fim')), hours),
        h('label', { class: 'setting' }, h('span', { class: 'ib' }, icon('landmark', 18)),
          h('span', { class: 'grow' }, h('div', { class: 'tt' }, 'Vincular à pauta'), h('div', { class: 'st' }, 'A pauta passa pra "em votação"')), pautaSel))),
    h('p', { class: 'small muted', style: { margin: 0 } }, 'Depois de aberta, a votação não pode ser editada.'),
    err, submit);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    err.textContent = '';
    const options = [...optsBox.querySelectorAll('input')].map((i) => i.value.trim()).filter(Boolean);
    if (question.value.trim().length < 3) { err.textContent = 'Escreva a pergunta.'; return; }
    if (options.length < 2) { err.textContent = 'Preencha pelo menos 2 opções.'; return; }
    if (new Set(options.map((o) => o.toLowerCase())).size !== options.length) { err.textContent = 'Tem opção repetida.'; return; }
    submit.disabled = true;
    const { data: id, error } = await sb.rpc('create_poll', {
      p_question: question.value.trim(), p_options: options, p_anonymous: anonymous, p_multiple: multiple,
      p_hours: Number(hours.value) || null, p_pauta_id: pautaSel.value ? Number(pautaSel.value) : null,
    });
    submit.disabled = false;
    if (error) { err.textContent = errMsg(error); return; }
    toast('Votação aberta!');
    location.replace(pautaSel.value ? `#pauta/${pautaSel.value}` : `#votacao/${id}`);
  });

  root.replaceChildren(
    h('header', { class: 'topbar' }, iconBtn('back', 'Cancelar', () => back('#conselho')), h('h1', { class: 'grow' }, 'Nova votação')),
    h('div', { class: 'scroll' }, form));
  question.focus({ preventScroll: true });

  const { data: pautas } = await sb.from('pautas').select('id,title,status').in('status', ['discussao', 'votacao']).order('created_at', { ascending: false }).limit(50);
  (pautas || []).forEach((p) => pautaSel.append(h('option', { value: String(p.id) }, `#${p.id} · ${p.title.slice(0, 40)}`)));
  if (pautaFromRoute) pautaSel.value = pautaFromRoute;
}
