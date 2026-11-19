// Ligação em grupo (voz ou vídeo) com WebRTC, todo mundo conectado com todo mundo.
// A "sala" é o próprio grupo: quem entra aparece pra todos, e o chat mostra que tem ligação rolando.
import { sb } from './sb.js';
import { state, emit, memberName } from './state.js';
import { h, icon, avatar, toast, sheet, buzz, fmtDur } from './ui.js';
import { ICE_SERVERS } from './config.js';

let ch = null;
let subscribed = false;
let joined = false;
let mode = 'voice';
let local = null;
let mic = true;
let cam = false;
let facing = 'user';
let participants = new Map(); // id -> { mode, mic, cam }
const peers = new Map();      // id -> { pc, stream, pending, remoteSet }
const earlyIce = new Map();   // id -> [candidates] que chegaram antes da oferta
let ui = null, grid = null, subtitle = null, mini = null;
const tiles = new Map();
let wasActive = false;
let incomingEl = null;
let audioCtx = null;
const meters = new Map(); // id -> { analyser, buf, src }
let meterTimer = null;
let clockTimer = null;

export const callInfo = () => ({ active: participants.size > 0, count: participants.size, joined, mode, ids: [...participants.keys()] });

export function init() {
  destroy();
  ch = sb.channel(`call:${state.group.id}`, { config: { presence: { key: state.me.id }, broadcast: { self: false } } });
  ch.on('presence', { event: 'sync' }, onSync)
    .on('broadcast', { event: 'signal' }, ({ payload }) => onSignal(payload).catch((e) => console.warn('sinal', e)))
    .subscribe((status) => { subscribed = status === 'SUBSCRIBED'; });
}

export function destroy() {
  if (joined) leave();
  hideIncoming();
  stopMeters();
  if (ch) { sb.removeChannel(ch); ch = null; }
  participants = new Map();
  subscribed = false;
}

function onSync() {
  const st = ch.presenceState();
  participants = new Map(Object.entries(st).map(([k, arr]) => [k, arr[arr.length - 1] || {}]));
  if (joined) {
    for (const id of participants.keys()) {
      if (id !== state.me.id && !peers.has(id) && state.me.id < id) connect(id).catch((e) => console.warn(e));
    }
    for (const id of [...peers.keys()]) if (!participants.has(id)) dropPeer(id);
    renderTiles();
  }
  const info = callInfo();
  if (!wasActive && info.active && !joined && info.ids.some((id) => id !== state.me.id)) showIncoming();
  if (!info.active || joined) hideIncoming();
  wasActive = info.active;
  emit('call', info);
}

function showIncoming() {
  hideIncoming();
  const ids = [...participants.keys()];
  const who = ids.map((id) => memberName(id).split(' ')[0]).slice(0, 2).join(' e ');
  const anyVideo = [...participants.values()].some((p) => p.mode === 'video');
  buzz([200, 120, 200]);
  incomingEl = h('div', { class: 'incoming', role: 'alert' },
    h('span', { class: 'faces' }, ids.slice(0, 3).map((id) => avatar(state.members.get(id), 36))),
    h('div', { class: 'grow' }, h('b', null, `${who} ${ids.length > 1 ? 'estão' : 'está'} na ligação`), h('span', null, anyVideo ? 'Chamada de vídeo do Conselho' : 'Chamada de voz do Conselho')),
    h('button', { type: 'button', class: 'icon-btn filled round', 'aria-label': 'Agora não', onClick: hideIncoming }, icon('x', 18)),
    h('button', { type: 'button', class: 'icon-btn round', style: { background: 'var(--grn)', color: '#082214' }, 'aria-label': 'Entrar na ligação', onClick: () => { hideIncoming(); openChoice(); } }, icon('phone', 18, 2.2)));
  document.body.append(incomingEl);
  setTimeout(hideIncoming, 25000);
}
function hideIncoming() { incomingEl?.remove(); incomingEl = null; }

