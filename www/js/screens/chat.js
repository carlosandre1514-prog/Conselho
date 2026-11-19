import { sb } from '../sb.js';
import { state, on, chatBgStyle, memberName } from '../state.js';
import { h, icon, iconBtn, avatar, logo, fmtTime, fmtDay, fmtDur, toast, sheet, confirmBox, viewer, pickFile, autosize, errMsg, buzz } from '../ui.js';
import { uploadFile, compressImage, extOf, startRecording, isVideoUrl } from '../media.js';
import { go } from '../nav.js';
import { getLastRead, markRead } from '../app.js';
import * as call from '../call.js';

const PAGE = 50;
const REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🔥', '🙏'];
const RECENT_KEY = 'conselho-recent-stickers';
const firstName = (id) => (id === state.me.id ? 'Você' : memberName(id).split(' ')[0]);
const onlyEmoji = (t) => t && t.length <= 12 && /^(\p{Extended_Pictographic}|\p{Emoji_Component}|‍|️|\s)+$/u.test(t) && /\p{Extended_Pictographic}/u.test(t);

function preview(m) {
  if (!m) return '';
  switch (m.kind) {
    case 'image': return '📷 Foto';
    case 'video': return '🎬 Vídeo';
    case 'audio': return `🎤 Áudio (${fmtDur(m.meta?.duration)})`;
    case 'sticker': return 'Figurinha';
    case 'pauta': return `Pauta: ${m.body}`;
    case 'poll': return `Votação: ${m.body}`;
    default: return m.body || '';
  }
}

