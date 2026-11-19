import { sb } from '../sb.js';
import { state, on, chatBgStyle, memberName } from '../state.js';
import { h, icon, iconBtn, avatar, fmtTime, fmtDay, fmtDur, toast, sheet, confirmBox, viewer, pickFile, autosize, errMsg } from '../ui.js';
import { uploadFile, compressImage, extOf, startRecording, isVideoUrl } from '../media.js';
import { go } from '../nav.js';
import * as call from '../call.js';

const PAGE = 40;

export default async function Chat(root) {
  const offs = [];
  const msgs = new Map(); // id -> row
  let oldest = null;
  let rec = null, recTimer = null;

  // ---------- cabeçalho ----------
  const sub = h('span', { class: 'sub' });
  const updateSub = () => {
    const n = state.members.size, o = state.online.size;
    sub.replaceChildren(h('span', { class: 'online-dot' }), `${n} ${n === 1 ? 'membro' : 'membros'} · ${o} online`);
  };
  updateSub();
  offs.push(on('online', updateSub), on('members', updateSub));

  const header = h('header', { class: 'topbar bordered' },
    h('div', { class: 'logo-badge' }, icon('landmark', 22, 1.6)),
    h('div', { class: 'grow' }, h('h1', null, state.group?.name || 'Conselho'), sub),
    iconBtn('phone', 'Ligação do grupo', () => call.openChoice()),
    h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Meu perfil e aparência', onClick: () => go('#perfil'), style: { padding: 0, overflow: 'hidden' } }, avatar(state.me, 44)),
  );

  // ---------- faixa de ligação ----------
  const banner = h('div', { class: 'call-banner', style: { display: 'none' } });
  const updateBanner = () => {
    const c = call.callInfo();
    if (!c.active) { banner.style.display = 'none'; return; }
    banner.style.display = '';
    const names = c.ids.slice(0, 3).map((id) => (id === state.me.id ? 'você' : memberName(id).split(' ')[0])).join(', ');
    banner.replaceChildren(icon('phone', 18, 2),
      h('span', { class: 'grow' }, c.joined ? 'Você está na ligação' : `Ligação rolando · ${names}${c.count > 3 ? ` +${c.count - 3}` : ''}`),
      h('button', { class: 'btn sm primary', style: { background: 'var(--grn)', color: '#06200f' }, onClick: () => call.openChoice() }, c.joined ? 'Abrir' : 'Entrar'));
  };
  updateBanner();
  offs.push(on('call', updateBanner));

  // ---------- lista de mensagens ----------
  const bg = h('div', { class: 'chat-bg' });
  chatBgStyle(bg);
  const list = h('div', { class: 'msgs', role: 'log', 'aria-live': 'polite' });
  const loadMoreBtn = h('button', { class: 'btn sm ghost load-more', onClick: () => loadOlder() }, 'Carregar mensagens anteriores');

  const nearBottom = () => list.scrollHeight - list.scrollTop - list.clientHeight < 160;
  const toBottom = () => { list.scrollTop = list.scrollHeight; };

  function rebuild() {
    const rows = [...msgs.values()].sort((a, b) => a.id - b.id);
    const frag = document.createDocumentFragment();
    if (oldest !== 'end' && rows.length >= PAGE) frag.append(loadMoreBtn);
    let prev = null;
    for (const m of rows) {
      if (!prev || new Date(prev.created_at).toDateString() !== new Date(m.created_at).toDateString()) {
        frag.append(h('div', { class: 'day-chip' }, fmtDay(m.created_at)));
        prev = null;
      }
      frag.append(renderMsg(m, prev));
      prev = m;
    }
    if (!rows.length) frag.append(h('div', { class: 'empty' }, 'Nenhuma mensagem ainda.', h('br'), 'Manda a primeira!'));
    list.replaceChildren(frag);
  }

  function renderMsg(m, prev) {
    if (m.kind === 'system') return h('div', { class: 'sys-chip' }, m.body);
    const mine = m.user_id === state.me.id;
    const author = state.members.get(m.user_id);
    const grouped = prev && prev.user_id === m.user_id && prev.kind !== 'system' && new Date(m.created_at) - new Date(prev.created_at) < 180000;
    const metaLine = h('span', { class: 'meta' }, fmtTime(m.created_at), mine ? icon('checks', 14, 2) : null);
    const who = !mine && !grouped ? h('span', { class: 'who', style: { color: author?.color || 'var(--gold)' } }, author?.name || 'Alguém') : null;
    let bubble;

    switch (m.kind) {
      case 'image':
        bubble = h('div', { class: 'bubble media' }, who,
          h('img', { src: m.media_url, alt: 'Foto', loading: 'lazy', style: aspect(m), onClick: () => viewer(m.media_url) }),
          m.body ? h('span', { class: 'txt', style: { padding: '2px 8px' } }, m.body) : null, metaLine);
        break;
      case 'video':
        bubble = h('div', { class: 'bubble media' }, who,
          h('video', { src: m.media_url, controls: true, preload: 'metadata', playsinline: true, style: aspect(m) }), metaLine);
        break;
      case 'audio':
        bubble = h('div', { class: 'bubble' }, who, audioPlayer(m.media_url, m.meta?.duration), metaLine);
        break;
      case 'sticker': {
        const st = isVideoUrl(m.media_url)
          ? h('video', { class: 'sticker-img', src: m.media_url, autoplay: true, loop: true, muted: true, playsinline: true })
          : h('img', { class: 'sticker-img', src: m.media_url, alt: 'Figurinha', loading: 'lazy' });
        if (st.tagName === 'VIDEO') st.setAttribute('playsinline', '');
        bubble = h('div', { class: 'bubble sticker-b' }, who, st, metaLine);
        break;
      }
      case 'pauta':
        bubble = h('div', { class: 'bubble card-b' },
          h('span', { class: 'kicker' }, icon('landmark', 14, 2), `NOVA PAUTA · por ${author?.name?.split(' ')[0] || 'alguém'}`),
          h('span', { class: 'title' }, m.body),
          h('a', { class: 'btn sm primary', href: `#pauta/${m.meta?.pauta_id}` }, 'Ver pauta'), metaLine);
        break;
      case 'poll':
        bubble = h('div', { class: 'bubble card-b' },
          h('span', { class: 'kicker' }, icon('vote', 14, 2), `VOTAÇÃO · por ${author?.name?.split(' ')[0] || 'alguém'}`),
          h('span', { class: 'title' }, m.body),
          h('a', { class: 'btn sm primary', href: `#votacao/${m.meta?.poll_id}` }, icon('vote', 16, 2.2), 'Votar'), metaLine);
        break;
      case 'call':
        return h('div', { class: 'sys-chip', style: { display: 'flex', alignItems: 'center', gap: '6px' } },
          icon(m.meta?.mode === 'video' ? 'video' : 'phone', 14, 2), `${author?.name?.split(' ')[0] || 'Alguém'} começou uma ${m.meta?.mode === 'video' ? 'chamada de vídeo' : 'chamada de voz'} · ${fmtTime(m.created_at)}`);
      default:
        bubble = h('div', { class: 'bubble' }, who, h('span', { class: 'txt' }, m.body || ''), metaLine);
    }

    const row = h('div', { class: `msg ${mine ? 'mine' : ''} ${grouped ? '' : 'first'}`, 'data-id': m.id },
      !mine ? h('span', { class: 'av-slot' }, grouped ? null : avatar(author, 30)) : null,
      bubble);
    if (mine) attachLongPress(bubble, () => askDelete(m));
    return row;
  }

  const aspect = (m) => (m.meta?.w && m.meta?.h ? { aspectRatio: `${m.meta.w} / ${m.meta.h}` } : null);

  function audioPlayer(url, duration) {
    const fill = h('i');
    const time = h('span', { class: 'time' }, fmtDur(duration));
    const btn = h('button', { type: 'button', class: 'play', 'aria-label': 'Tocar áudio' }, icon('play', 18));
    let audio = null;
    btn.addEventListener('click', () => {
      if (!audio) {
        audio = new Audio(url);
        audio.addEventListener('timeupdate', () => {
          const d = isFinite(audio.duration) && audio.duration > 0 ? audio.duration : duration || 1;
          fill.style.width = Math.min(100, (audio.currentTime / d) * 100) + '%';
          time.textContent = fmtDur(audio.currentTime);
        });
        audio.addEventListener('ended', () => { btn.replaceChildren(icon('play', 18)); fill.style.width = '0%'; time.textContent = fmtDur(duration); });
        audio.addEventListener('pause', () => btn.replaceChildren(icon('play', 18)));
        audio.addEventListener('play', () => btn.replaceChildren(icon('pause', 18)));
      }
      if (audio.paused) {
        audio.play().catch(() => toast('Não deu pra tocar esse áudio.'));
      } else audio.pause();
    });
    return h('div', { class: 'audio' }, btn, h('div', { class: 'track' }, fill), time);
  }

  function attachLongPress(el, fn) {
    let t = null;
    el.addEventListener('contextmenu', (e) => { e.preventDefault(); fn(); });
    el.addEventListener('touchstart', () => { t = setTimeout(fn, 550); }, { passive: true });
    ['touchend', 'touchmove', 'touchcancel'].forEach((ev) => el.addEventListener(ev, () => clearTimeout(t), { passive: true }));
  }

  async function askDelete(m) {
    if (!['text', 'image', 'video', 'audio', 'sticker'].includes(m.kind)) return;
    if (!(await confirmBox('Apagar esta mensagem para todos?', 'Apagar', true))) return;
    const { error } = await sb.from('messages').delete().eq('id', m.id);
    if (error) return toast(errMsg(error));
    msgs.delete(m.id);
    rebuild();
  }

  async function loadInitial() {
    const { data, error } = await sb.from('messages').select('*').order('id', { ascending: false }).limit(PAGE);
    if (error) { list.replaceChildren(h('div', { class: 'empty' }, errMsg(error))); return; }
    data.forEach((m) => msgs.set(m.id, m));
    oldest = data.length < PAGE ? 'end' : data[data.length - 1]?.id;
    rebuild();
    toBottom();
    // imagens carregando mudam a altura: mantém no fim
    setTimeout(toBottom, 300);
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
    rebuild();
    list.scrollTop = list.scrollHeight - prevH;
  }

  function addMessage(m) {
    if (msgs.has(m.id)) return;
    const stick = nearBottom() || m.user_id === state.me.id;
    msgs.set(m.id, m);
    rebuild();
    if (stick) { toBottom(); setTimeout(toBottom, 250); }
  }

  const rt = sb.channel(`chat-${Date.now()}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `group_id=eq.${state.group.id}` }, (p) => addMessage(p.new))
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages' }, (p) => { if (msgs.delete(p.old?.id)) rebuild(); })
    .subscribe();

  // ---------- campo de mensagem ----------
  const ta = h('textarea', { rows: 1, placeholder: 'Mensagem', 'aria-label': 'Mensagem' });
  const fit = autosize(ta);
  const actionBtn = h('button', { type: 'button', class: 'icon-btn gold round', 'aria-label': 'Gravar áudio' }, icon('mic', 20, 2));
  const uploading = h('div', { class: 'uploading', style: { display: 'none' } }, h('span', { class: 'spinner' }), 'Enviando…');

  const setAction = () => {
    const hasText = ta.value.trim().length > 0;
    actionBtn.replaceChildren(icon(hasText ? 'send' : 'mic', 20, 2));
    actionBtn.setAttribute('aria-label', hasText ? 'Enviar' : 'Gravar áudio');
  };
  ta.addEventListener('input', setAction);
  ta.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && window.matchMedia('(pointer:fine)').matches) { e.preventDefault(); sendText(); }
  });

  async function insert(row) {
    const { data, error } = await sb.from('messages').insert(row).select().single();
    if (error) throw error;
    addMessage(data);
  }

  async function sendText() {
    const body = ta.value.trim();
    if (!body) return;
    ta.value = ''; fit(); setAction();
    try { await insert({ kind: 'text', body }); } catch (e) { ta.value = body; setAction(); toast(errMsg(e)); }
  }

  async function withUpload(fn) {
    uploading.style.display = '';
    toBottom();
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
        await insert({ kind: 'image', media_url: url, meta: { w: img.w, h: img.h } });
      } else if (file.type === 'image/gif') {
        const url = await uploadFile(file, 'gif');
        await insert({ kind: 'image', media_url: url });
      } else {
        const url = await uploadFile(file, extOf(file, 'mp4'));
        await insert({ kind: 'video', media_url: url });
      }
    });
  }

  async function sendSticker(url) {
    try { await insert({ kind: 'sticker', media_url: url }); } catch (e) { toast(errMsg(e)); }
  }

  async function openStickers() {
    const grid = h('div', { class: 'sticker-grid' }, h('div', { class: 'spinner' }));
    const close = sheet(
      h('div', { class: 'row between' }, h('h3', null, 'Figurinhas'), h('a', { class: 'btn sm ghost', href: '#figurinhas' }, icon('plus', 16), 'Criar')),
      grid);
    const { data, error } = await sb.from('stickers').select('id,url').order('id', { ascending: false }).limit(200);
    if (error) { grid.replaceChildren(errMsg(error)); return; }
    if (!data.length) { grid.replaceChildren(h('p', { class: 'muted', style: { gridColumn: '1 / -1' } }, 'Ainda não tem figurinhas. Toque em "Criar".')); return; }
    grid.replaceChildren(...data.map((s) => h('button', { type: 'button', class: 'sticker-cell', 'aria-label': 'Enviar figurinha', onClick: () => { close(); sendSticker(s.url); } },
      isVideoUrl(s.url) ? h('video', { src: s.url, autoplay: true, loop: true, muted: true, playsinline: true }) : h('img', { src: s.url, alt: '', loading: 'lazy' }))));
  }

  // gravação de áudio
  const composer = h('div', { class: 'composer' });
  const normalComposer = () => {
    composer.replaceChildren(
      iconBtn('smile', 'Figurinhas', openStickers, ''),
      h('div', { class: 'box' }, ta, iconBtn('clip', 'Enviar foto ou vídeo', sendFile)),
      actionBtn);
    composer.firstChild.style.color = 'var(--gold)';
  };
  async function startRec() {
    try {
      rec = await startRecording();
    } catch (e) {
      toast(e?.name === 'NotAllowedError' ? 'Permita o microfone para mandar áudio.' : errMsg(e));
      return;
    }
    const timeEl = h('span', null, '0:00');
    recTimer = setInterval(() => { timeEl.textContent = fmtDur((Date.now() - rec.startedAt) / 1000); }, 250);
    composer.replaceChildren(
      iconBtn('trash', 'Cancelar áudio', () => { rec?.cancel(); stopRecUi(); }),
      h('div', { class: 'rec-bar' }, h('span', { class: 'rec-dot' }), timeEl, h('span', { class: 'muted small' }, 'Gravando…')),
      h('button', { type: 'button', class: 'icon-btn gold round', 'aria-label': 'Enviar áudio', onClick: finishRec }, icon('send', 20, 2)));
  }
  function stopRecUi() { clearInterval(recTimer); rec = null; normalComposer(); setAction(); }
  async function finishRec() {
    const r = rec; stopRecUi();
    if (!r) return;
    const out = await r.stop();
    if (out.duration < 0.8) return toast('Áudio muito curto.');
    await withUpload(async () => {
      const url = await uploadFile(out.blob, out.ext);
      await insert({ kind: 'audio', media_url: url, meta: { duration: Math.round(out.duration) } });
    });
  }
  actionBtn.addEventListener('click', () => (ta.value.trim() ? sendText() : startRec()));
  normalComposer();

  root.classList.add('chat');
  root.replaceChildren(bg, header, banner, list, uploading, composer);
  await loadInitial();

  return {
    destroy() {
      offs.forEach((f) => f());
      sb.removeChannel(rt);
      if (rec) rec.cancel();
      clearInterval(recTimer);
    },
  };
}