// ---------- quem está falando ----------
function meter(id, stream) {
  if (!stream || !stream.getAudioTracks().length) return;
  const cur = meters.get(id);
  if (cur && cur.stream === stream && cur.tracks === stream.getAudioTracks().length) return;
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
    cur?.src.disconnect();
    const src = audioCtx.createMediaStreamSource(stream);
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    src.connect(analyser);
    meters.set(id, { analyser, buf: new Uint8Array(analyser.fftSize), src, stream, tracks: stream.getAudioTracks().length });
  } catch { /* sem indicador */ }
  if (!meterTimer) meterTimer = setInterval(readMeters, 180);
}
function readMeters() {
  for (const [id, m] of meters) {
    m.analyser.getByteTimeDomainData(m.buf);
    let sum = 0;
    for (let i = 0; i < m.buf.length; i++) { const v = (m.buf[i] - 128) / 128; sum += v * v; }
    const level = Math.sqrt(sum / m.buf.length);
    const muted = id === state.me.id ? !mic : participants.get(id)?.mic === false;
    tiles.get(id)?.el.classList.toggle('speaking', level > 0.04 && !muted);
  }
}
function stopMeters() {
  clearInterval(meterTimer); meterTimer = null;
  for (const m of meters.values()) { try { m.src.disconnect(); } catch { /* ok */ } }
  meters.clear();
}

function send(to, data) {
  ch?.send({ type: 'broadcast', event: 'signal', payload: { from: state.me.id, to, ...data } });
}

function makePeer(id) {
  const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
  const peer = { pc, stream: new MediaStream(), pending: earlyIce.get(id) || [], remoteSet: false };
  earlyIce.delete(id);
  peers.set(id, peer);
  pc.onicecandidate = (e) => { if (e.candidate) send(id, { kind: 'ice', candidate: e.candidate.toJSON() }); };
  pc.ontrack = (e) => {
    peer.stream.getTracks().filter((t) => t.kind === e.track.kind).forEach((t) => peer.stream.removeTrack(t));
    peer.stream.addTrack(e.track);
    e.track.onunmute = () => renderTiles();
    renderTiles();
  };
  pc.onconnectionstatechange = () => {
    if (pc.connectionState === 'failed' && joined && state.me.id < id) {
      dropPeer(id);
      setTimeout(() => { if (joined && participants.has(id) && !peers.has(id)) connect(id).catch(() => {}); }, 800);
    }
    renderTiles();
  };
  return peer;
}

async function flush(peer) {
  const list = peer.pending.splice(0);
  for (const c of list) await peer.pc.addIceCandidate(c).catch(() => {});
}

async function connect(id) {
  const peer = makePeer(id);
  const { pc } = peer;
  const a = pc.addTransceiver('audio', { direction: 'sendrecv' });
  await a.sender.replaceTrack(local?.getAudioTracks()[0] || null);
  const vt = local?.getVideoTracks()[0];
  const v = pc.addTransceiver('video', { direction: vt ? 'sendrecv' : 'recvonly' });
  if (vt) await v.sender.replaceTrack(vt);
  await pc.setLocalDescription(await pc.createOffer());
  send(id, { kind: 'offer', sdp: pc.localDescription.toJSON() });
}

async function onSignal(p) {
  if (!joined || !p || p.to !== state.me.id) return;
  const id = p.from;
  if (p.kind === 'offer') {
    if (peers.has(id)) dropPeer(id, true);
    const peer = makePeer(id);
    const { pc } = peer;
    await pc.setRemoteDescription(p.sdp);
    peer.remoteSet = true;
    for (const t of pc.getTransceivers()) {
      const kind = t.receiver.track?.kind;
      if (kind === 'audio') {
        await t.sender.replaceTrack(local?.getAudioTracks()[0] || null);
        t.direction = 'sendrecv';
      } else if (kind === 'video') {
        const vt = local?.getVideoTracks()[0];
        if (vt) { await t.sender.replaceTrack(vt); t.direction = 'sendrecv'; } else t.direction = 'recvonly';
      }
    }
    await pc.setLocalDescription(await pc.createAnswer());
    send(id, { kind: 'answer', sdp: pc.localDescription.toJSON() });
    await flush(peer);
  } else if (p.kind === 'answer') {
    const peer = peers.get(id);
    if (!peer || peer.pc.signalingState !== 'have-local-offer') return;
    await peer.pc.setRemoteDescription(p.sdp);
    peer.remoteSet = true;
    await flush(peer);
  } else if (p.kind === 'ice') {
    const peer = peers.get(id);
    if (!peer) { if (!earlyIce.has(id)) earlyIce.set(id, []); earlyIce.get(id).push(p.candidate); return; }
    if (peer.remoteSet) await peer.pc.addIceCandidate(p.candidate).catch(() => {});
    else peer.pending.push(p.candidate);
  }
}

