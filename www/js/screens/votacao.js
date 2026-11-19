import { sb } from '../sb.js';
import { state } from '../state.js';
import { h, icon, iconBtn, avatar, timeLeft, toast, switchToggle, errMsg, buzz, skeleton } from '../ui.js';
import { back } from '../nav.js';

const faces = (ids, size = 22, max = 5) => h('span', { class: 'faces' },
  (ids || []).slice(0, max).map((id) => avatar(state.members.get(id), size)));

// ---------- cartão de votação (usado na pauta e na tela da votação) ----------
export function PollCard(pollId) {
  const el = h('section', { class: 'panel poll', 'aria-label': 'Votação' }, skeleton(2));
  let poll = null, results = [], picked = new Set(), sending = false, tick = null;

  async function load() {
    const [{ data: p, error: e1 }, { data: r, error: e2 }] = await Promise.all([
      sb.from('polls').select('*').eq('id', pollId).maybeSingle(),
      sb.rpc('poll_results', { p_poll_id: Number(pollId) }),
    ]);
    if (e1 || e2) { el.replaceChildren(h('p', { class: 'muted' }, errMsg(e1 || e2))); return; }
    if (!p) { el.replaceChildren(h('p', { class: 'muted' }, 'Essa votação não existe mais.')); return; }
    poll = p; results = r || [];
    if (!sending) picked = new Set(results.filter((x) => x.mine).map((x) => x.option_id));
    draw();
  }

  async function vote(ids) {
    sending = true;
    buzz(12);
    const { error } = await sb.rpc('vote', { p_poll_id: poll.id, p_option_ids: ids });
    sending = false;
    if (error) { toast(errMsg(error)); await load(); return; }
    toast(ids.length ? 'Voto computado' : 'Voto retirado');
    await load();
  }

  function draw() {
    clearInterval(tick);
    const closed = poll.closes_at && new Date(poll.closes_at) < new Date();
    const totalVotes = results.reduce((a, x) => a + x.votes, 0) || 0;
    const members = state.members.size || 1;
    const myVotes = results.filter((x) => x.mine);
    const max = Math.max(0, ...results.map((x) => x.votes));
    const winners = closed && max > 0 ? results.filter((x) => x.votes === max) : [];

    const opts = results.map((o) => {
      const sel = picked.has(o.option_id);
      const win = winners.some((w) => w.option_id === o.option_id);
      const pct = totalVotes ? Math.round((o.votes / totalVotes) * 100) : 0;
      const b = h('button', { type: 'button', class: `opt ${sel ? 'sel' : ''} ${win ? 'win' : ''} ${closed ? 'closed' : ''}`, 'aria-pressed': String(sel) },
        h('span', { class: 'fill', style: { width: pct + '%' } }),
        h('span', { class: 'top' },
          h('span', { class: 'row', style: { gap: '12px', minWidth: 0 } },
            closed ? null : h('span', { class: `radio ${poll.multiple ? 'sq' : ''}` }, sel ? icon('check', 13, 3.2) : null),
            h('span', { class: 'lab' }, o.label)),
          h('span', { class: 'pct' }, pct + '%')),
        h('span', { class: 'voters' },
          !poll.anonymous && o.voter_ids?.length ? faces(o.voter_ids, 22) : null,
          h('span', { title: !poll.anonymous && o.voters?.length ? o.voters.join(', ') : null }, `${o.votes} ${o.votes === 1 ? 'voto' : 'votos'}`)));
      if (!closed) b.addEventListener('click', () => {
        if (poll.multiple) { sel ? picked.delete(o.option_id) : picked.add(o.option_id); buzz(6); draw(); }
        else { picked = new Set([o.option_id]); draw(); vote([o.option_id]); }
      });
      return b;
    });

    const changed = poll.multiple && (picked.size !== myVotes.length || myVotes.some((x) => !picked.has(x.option_id)));
    const clock = h('span', { class: 'countdown' });
    const paintClock = () => { clock.textContent = closed ? 'Votação encerrada' : poll.closes_at ? timeLeft(poll.closes_at) : 'Sem prazo pra fechar'; };
    paintClock();
    if (!closed && poll.closes_at) tick = setInterval(() => { if (new Date(poll.closes_at) < new Date()) load(); else paintClock(); }, 30000);

    el.replaceChildren(...[
      h('div', { class: 'row between' },
        h('span', { class: 'kicker', style: { color: closed ? 'var(--mu)' : 'var(--gold)' } }, closed ? 'Resultado' : 'Votação aberta'),
        h('span', { class: 'pill mu plain' }, icon(poll.anonymous ? 'lock' : 'eye', 13, 2), poll.anonymous ? 'Voto secreto' : 'Voto aberto')),
      h('span', { class: 'q' }, poll.question),
      winners.length ? h('div', { class: 'result-banner' },
        h('span', { style: { color: 'var(--grn)' } }, icon('check', 22, 2.6)),
        h('div', { class: 'grow' },
          h('span', { class: 'kicker', style: { color: 'var(--grn)' } }, winners.length > 1 ? 'Empate' : 'Venceu'),
          h('div', { class: 'display' }, winners.map((w) => w.label).join(' e ')),
          h('span', { class: 'small muted' }, `${max} de ${totalVotes} ${totalVotes === 1 ? 'voto' : 'votos'}`))) : null,
      closed && !winners.length ? h('p', { class: 'muted', style: { margin: 0 } }, 'Fechou sem nenhum voto.') : null,
      ...opts,
      changed && !closed ? h('button', { class: 'btn primary block', onClick: () => vote([...picked]) }, 'Confirmar meu voto') : null,
      h('div', { class: 'row small muted', style: { gap: '8px', flexWrap: 'wrap' } },
        icon('clock', 14, 2), clock, h('span', null, '·'),
        h('span', { class: 'num' }, `${poll.voters} de ${members} votaram`),
        myVotes.length && !closed ? h('span', { style: { color: 'var(--gold)' } }, '· seu voto tá aí') : null,
        poll.multiple && !closed ? h('span', null, '· pode marcar mais de uma') : null),
    ].filter(Boolean));
  }

  const rt = sb.channel(`poll-${pollId}-${Math.random().toString(36).slice(2)}`)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'polls', filter: `id=eq.${pollId}` }, () => { if (!sending) load(); })
    .subscribe();
  load();
  return { el, destroy: () => { sb.removeChannel(rt); clearInterval(tick); }, get poll() { return poll; } };
}