export default async function Chat(root) {
  const offs = [];
  const msgs = new Map();       // id -> mensagem
  const reacts = new Map();     // id -> Map(user_id -> emoji)
  const cache = new Map();      // id -> { key, el }
  const fresh = new Set();      // ids que acabaram de chegar (animação)
  let oldest = null;
  let unseen = 0;
  let replyTo = null;
  const lastReadAtOpen = getLastRead();

  // ---------- topo ----------
  const sub = h('span', { class: 'sub' });
  const typingNow = new Map();
  const updateSub = () => {
    const now = Date.now();
    for (const [id, t] of typingNow) if (now - t > 3500) typingNow.delete(id);
    if (typingNow.size) {
      const names = [...typingNow.keys()].map(firstName);
      sub.className = 'sub typing';
      sub.textContent = names.length === 1 ? `${names[0]} está digitando…` : `${names.slice(0, 2).join(' e ')} estão digitando…`;
      return;
    }
    sub.className = 'sub';
    const n = state.members.size, o = Math.max(0, state.online.size);
    sub.textContent = `${n} ${n === 1 ? 'membro' : 'membros'} · ${o} aqui agora`;
  };
  updateSub();
  offs.push(on('online', updateSub), on('members', updateSub));
  const typingTimer = setInterval(updateSub, 1000);

  const header = h('header', { class: 'topbar bordered' },
    h('span', { style: { width: '6px' } }),
    logo(34),
    h('div', { class: 'title grow' }, h('b', null, state.group?.name || 'Conselho'), sub),
    iconBtn('phone', 'Ligação do grupo', () => call.openChoice()),
    h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Perfil e aparência', onClick: () => go('#perfil') }, avatar(state.me, 34)));

  // ---------- faixa de ligação ----------
  const strip = h('div');
  const updateStrip = () => {
    const c = call.callInfo();
    if (!c.active) { strip.replaceChildren(); return; }
    const faces = h('span', { class: 'faces' }, c.ids.slice(0, 4).map((id) => avatar(state.members.get(id), 26)));
    strip.replaceChildren(h('div', { class: 'call-strip' },
      h('span', { class: 'live-dot' }), faces,
      h('span', { class: 'grow' }, c.joined ? 'Você está na ligação' : `${c.count} na ligação`),
      h('button', { class: 'btn sm', style: { background: 'var(--grn)', color: '#082214' }, onClick: () => call.openChoice() }, c.joined ? 'Voltar' : 'Entrar')));
  };
  updateStrip();
  offs.push(on('call', updateStrip));

  // ---------- lista ----------
  const bg = h('div', { class: 'chat-bg' });
  chatBgStyle(bg);
  offs.push(on('group', () => chatBgStyle(bg)));
  const list = h('div', { class: 'msgs', role: 'log', 'aria-live': 'polite' });
  const loadMoreBtn = h('button', { class: 'btn sm line load-more', onClick: () => loadOlder() }, 'Mensagens anteriores');
  const toBottomBtn = h('button', { type: 'button', class: 'to-bottom', 'aria-label': 'Ir para o fim', style: { display: 'none' }, onClick: () => { toBottom(true); } }, icon('arrowDown', 20, 2));

  const nearBottom = () => list.scrollHeight - list.scrollTop - list.clientHeight < 140;
  function toBottom(smooth) {
    list.scrollTo({ top: list.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
    unseen = 0; updateToBottom();
  }
  function updateToBottom() {
    const show = !nearBottom();
    toBottomBtn.style.display = show ? '' : 'none';
    toBottomBtn.querySelector('.badge')?.remove();
    if (show && unseen) toBottomBtn.append(h('span', { class: 'badge' }, String(unseen)));
  }
  list.addEventListener('scroll', () => {
    if (nearBottom()) { unseen = 0; markSeen(); }
    updateToBottom();
  }, { passive: true });

  function markSeen() {
    const ids = [...msgs.keys()].filter((k) => typeof k === 'number');
    if (ids.length && !document.hidden) markRead(Math.max(...ids));
  }

  function rebuild() {
    const rows = [...msgs.values()].sort((a, b) => (a.sort ?? a.id) - (b.sort ?? b.id));
    const frag = document.createDocumentFragment();
    if (oldest !== 'end' && rows.length >= PAGE) frag.append(loadMoreBtn);
    let prev = null;
    let dividerDone = false;
    for (const m of rows) {
      if (!prev || new Date(prev.created_at).toDateString() !== new Date(m.created_at).toDateString()) {
        frag.append(h('div', { class: 'day-chip' }, fmtDay(m.created_at)));
        prev = null;
      }
      if (!dividerDone && lastReadAtOpen && typeof m.id === 'number' && m.id > lastReadAtOpen && m.user_id !== state.me.id) {
        frag.append(h('div', { class: 'unread-line' }, 'Novas mensagens'));
        dividerDone = true;
        prev = null;
      }
      frag.append(cached(m, prev));
      prev = m;
    }
    if (!rows.length) {
      frag.append(h('div', { class: 'empty' }, logo(48), h('span', { class: 'display' }, 'Sessão aberta.'), 'Ninguém falou nada ainda. Alguém tem que começar.'));
    }
    list.replaceChildren(frag);
    fresh.clear();
  }

  function cached(m, prev) {
    const grouped = !!(prev && prev.user_id === m.user_id && !['system', 'call'].includes(prev.kind) && new Date(m.created_at) - new Date(prev.created_at) < 180000);
    const r = reacts.get(m.id);
    const key = `${m.id}|${m._state || ''}|${grouped}|${r ? [...r.entries()].join(',') : ''}|${m.media_url || ''}`;
    const c = cache.get(m.id);
    if (c && c.key === key) return c.el;
    const el = renderMsg(m, grouped);
    if (fresh.has(m.id) && el.classList) el.classList.add('new');
    cache.set(m.id, { key, el });
    return el;
  }

  function renderMsg(m, grouped) {
    if (m.kind === 'system') return h('div', { class: 'sys-line' }, m.body);
    if (m.kind === 'call') {
      return h('div', { class: 'sys-line' }, icon(m.meta?.mode === 'video' ? 'video' : 'phone', 14, 2),
        h('b', null, firstName(m.user_id)), ` começou uma ${m.meta?.mode === 'video' ? 'chamada de vídeo' : 'chamada de voz'} · ${fmtTime(m.created_at)}`);
    }
    const mine = m.user_id === state.me.id;
    const author = state.members.get(m.user_id);
    const meta = h('span', { class: 'meta' }, fmtTime(m.created_at),
      mine ? (m._state === 'pending' ? icon('clock', 12, 2) : m._state === 'failed' ? h('span', { style: { color: 'var(--red)' } }, '!') : icon('checks', 14, 2)) : null);
    const who = !mine && !grouped ? h('span', { class: 'who', style: { color: author?.color || 'var(--gold)' } }, author?.name || 'Alguém') : null;
    const quote = m.meta?.reply ? h('div', { class: 'quote', onClick: () => jumpTo(m.meta.reply.id) },
      h('b', { style: { color: state.members.get(m.meta.reply.uid)?.color || 'var(--gold)' } }, m.meta.reply.uid === state.me.id ? 'Você' : m.meta.reply.name),
      h('span', null, m.meta.reply.text)) : null;
    let bubble;

    switch (m.kind) {
      case 'image':
        bubble = h('div', { class: 'bubble media' }, who, quote,
          h('img', { src: m.media_url, alt: 'Foto', loading: 'lazy', style: aspect(m), onClick: () => viewer(m.media_url) }),
          m.body ? h('span', { class: 'txt caption' }, m.body) : null, meta);
        break;
      case 'video':
        bubble = h('div', { class: 'bubble media' }, who, quote,
          h('video', { src: m.media_url, controls: true, preload: 'metadata', playsinline: true, style: aspect(m) }), meta);
        break;
      case 'audio':
        bubble = h('div', { class: 'bubble' }, who, quote, audioPlayer(m), meta);
        break;
      case 'sticker': {
        const st = isVideoUrl(m.media_url)
          ? h('video', { class: 'sticker-img', src: m.media_url, autoplay: true, loop: true, muted: true, playsinline: true })
          : h('img', { class: 'sticker-img', src: m.media_url, alt: 'Figurinha', loading: 'lazy' });
        bubble = h('div', { class: 'bubble sticker-b' }, quote, st, meta);
        break;
      }
      case 'pauta':
        bubble = h('div', { class: 'bubble card-b' },
          h('span', { class: 'head small', style: { color: 'var(--gold)', fontWeight: 600 } }, icon('assembly', 15), `Nova pauta · ${firstName(m.user_id)}`),
          h('span', { class: 'title' }, m.body),
          h('a', { class: 'btn sm primary', href: `#pauta/${m.meta?.pauta_id}` }, 'Abrir a pauta'), meta);
        break;
      case 'poll':
        bubble = h('div', { class: 'bubble card-b' },
          h('span', { class: 'head small', style: { color: 'var(--gold)', fontWeight: 600 } }, icon('vote', 15, 2), `Votação aberta · ${firstName(m.user_id)}`),
          h('span', { class: 'title' }, m.body),
          h('a', { class: 'btn sm primary', href: `#votacao/${m.meta?.poll_id}` }, 'Votar'), meta);
        break;
      default:
        bubble = h('div', { class: 'bubble' }, who, quote, h('span', { class: `txt ${onlyEmoji(m.body) ? 'big' : ''}` }, m.body || ''), meta);
    }

    const r = reacts.get(m.id);
    let reactEl = null;
    if (r && r.size) {
      const counts = new Map();
      for (const [uid, e] of r) { if (!counts.has(e)) counts.set(e, []); counts.get(e).push(uid); }
      reactEl = h('div', { class: 'reactions' }, [...counts].map(([e, uids]) => h('button', {
        type: 'button', class: `react-chip ${uids.includes(state.me.id) ? 'mine' : ''}`, 'aria-label': `${e} de ${uids.map(firstName).join(', ')}`,
        onClick: () => react(m, e),
      }, e, uids.length > 1 ? h('b', null, uids.length) : null)));
    }

    const row = h('div', { class: `msg ${mine ? 'mine' : ''} ${grouped ? '' : 'first'} ${m._state || ''} ${reactEl ? 'has-react' : ''}`, 'data-id': m.id },
      !mine ? h('span', { class: 'av-slot' }, grouped ? null : avatar(author, 30)) : null,
      bubble, reactEl);
    if (m._state === 'failed') bubble.addEventListener('click', () => retry(m));
    if (typeof m.id === 'number' && m.kind !== 'pauta' && m.kind !== 'poll') gestures(row, bubble, m);
    return row;
  }

  const aspect = (m) => (m.meta?.w && m.meta?.h ? { aspectRatio: `${m.meta.w} / ${m.meta.h}` } : null);

  function jumpTo(id) {
    const el = list.querySelector(`[data-id="${id}"]`);
    if (!el) return toast('Essa mensagem é antiga demais.');
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const b = el.querySelector('.bubble');
    b?.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.04)' }, { transform: 'scale(1)' }], { duration: 400 });
  }

  // ---------- áudio com ondinha ----------
  function audioPlayer(m) {
    const n = 40;
    let wave = m.meta?.wave;
    if (!wave?.length) { let seed = m.id || 7; wave = Array.from({ length: n }, () => { seed = (seed * 9301 + 49297) % 233280; return 0.2 + (seed / 233280) * 0.7; }); }
    const bars = wave.map((v) => h('i', { style: { height: Math.max(12, Math.round(v * 100)) + '%' } }));
    const waveEl = h('div', { class: 'wave', role: 'slider', 'aria-label': 'Posição do áudio' }, bars);
    const time = h('span', { class: 'time' }, fmtDur(m.meta?.duration));
    const speeds = [1, 1.5, 2];
    let sp = 0;
    const speedBtn = h('button', { type: 'button', class: 'speed', 'aria-label': 'Velocidade' }, '1x');
    const btn = h('button', { type: 'button', class: 'play', 'aria-label': 'Tocar áudio' }, icon('play', 18));
    let audio = null;
    const dur = () => (audio && isFinite(audio.duration) && audio.duration > 0 ? audio.duration : m.meta?.duration || 1);
    const paint = () => {
      const p = audio ? audio.currentTime / dur() : 0;
      bars.forEach((b, i) => b.classList.toggle('on', i / bars.length < p));
      time.textContent = fmtDur(audio && audio.currentTime > 0 ? audio.currentTime : m.meta?.duration);
    };
    const ensure = () => {
      if (audio) return;
      audio = new Audio(m.media_url);
      audio.playbackRate = speeds[sp];
      audio.addEventListener('timeupdate', paint);
      audio.addEventListener('ended', () => { btn.replaceChildren(icon('play', 18)); audio.currentTime = 0; paint(); });
      audio.addEventListener('pause', () => btn.replaceChildren(icon('play', 18)));
      audio.addEventListener('play', () => btn.replaceChildren(icon('pause', 18)));
    };
    btn.addEventListener('click', () => {
      ensure();
      if (audio.paused) {
        document.querySelectorAll('.audio').forEach((a) => a !== wrap && a._pause?.());
        audio.play().catch(() => toast('Não deu pra tocar esse áudio.'));
      } else audio.pause();
    });
    waveEl.addEventListener('click', (e) => {
      ensure();
      const r = waveEl.getBoundingClientRect();
      audio.currentTime = ((e.clientX - r.left) / r.width) * dur();
      paint();
    });
    speedBtn.addEventListener('click', () => {
      sp = (sp + 1) % speeds.length;
      speedBtn.textContent = `${speeds[sp]}x`.replace('.', ',');
      if (audio) audio.playbackRate = speeds[sp];
    });
    const wrap = h('div', { class: 'audio' }, btn, waveEl, h('span', { class: 'side' }, speedBtn, time));
    wrap._pause = () => audio?.pause();
    return wrap;
  }

  // ---------- gestos: arrastar pro lado = responder; segurar = menu ----------
  function gestures(row, bubble, m) {
    let x0 = 0, y0 = 0, dx = 0, pressT = null, swiping = false;
    row.addEventListener('contextmenu', (e) => { e.preventDefault(); openActions(m); });
    row.addEventListener('touchstart', (e) => {
      const t = e.touches[0]; x0 = t.clientX; y0 = t.clientY; dx = 0; swiping = false;
      pressT = setTimeout(() => { buzz(15); openActions(m); }, 480);
    }, { passive: true });
    row.addEventListener('touchmove', (e) => {
      const t = e.touches[0];
      const ddx = t.clientX - x0, ddy = t.clientY - y0;
      if (Math.abs(ddx) > 8 || Math.abs(ddy) > 8) clearTimeout(pressT);
      if (!swiping && ddx > 12 && Math.abs(ddy) < 14) swiping = true;
      if (swiping) { dx = Math.max(0, Math.min(80, ddx)); bubble.style.transform = `translateX(${dx}px)`; }
    }, { passive: true });
    const end = () => {
      clearTimeout(pressT);
      if (swiping && dx > 56) { buzz(10); startReply(m); }
      bubble.style.transform = '';
      swiping = false;
    };
    row.addEventListener('touchend', end, { passive: true });
    row.addEventListener('touchcancel', end, { passive: true });
  }

  function openActions(m) {
    const mine = m.user_id === state.me.id;
    const myR = reacts.get(m.id)?.get(state.me.id);
    const close = sheet(
      h('div', { class: 'react-row' }, REACTIONS.map((e) => h('button', { type: 'button', class: myR === e ? 'on' : '', 'aria-label': `Reagir com ${e}`, onClick: () => { close(); react(m, e); } }, e))),
      h('div', { class: 'sheet-quote' }, preview(m)),
      h('button', { class: 'sheet-item', onClick: () => { close(); startReply(m); } }, icon('reply', 20), 'Responder'),
      m.kind === 'text' ? h('button', { class: 'sheet-item', onClick: async () => { close(); await navigator.clipboard?.writeText(m.body || ''); toast('Copiado'); } }, icon('copy', 20), 'Copiar texto') : null,
      m.kind === 'sticker' ? h('button', { class: 'sheet-item', onClick: () => { close(); go('#figurinhas'); } }, icon('sticker', 20), 'Ver figurinhas do grupo') : null,
      mine ? h('button', { class: 'sheet-item danger', onClick: () => { close(); askDelete(m); } }, icon('trash', 20), 'Apagar pra todo mundo') : null);
  }

  async function react(m, emoji) {
    buzz(8);
    const mineNow = reacts.get(m.id)?.get(state.me.id);
    if (!reacts.has(m.id)) reacts.set(m.id, new Map());
    if (mineNow === emoji) {
      reacts.get(m.id).delete(state.me.id);
      rebuildKeep();
      const { error } = await sb.from('message_reactions').delete().eq('message_id', m.id).eq('user_id', state.me.id);
      if (error) toast(errMsg(error));
    } else {
      reacts.get(m.id).set(state.me.id, emoji);
      rebuildKeep();
      const { error } = await sb.from('message_reactions').upsert({ message_id: m.id, user_id: state.me.id, emoji }, { onConflict: 'message_id,user_id' });
      if (error) toast(errMsg(error));
    }
  }

  async function askDelete(m) {
    if (!(await confirmBox('Apagar essa mensagem pra todo mundo?', 'Apagar', true))) return;
    const { error } = await sb.from('messages').delete().eq('id', m.id);
    if (error) return toast(errMsg(error));
    msgs.delete(m.id); cache.delete(m.id);
    rebuildKeep();
  }

  function rebuildKeep() {
    const fromBottom = list.scrollHeight - list.scrollTop;
    const stick = nearBottom();
    rebuild();
    if (stick) list.scrollTop = list.scrollHeight; else list.scrollTop = list.scrollHeight - fromBottom;
  }

  // ---------- carregar ----------
  async function loadReactions(ids) {
    if (!ids.length) return;
    const { data } = await sb.from('message_reactions').select('message_id,user_id,emoji').in('message_id', ids);
    (data || []).forEach((r) => { if (!reacts.has(r.message_id)) reacts.set(r.message_id, new Map()); reacts.get(r.message_id).set(r.user_id, r.emoji); });
  }

  async function loadInitial() {
    list.replaceChildren(h('div', { style: { padding: '20px 6px', display: 'flex', flexDirection: 'column', gap: '12px' } },
      [62, 40, 75, 52, 30].map((w, i) => h('div', { class: 'sk', style: { height: i % 2 ? '38px' : '54px', width: w + '%', alignSelf: i % 3 === 1 ? 'flex-end' : 'flex-start', borderRadius: '16px' } }))));
    const { data, error } = await sb.from('messages').select('*').order('id', { ascending: false }).limit(PAGE);
    if (error) { list.replaceChildren(h('div', { class: 'empty' }, errMsg(error))); return; }
    data.forEach((m) => msgs.set(m.id, m));
    oldest = data.length < PAGE ? 'end' : data[data.length - 1]?.id;
    await loadReactions(data.map((m) => m.id));
    rebuild();
    const div = list.querySelector('.unread-line');
    if (div) div.scrollIntoView({ block: 'center' }); else toBottom();
    setTimeout(() => { if (!div) toBottom(); markSeen(); }, 350);
  }

  async function loadOlder() {
    if (!oldest || oldest === 'end') return;
    loadMoreBtn.disabled = true;
    const { data, error } = await sb.from('messages').select('*').lt('id', oldest).order('id', { ascending: false }).limit(PAGE);
    loadMoreBtn.disabled = false;
    if (error) return toast(errMsg(error));
    const prevH = list.scrollHeight;
    data.forEach((m) => msgs.set(m.id, m));
    oldest = data.length < PAGE ? 'end' : data[data.length - 1]?.id;
    await loadReactions(data.map((m) => m.id));
    rebuild();
    list.scrollTop = list.scrollHeight - prevH;
  }

  function addMessage(m) {
    if (msgs.has(m.id)) return;
    // troca a mensagem "enviando…" pela de verdade
    if (m.user_id === state.me.id && m.meta?.nonce) {
      for (const [k, v] of msgs) if (v._nonce === m.meta.nonce) { msgs.delete(k); cache.delete(k); }
    }
    const stick = nearBottom() || m.user_id === state.me.id;
    msgs.set(m.id, m);
    fresh.add(m.id);
    rebuildKeep();
    if (stick) { toBottom(); setTimeout(() => toBottom(), 250); markSeen(); } else { unseen++; updateToBottom(); }
    if (m.user_id !== state.me.id) typingNow.delete(m.user_id);
  }

  const rt = sb.channel(`chat-${Date.now()}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `group_id=eq.${state.group.id}` }, (p) => addMessage(p.new))
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages' }, (p) => { if (msgs.delete(p.old?.id)) { cache.delete(p.old.id); rebuildKeep(); } })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'message_reactions' }, (p) => {
      const r = p.new && p.new.message_id ? p.new : p.old;
      if (!r || !msgs.has(r.message_id)) return;
      if (!reacts.has(r.message_id)) reacts.set(r.message_id, new Map());
      if (p.eventType === 'DELETE') reacts.get(r.message_id).delete(r.user_id);
      else reacts.get(r.message_id).set(r.user_id, r.emoji);
      rebuildKeep();
    })
    .subscribe();

  // "digitando…"
  const typingCh = sb.channel(`typing:${state.group.id}`, { config: { broadcast: { self: false } } })
    .on('broadcast', { event: 't' }, ({ payload }) => { if (payload?.u && payload.u !== state.me.id) { typingNow.set(payload.u, Date.now()); updateSub(); } })
    .subscribe();
  let lastTyping = 0;
  const pingTyping = () => { if (Date.now() - lastTyping > 2000) { lastTyping = Date.now(); typingCh.send({ type: 'broadcast', event: 't', payload: { u: state.me.id } }); } };

  // ---------- enviar ----------
  const ta = h('textarea', { rows: 1, placeholder: 'Escreva no Conselho', 'aria-label': 'Mensagem' });
  const fit = autosize(ta);
  const sendBtn = h('button', { type: 'button', class: 'send-btn', 'aria-label': 'Segure pra gravar áudio' }, icon('mic', 21, 2));
  const uploading = h('div', { class: 'uploading', style: { display: 'none' } }, h('span', { class: 'spinner' }), 'Enviando…');
  const replyBox = h('div');

  const setAction = () => {
    const has = ta.value.trim().length > 0;
    sendBtn.replaceChildren(icon(has ? 'send' : 'mic', 21, 2));
    sendBtn.setAttribute('aria-label', has ? 'Enviar' : 'Segure pra gravar áudio');
  };
  ta.addEventListener('input', () => { setAction(); if (ta.value) pingTyping(); });
  ta.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && window.matchMedia('(pointer:fine)').matches) { e.preventDefault(); sendText(); }
  });
  ta.addEventListener('focus', () => closeStickers());

  function startReply(m) {
    replyTo = { id: m.id, uid: m.user_id, name: memberName(m.user_id), text: preview(m).slice(0, 120) };
    replyBox.replaceChildren(h('div', { class: 'reply-bar' },
      h('span', { style: { color: 'var(--gold)' } }, icon('reply', 18)),
      h('div', { class: 'grow' }, h('b', { style: { color: state.members.get(m.user_id)?.color || 'var(--gold)' } }, m.user_id === state.me.id ? 'Você' : replyTo.name), h('span', null, replyTo.text)),
      iconBtn('x', 'Cancelar resposta', clearReply)));
    ta.focus();
  }
  function clearReply() { replyTo = null; replyBox.replaceChildren(); }

  async function insertRow(row) {
    const nonce = Math.random().toString(36).slice(2);
    const meta = { ...(row.meta || {}), nonce, ...(replyTo ? { reply: replyTo } : {}) };
    const temp = { ...row, meta, id: `tmp-${nonce}`, sort: Number.MAX_SAFE_INTEGER - 1000 + msgs.size, user_id: state.me.id, created_at: new Date().toISOString(), _state: 'pending', _nonce: nonce };
    clearReply();
    if (row.kind === 'text' || row.kind === 'sticker') { msgs.set(temp.id, temp); fresh.add(temp.id); rebuildKeep(); toBottom(); }
    const { data, error } = await sb.from('messages').insert({ ...row, meta }).select().single();
    if (error) {
      if (msgs.has(temp.id)) { temp._state = 'failed'; rebuildKeep(); }
      throw error;
    }
    msgs.delete(temp.id); cache.delete(temp.id);
    addMessage(data);
    buzz(6);
  }
  async function retry(m) {
    msgs.delete(m.id); cache.delete(m.id); rebuildKeep();
    try { await insertRow({ kind: m.kind, body: m.body, media_url: m.media_url }); } catch (e) { toast(errMsg(e)); }
  }

  async function sendText() {
    const body = ta.value.trim();
    if (!body) return;
    ta.value = ''; fit(); setAction();
    try { await insertRow({ kind: 'text', body }); } catch { toast('Não enviou. Toque na mensagem pra tentar de novo.'); }
  }

  async function withUpload(fn) {
    uploading.style.display = '';
    try { await fn(); } catch (e) { toast(errMsg(e)); } finally { uploading.style.display = 'none'; }
  }

  async function sendFile() {
    const file = await pickFile('image/*,video/*');
    if (!file) return;
    if (file.size > 50 * 1024 * 1024) return toast('Arquivo maior que 50 MB.');
    await withUpload(async () => {
      if (file.type.startsWith('image/') && file.type !== 'image/gif') {
        const img = await compressImage(file);
        const url = await uploadFile(img.blob, 'jpg');
        await insertRow({ kind: 'image', media_url: url, meta: { w: img.w, h: img.h } });
      } else if (file.type === 'image/gif') {
        await insertRow({ kind: 'image', media_url: await uploadFile(file, 'gif') });
      } else {
        await insertRow({ kind: 'video', media_url: await uploadFile(file, extOf(file, 'mp4')) });
      }
    });
  }

  // ---------- painel de figurinhas ----------
  const stickerBtn = iconBtn('sticker', 'Figurinhas', () => toggleStickers());
  const panelBox = h('div');
  let panelOpen = false;
  let allStickers = null;
  function closeStickers() { if (!panelOpen) return; panelOpen = false; panelBox.replaceChildren(); stickerBtn.classList.remove('on'); stickerBtn.replaceChildren(icon('sticker', 20)); }
  async function toggleStickers() {
    if (panelOpen) { closeStickers(); ta.focus(); return; }
    panelOpen = true;
    ta.blur();
    stickerBtn.classList.add('on');
    stickerBtn.replaceChildren(icon('keyboard', 20));
    const tabs = h('div', { class: 'tabs' });
    const grid = h('div', { class: 'grid' }, Array.from({ length: 8 }, () => h('div', { class: 'sk', style: { aspectRatio: '1', borderRadius: '14px' } })));
    panelBox.replaceChildren(h('div', { class: 'sticker-panel' }, tabs, grid));
    if (!allStickers) {
      const { data, error } = await sb.from('stickers').select('id,url,pack').order('id', { ascending: false }).limit(400);
      if (error) { grid.replaceChildren(h('p', { class: 'muted' }, errMsg(error))); return; }
      allStickers = data;
    }
    const recent = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
    const packs = [...new Set(allStickers.map((s) => s.pack))];
    const tabList = [...(recent.length ? [['__recent', 'Recentes']] : []), ...packs.map((p) => [p, p])];
    let current = tabList[0]?.[0];
    const drawGrid = () => {
      tabs.replaceChildren(...tabList.map(([id, label]) => h('button', { type: 'button', class: `chip ${id === current ? 'on' : ''}`, onClick: () => { current = id; drawGrid(); } }, label)),
        h('a', { class: 'chip', href: '#figurinhas', style: { textDecoration: 'none' } }, '+ Criar'));
      const items = current === '__recent' ? recent.map((url) => ({ url })) : allStickers.filter((s) => s.pack === current);
      if (!items.length) { grid.replaceChildren(h('p', { class: 'muted', style: { gridColumn: '1 / -1', textAlign: 'center' } }, 'Nenhuma figurinha ainda. Crie a primeira!')); return; }
      grid.replaceChildren(...items.map((s) => h('button', { type: 'button', 'aria-label': 'Enviar figurinha', onClick: () => sendSticker(s.url) },
        isVideoUrl(s.url) ? h('video', { src: s.url, autoplay: true, loop: true, muted: true, playsinline: true }) : h('img', { src: s.url, alt: '', loading: 'lazy' }))));
    };
    drawGrid();
  }
  async function sendSticker(url) {
    const recent = [url, ...JSON.parse(localStorage.getItem(RECENT_KEY) || '[]').filter((u) => u !== url)].slice(0, 24);
    localStorage.setItem(RECENT_KEY, JSON.stringify(recent));
    try { await insertRow({ kind: 'sticker', media_url: url }); } catch (e) { toast(errMsg(e)); }
  }

  // ---------- áudio: segura pra gravar, arrasta pra esquerda pra cancelar ----------
  const composer = h('div', { class: 'composer' });
  const normalComposer = () => composer.replaceChildren(
    h('div', { class: 'box' }, stickerBtn, ta, iconBtn('clip', 'Foto ou vídeo', sendFile)),
    sendBtn);
  let rec = null, recUi = null, holdStart = 0, startX = 0, released = false, cancelled = false, waveTimer = null, clock = null;

  sendBtn.addEventListener('click', () => { if (ta.value.trim()) sendText(); });
  sendBtn.addEventListener('pointerdown', async (e) => {
    if (ta.value.trim()) return;
    e.preventDefault();
    try { sendBtn.setPointerCapture(e.pointerId); } catch { /* ok */ }
    released = false; cancelled = false; holdStart = Date.now(); startX = e.clientX;
    let r;
    try {
      r = await startRecording();
    } catch (err) {
      toast(err?.name === 'NotAllowedError' ? 'Permita o microfone pra mandar áudio.' : errMsg(err));
      return;
    }
    if (released) { r.cancel(); if (Date.now() - holdStart < 450) toast('Segure o botão pra gravar o áudio.'); return; }
    rec = r;
    buzz(20);
    sendBtn.classList.add('rec');
    const timeEl = h('span', null, '0:00');
    const live = h('span', { class: 'live-wave' });
    const hint = h('span', { class: 'hint' }, '‹ arraste pra cancelar');
    recUi = h('div', { class: 'rec-bar' }, h('span', { class: 'rec-dot' }), timeEl, live, hint);
    composer.replaceChildren(recUi, sendBtn);
    clock = setInterval(() => { if (rec) timeEl.textContent = fmtDur((Date.now() - rec.startedAt) / 1000); }, 250);
    waveTimer = setInterval(() => {
      if (!rec) return;
      live.append(h('i', { style: { height: Math.max(3, rec.level() * 26) + 'px' } }));
      while (live.children.length > 60) live.firstChild.remove();
    }, 90);
  });
  sendBtn.addEventListener('pointermove', (e) => {
    if (!rec || cancelled) return;
    const dx = startX - e.clientX;
    if (recUi) recUi.style.opacity = String(Math.max(0.3, 1 - dx / 160));
    if (dx > 110) { cancelled = true; buzz([10, 40, 10]); finishRec(false); }
  });
  sendBtn.addEventListener('pointerup', () => { released = true; if (rec && !cancelled) finishRec(true); });
  sendBtn.addEventListener('pointercancel', () => { released = true; if (rec) finishRec(false); });

  async function finishRec(send) {
    const r = rec; rec = null;
    clearInterval(clock); clearInterval(waveTimer);
    sendBtn.classList.remove('rec');
    normalComposer(); setAction();
    if (!r) return;
    if (!send) { r.cancel(); toast('Áudio cancelado'); return; }
    const out = await r.stop();
    if (out.duration < 0.8) return toast('Áudio muito curto.');
    await withUpload(async () => {
      const url = await uploadFile(out.blob, out.ext);
      await insertRow({ kind: 'audio', media_url: url, meta: { duration: Math.round(out.duration), wave: out.wave } });
    });
  }
  normalComposer();

  const vis = () => { if (!document.hidden && nearBottom()) markSeen(); };
  document.addEventListener('visibilitychange', vis);

  root.classList.add('chat');
  root.replaceChildren(bg, header, strip, list, toBottomBtn, h('div', { class: 'composer-wrap' }, uploading, replyBox, composer), panelBox);
  await loadInitial();

  return {
    destroy() {
      offs.forEach((f) => f());
      clearInterval(typingTimer); clearInterval(clock); clearInterval(waveTimer);
      document.removeEventListener('visibilitychange', vis);
      sb.removeChannel(rt); sb.removeChannel(typingCh);
      if (rec) rec.cancel();
      document.querySelectorAll('.audio').forEach((a) => a._pause?.());
    },
  };
}