function dropPeer(id, keepTile = false) {
  const peer = peers.get(id);
  if (peer) { try { peer.pc.close(); } catch { /* ok */ } peers.delete(id); }
  if (!keepTile) { tiles.get(id)?.el.remove(); tiles.delete(id); }
  const m = meters.get(id);
  if (m) { try { m.src.disconnect(); } catch { /* ok */ } meters.delete(id); }
}

async function publish() {
  if (!ch || !joined) return;
  await ch.track({ mode, mic, cam, at: Date.now() });
}

// ---------- entrar / sair ----------
export function openChoice() {
  if (joined) { openUi(); return; }
  const info = callInfo();
  const close = sheet(
    h('h3', null, info.active ? 'Entrar na ligação' : 'Chamar o Conselho'),
    h('p', { class: 'muted', style: { margin: '0 4px', fontSize: '14px', lineHeight: 1.5 } }, info.active
      ? `${info.count} ${info.count === 1 ? 'pessoa já está' : 'pessoas já estão'} conversando. Entra do jeito que preferir.`
      : 'Todo mundo recebe o aviso e entra quando quiser.'),
    h('div', { class: 'mode-choice' },
      h('button', { type: 'button', onClick: () => { close(); join('voice'); } }, h('span', { class: 'ic' }, icon('phone', 22, 2)), h('span', null, 'Só voz', h('small', null, 'Gasta menos internet'))),
      h('button', { type: 'button', onClick: () => { close(); join('video'); } }, h('span', { class: 'ic' }, icon('video', 22, 2)), h('span', null, 'Com vídeo', h('small', null, 'Câmera ligada')))),
  );
}

export async function join(m) {
  if (joined) { openUi(); return; }
  if (!navigator.mediaDevices?.getUserMedia) { toast('Este aparelho não permite ligação aqui.'); return; }
  if (!subscribed) { toast('Conectando… tente de novo em instantes.'); return; }
  mode = m;
  state.suppressLock = true;
  try {
    local = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      video: m === 'video' ? { facingMode: facing, width: { ideal: 640 }, height: { ideal: 480 } } : false,
    });
  } catch {
    toast(m === 'video' ? 'Permita a câmera e o microfone para entrar.' : 'Permita o microfone para entrar.');
    return;
  } finally {
    setTimeout(() => { state.suppressLock = false; }, 1500);
  }
  const wasEmpty = participants.size === 0;
  joined = true;
  mic = true;
  cam = m === 'video';
  buzz(25);
  await publish();
  if (wasEmpty) {
    sb.from('messages').insert({ kind: 'call', body: m === 'video' ? 'Chamada de vídeo' : 'Chamada de voz', meta: { mode: m } }).then(() => {});
  }
  openUi();
  emit('call', callInfo());
}

export async function leave() {
  if (!joined) return;
  joined = false;
  for (const id of [...peers.keys()]) dropPeer(id);
  earlyIce.clear();
  local?.getTracks().forEach((t) => t.stop());
  local = null;
  stopMeters();
  clearInterval(clockTimer);
  buzz(15);
  try { await ch?.untrack(); } catch { /* ok */ }
  ui?.remove(); ui = null; grid = null;
  mini?.remove(); mini = null;
  tiles.clear();
  emit('call', callInfo());
}

function toggleMic(btn) {
  mic = !mic;
  local?.getAudioTracks().forEach((t) => { t.enabled = mic; });
  btn.classList.toggle('off', !mic);
  btn.replaceChildren(icon(mic ? 'mic' : 'micOff', 24));
  publish();
  renderTiles();
}

function toggleCam(btn) {
  cam = !cam;
  local?.getVideoTracks().forEach((t) => { t.enabled = cam; });
  btn.classList.toggle('off', !cam);
  btn.replaceChildren(icon(cam ? 'video' : 'videoOff', 24));
  publish();
  renderTiles();
}

async function flipCam() {
  if (!local?.getVideoTracks()[0]) return;
  facing = facing === 'user' ? 'environment' : 'user';
  try {
    state.suppressLock = true;
    const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing, width: { ideal: 640 }, height: { ideal: 480 } } });
    const nt = s.getVideoTracks()[0];
    const old = local.getVideoTracks()[0];
    for (const { pc } of peers.values()) {
      const sender = pc.getSenders().find((x) => x.track?.kind === 'video');
      await sender?.replaceTrack(nt);
    }
    local.removeTrack(old); old.stop(); local.addTrack(nt);
    nt.enabled = cam;
    const t = tiles.get(state.me.id);
    if (t) { t.video.srcObject = local; t.el.classList.toggle('me', facing === 'user'); }
  } catch {
    toast('Não deu pra trocar a câmera.');
  } finally {
    setTimeout(() => { state.suppressLock = false; }, 1500);
  }
}

