import { sb } from './sb.js';
import { state, emit, applySettings } from './state.js';
import { h, icon, logo, toast, errMsg } from './ui.js';
import { LOCK_AFTER_MS } from './config.js';
import { renderAuth, showLock, isLocked } from './screens/auth.js';
import { clearPassword } from './lock.js';
import * as call from './call.js';

import Chat from './screens/chat.js';
import Conselho from './screens/conselho.js';
import { PautaScreen, NovaPauta } from './screens/pauta.js';
import { NovaVotacao, VotacaoScreen } from './screens/votacao.js';
import Figurinhas from './screens/figurinhas.js';
import Editor from './screens/editor.js';
import Membros from './screens/membros.js';
import Perfil from './screens/perfil.js';

const root = document.getElementById('app');
applySettings();

const routes = {
  chat: { view: Chat, tab: 'chat' },
  conselho: { view: Conselho, tab: 'conselho' },
  pauta: { view: PautaScreen },
  'nova-pauta': { view: NovaPauta },
  'nova-votacao': { view: NovaVotacao },
  votacao: { view: VotacaoScreen },
  figurinhas: { view: Figurinhas, tab: 'figurinhas' },
  editor: { view: Editor },
  membros: { view: Membros, tab: 'membros' },
  perfil: { view: Perfil },
};

const TABS = [
  ['chat', 'Conversa', 'chat'],
  ['conselho', 'Conselho', 'assembly'],
  ['figurinhas', 'Figurinhas', 'sticker'],
  ['membros', 'Membros', 'users'],
];

function parseRoute() {
  const raw = location.hash.replace(/^#/, '') || 'chat';
  const [path, qs] = raw.split('?');
  const [name, id] = path.split('/');
  return { name, id, q: new URLSearchParams(qs || '') };
}

let current = null;
let main, tabbar;

function buildShell() {
  main = h('div', { class: 'screen' });
  tabbar = h('nav', { class: 'tabbar', 'aria-label': 'Menu principal' },
    TABS.map(([id, label, ic]) => h('a', { href: `#${id}`, 'data-tab': id }, icon(ic, 23, 1.7), label)));
  root.replaceChildren(main, tabbar);
  updateBadge();
}

// ---------- mensagens não lidas (bolinha na aba Conversa) ----------
const READ_KEY = 'conselho-last-read';
export const getLastRead = () => Number(localStorage.getItem(READ_KEY) || 0);
export function markRead(id) { if (id > getLastRead()) localStorage.setItem(READ_KEY, String(id)); state.unread = 0; updateBadge(); }
function updateBadge() {
  const a = tabbar?.querySelector('a[data-tab="chat"]');
  if (!a) return;
  a.querySelector('.badge')?.remove();
  if (state.unread > 0) a.append(h('span', { class: 'badge' }, state.unread > 99 ? '99+' : String(state.unread)));
}
let inboxCh = null;
async function startInbox() {
  const { count } = await sb.from('messages').select('id', { count: 'exact', head: true }).gt('id', getLastRead()).neq('user_id', state.me.id);
  state.unread = count || 0;
  updateBadge();
  inboxCh = sb.channel('inbox')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `group_id=eq.${state.group.id}` }, (p) => {
      if (p.new.user_id === state.me.id) return;
      if (parseRoute().name === 'chat' && !document.hidden) return;
      state.unread++;
      updateBadge();
    })
    .subscribe();
}

async function render() {
  if (!state.ready) return;
  const r = parseRoute();
  const route = routes[r.name] || routes.chat;
  try { current?.destroy?.(); } catch { /* ignore */ }
  current = null;
  const next = h('div', { class: 'screen' });
  main.replaceWith(next);
  main = next;
  tabbar.style.display = route.tab ? '' : 'none';
  tabbar.querySelectorAll('a').forEach((a) => a.classList.toggle('on', a.dataset.tab === route.tab));
  try {
    current = await route.view(main, r);
  } catch (e) {
    console.error(e);
    main.replaceChildren(h('div', { class: 'empty' }, h('span', { class: 'display' }, 'Deu ruim aqui.'), errMsg(e),
      h('button', { class: 'btn ghost', onClick: () => render() }, 'Tentar de novo')));
  }
}
window.addEventListener('hashchange', render);