// ---------- tela de uma votação ----------
export async function VotacaoScreen(root, route) {
  const card = PollCard(route.id);
  const link = h('div');
  root.replaceChildren(
    h('header', { class: 'topbar' }, iconBtn('back', 'Voltar', () => back('#chat')), h('h1', { class: 'grow' }, 'Votação')),
    h('div', { class: 'scroll' }, h('div', { class: 'pad' }, card.el, link)));
  const { data } = await sb.from('polls').select('pauta_id').eq('id', route.id).maybeSingle();
  if (data?.pauta_id) link.replaceChildren(h('a', { class: 'btn line block', href: `#pauta/${data.pauta_id}` }, icon('assembly', 18), `Ler a pauta Nº ${String(data.pauta_id).padStart(2, '0')} e a discussão`));
  return { destroy: card.destroy };
}

// ---------- criar votação ----------
export async function NovaVotacao(root, route) {
  const pautaFromRoute = route.q.get('pauta');
  const question = h('input', { class: 'input', placeholder: 'Ex.: Onde vai ser o churrasco?', maxlength: '200', required: true });
  const optsBox = h('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } });
  let anonymous = true, multiple = false;
  const hours = h('select', { 'aria-label': 'Prazo' },
    [['0', 'Sem prazo'], ['1', '1 hora'], ['6', '6 horas'], ['24', '1 dia'], ['48', '2 dias'], ['168', '1 semana']]
      .map(([v, t]) => h('option', { value: v }, t)));
  hours.value = '48';
  const pautaSel = h('select', { 'aria-label': 'Vincular à pauta' }, h('option', { value: '' }, 'Nenhuma'));
  const err = h('p', { class: 'err', role: 'alert' });

  const addOpt = (val = '') => {
    if (optsBox.children.length >= 10) { toast('No máximo 10 opções.'); return null; }
    const n = optsBox.children.length + 1;
    const input = h('input', { placeholder: `Opção ${n}`, maxlength: '100', value: val, 'aria-label': `Opção ${n}` });
    const row = h('div', { class: 'opt-row' }, h('b', null, String(n)), input,
      iconBtn('x', 'Remover opção', () => { if (optsBox.children.length <= 2) return toast('Precisa de pelo menos 2 opções.'); row.remove(); renumber(); }));
    optsBox.append(row);
    return input;
  };
  const renumber = () => [...optsBox.children].forEach((r, i) => { r.querySelector('b').textContent = String(i + 1); r.querySelector('input').placeholder = `Opção ${i + 1}`; });
  addOpt(); addOpt();

  const anonSt = h('div', { class: 'st' }, 'Ninguém sabe quem votou em quê');
  const submit = h('button', { class: 'btn primary block', type: 'submit' }, 'Abrir votação');
  const form = h('form', { class: 'pad' },
    h('label', { class: 'field' }, h('span', { class: 'label' }, 'A pergunta'), question),
    h('div', { class: 'field' }, h('span', { class: 'label' }, 'Opções'), optsBox,
      h('button', { type: 'button', class: 'add-opt', onClick: () => addOpt()?.focus() }, icon('plus', 18, 2.2), 'Mais uma opção')),
    h('div', { class: 'field' }, h('span', { class: 'label' }, 'Regras'),
      h('div', { class: 'settings-list' },
        h('div', { class: 'setting' }, h('span', { class: 'ib' }, icon('lock', 18)),
          h('span', { class: 'grow' }, h('div', { class: 'tt' }, 'Voto secreto'), anonSt),
          switchToggle(true, (v) => { anonymous = v; anonSt.textContent = v ? 'Ninguém sabe quem votou em quê' : 'Todo mundo vê quem votou em quê'; }, 'Voto secreto')),
        h('div', { class: 'setting' }, h('span', { class: 'ib' }, icon('vote', 18)),
          h('span', { class: 'grow' }, h('div', { class: 'tt' }, 'Pode marcar várias'), h('div', { class: 'st' }, 'Cada um escolhe mais de uma opção')),
          switchToggle(false, (v) => { multiple = v; }, 'Pode marcar várias')),
        h('label', { class: 'setting' }, h('span', { class: 'ib' }, icon('clock', 18)),
          h('span', { class: 'grow' }, h('div', { class: 'tt' }, 'Fecha em'), h('div', { class: 'st' }, 'Depois disso ninguém vota')), hours),
        h('label', { class: 'setting' }, h('span', { class: 'ib' }, icon('assembly', 18)),
          h('span', { class: 'grow' }, h('div', { class: 'tt' }, 'Pauta'), h('div', { class: 'st' }, 'A pauta vai pra votação')), pautaSel))),
    h('p', { class: 'small muted', style: { margin: 0 } }, 'Depois de aberta, a votação não muda mais.'),
    err, submit);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    err.textContent = '';
    const options = [...optsBox.querySelectorAll('input')].map((i) => i.value.trim()).filter(Boolean);
    if (question.value.trim().length < 3) { err.textContent = 'Escreve a pergunta.'; return; }
    if (options.length < 2) { err.textContent = 'Preenche pelo menos 2 opções.'; return; }
    if (new Set(options.map((o) => o.toLowerCase())).size !== options.length) { err.textContent = 'Tem opção repetida.'; return; }
    submit.disabled = true;
    const { data: id, error } = await sb.rpc('create_poll', {
      p_question: question.value.trim(), p_options: options, p_anonymous: anonymous, p_multiple: multiple,
      p_hours: Number(hours.value) || null, p_pauta_id: pautaSel.value ? Number(pautaSel.value) : null,
    });
    submit.disabled = false;
    if (error) { err.textContent = errMsg(error); return; }
    buzz(20);
    toast('Votação aberta. Agora é com o grupo.');
    location.replace(pautaSel.value ? `#pauta/${pautaSel.value}` : `#votacao/${id}`);
  });

  root.replaceChildren(
    h('header', { class: 'topbar' }, iconBtn('x', 'Cancelar', () => back('#conselho')), h('h1', { class: 'grow' }, 'Nova votação')),
    h('div', { class: 'scroll' }, form));
  question.focus({ preventScroll: true });

  const { data: pautas } = await sb.from('pautas').select('id,title,status').in('status', ['discussao', 'votacao']).order('created_at', { ascending: false }).limit(50);
  (pautas || []).forEach((p) => pautaSel.append(h('option', { value: String(p.id) }, `Nº ${String(p.id).padStart(2, '0')} · ${p.title.slice(0, 32)}`)));
  if (pautaFromRoute) pautaSel.value = pautaFromRoute;
}