// ---------- tela da ligação ----------
function openUi() {
  mini?.remove(); mini = null;
  if (ui) { ui.style.display = ''; renderTiles(); return; }
  subtitle = h('span', { class: 'small muted' });
  grid = h('div', { class: 'call-grid' });
  const micBtn = h('button', { type: 'button', 'aria-label': 'Microfone' }, icon('mic', 24));
  micBtn.addEventListener('click', () => toggleMic(micBtn));
  const controls = [micBtn];
  if (mode === 'video') {
    const camBtn = h('button', { type: 'button', 'aria-label': 'Câmera' }, icon('video', 24));
    camBtn.addEventListener('click', () => toggleCam(camBtn));
    controls.push(camBtn, h('button', { type: 'button', 'aria-label': 'Trocar câmera', onClick: flipCam }, icon('flip', 24)));
  }
  controls.push(h('button', { type: 'button', class: 'hang', 'aria-label': 'Sair da ligação', onClick: leave }, icon('phoneOff', 24)));
  ui = h('div', { class: 'call', role: 'dialog', 'aria-label': 'Ligação do grupo' },
    h('div', { class: 'call-top' },
      h('div', { class: 'grow' }, h('b', null, 'Ligação do Conselho'), subtitle),
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Minimizar ligação', onClick: minimize }, icon('minimize', 20))),
    grid,
    h('div', { class: 'call-controls' }, controls));
  document.body.append(ui);
  clearInterval(clockTimer);
  clockTimer = setInterval(renderTiles, 1000);
  renderTiles();
}

function minimize() {
  if (!ui) return;
  ui.style.display = 'none';
  mini?.remove();
  mini = h('button', { type: 'button', class: 'call-mini', onClick: openUi }, icon('phone', 16, 2.2), `Na ligação · ${participants.size} · voltar`);
  document.body.append(mini);
}

function renderTiles() {
  if (mini) mini.lastChild.textContent = `Na ligação · ${participants.size} · voltar`;
  if (!grid) return;
  const ids = [state.me.id, ...[...participants.keys()].filter((id) => id !== state.me.id)];
  const starts = [...participants.values()].map((p) => p.at).filter(Boolean);
  const since = starts.length ? Math.min(...starts) : Date.now();
  subtitle.replaceChildren(h('span', { class: 'timer' }, fmtDur((Date.now() - since) / 1000)), ` · ${ids.length} ${ids.length === 1 ? 'pessoa' : 'pessoas'} · ${mode === 'video' ? 'vídeo' : 'voz'}`);
  grid.classList.toggle('one', ids.length <= 2);
  for (const id of [...tiles.keys()]) if (!ids.includes(id)) { tiles.get(id).el.remove(); tiles.delete(id); }
  for (const id of ids) {
    const isMe = id === state.me.id;
    let t = tiles.get(id);
    if (!t) {
      const video = h('video', { autoplay: true, playsinline: true });
      video.setAttribute('playsinline', '');
      if (isMe) video.muted = true;
      const av = avatar(state.members.get(id), 84);
      const name = h('span', { class: 'name' });
      const el = h('div', { class: `tile ${isMe && facing === 'user' ? 'me' : ''}` }, video, av, name);
      t = { el, video, av, name };
      tiles.set(id, t);
      grid.append(el);
    }
    const stream = isMe ? local : peers.get(id)?.stream;
    if (stream && t.video.srcObject !== stream) {
      t.video.srcObject = stream;
      t.video.play().catch(() => {});
    }
    if (stream) meter(id, stream);
    const info = isMe ? { cam, mic } : participants.get(id) || {};
    const liveVideo = stream?.getVideoTracks().some((v) => v.readyState === 'live' && !v.muted);
    const showVideo = !!info.cam && (isMe ? !!local?.getVideoTracks()[0] : liveVideo);
    t.video.style.display = showVideo ? '' : 'none';
    t.av.style.display = showVideo ? 'none' : '';
    const st = !isMe ? peers.get(id)?.pc.connectionState : 'connected';
    const label = isMe ? 'Você' : memberName(id);
    t.name.replaceChildren(...[info.mic === false ? icon('micOff', 13, 2.2) : null, label,
      !isMe && st && st !== 'connected' ? h('span', { class: 'muted' }, ' · conectando…') : null].filter(Boolean));
  }
}