// ---------- dados do grupo ----------
export async function loadMembers() {
  const { data, error } = await sb.from('profiles').select('*').order('name');
  if (error) throw error;
  state.members = new Map(data.map((p) => [p.id, p]));
  state.me = state.members.get(state.session.user.id) || state.me;
  emit('members');
}

let presenceCh = null;
let profilesCh = null;
function startPresence() {
  presenceCh = sb.channel(`online:${state.group.id}`, { config: { presence: { key: state.me.id } } });
  presenceCh
    .on('presence', { event: 'sync' }, () => {
      state.online = new Set(Object.keys(presenceCh.presenceState()));
      emit('online');
    })
    .subscribe(async (status) => {
      if (status === 'SUBSCRIBED') await presenceCh.track({ at: Date.now() });
    });
  profilesCh = sb.channel('profiles-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles', filter: `group_id=eq.${state.group.id}` }, () => loadMembers().catch(() => {}))
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'groups', filter: `id=eq.${state.group.id}` }, (p) => {
      const { id, name, chat_bg_type, chat_bg_value, chat_bg_dim, chat_bg_by } = p.new;
      state.group = { ...state.group, id, name, chat_bg_type, chat_bg_value, chat_bg_dim, chat_bg_by };
      applySettings();
      emit('group');
    })
    .subscribe();
}

async function startApp() {
  root.replaceChildren(h('div', { class: 'boot' }, logo(64)));
  const { data: { session } } = await sb.auth.getSession();
  state.session = session;
  const { data: me, error } = await sb.from('profiles').select('*').eq('id', session.user.id).maybeSingle();
  if (error) throw error;
  if (!me) {
    toast('Sua conta não está em nenhum grupo.');
    await logout();
    return;
  }
  state.me = me;
  const { data: group } = await sb.from('groups').select('id,name,chat_bg_type,chat_bg_value,chat_bg_dim,chat_bg_by').eq('id', me.group_id).single();
  state.group = group;
  applySettings();
  await loadMembers();
  sb.from('profiles').update({ last_seen: new Date().toISOString() }).eq('id', me.id).then(() => {});
  startPresence();
  call.init();
  buildShell();
  startInbox().catch(() => {});
  state.ready = true;
  if (!location.hash) location.replace('#chat');
  render();
}

export async function logout() {
  state.ready = false;
  call.leave();
  try {
    if (presenceCh) await sb.removeChannel(presenceCh);
    if (profilesCh) await sb.removeChannel(profilesCh);
    if (inboxCh) await sb.removeChannel(inboxCh);
  } catch { /* ignore */ }
  clearPassword();
  await sb.auth.signOut().catch(() => {});
  state.me = null; state.session = null; state.members = new Map();
  location.hash = '';
  boot();
}

function lockNow() {
  if (!state.session) return;
  showLock({
    userId: state.session.user.id,
    username: state.me?.username || state.session.user.email?.split('@')[0],
    name: state.me?.name,
    onLogout: logout,
  });
}
export { lockNow };

// Bloqueia quando o app sai da tela e volta depois de um tempo.
let hiddenAt = 0;
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { hiddenAt = Date.now(); return; }
  if (state.ready && !state.suppressLock && !isLocked() && hiddenAt && Date.now() - hiddenAt > LOCK_AFTER_MS) lockNow();
  hiddenAt = 0;
});

async function boot() {
  try {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) {
      renderAuth(root, () => startApp().catch(fatal));
      return;
    }
    state.session = session;
    showLock({
      userId: session.user.id,
      username: session.user.user_metadata?.username || session.user.email?.split('@')[0],
      name: session.user.user_metadata?.name,
      onUnlock: () => startApp().catch(fatal),
      onLogout: logout,
    });
  } catch (e) { fatal(e); }
}

function fatal(e) {
  console.error(e);
  root.replaceChildren(h('div', { class: 'boot' }, logo(48),
    h('p', { style: { textAlign: 'center', padding: '0 24px', lineHeight: 1.5 } }, 'O Conselho não abriu.', h('br'), errMsg(e)),
    h('button', { class: 'btn primary', onClick: () => location.reload() }, 'Tentar de novo')));
}

sb.auth.onAuthStateChange((event) => {
  if (event === 'SIGNED_OUT' && state.ready) logout();
});

if ('serviceWorker' in navigator && location.protocol === 'https:' && !window.Capacitor) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

boot();
