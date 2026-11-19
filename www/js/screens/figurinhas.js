import { sb } from '../sb.js';
import { state } from '../state.js';
import { h, icon, iconBtn, toast, sheet, confirmBox, pickFile, errMsg } from '../ui.js';
import { isVideoUrl, shareOrDownload } from '../media.js';
import { go } from '../nav.js';

const stickerMedia = (url) => isVideoUrl(url)
  ? h('video', { src: url, autoplay: true, loop: true, muted: true, playsinline: true })
  : h('img', { src: url, alt: '', loading: 'lazy' });

export default async function Figurinhas(root) {
  const packs = h('div', { style: { display: 'flex', flexDirection: 'column', gap: '16px' } }, h('div', { class: 'sticker-grid' }, Array.from({ length: 8 }, () => h('div', { class: 'sk', style: { aspectRatio: '1', borderRadius: '16px' } }))));
  let stickers = [];

  async function choose(kind) {
    const accept = kind === 'video' ? 'video/*,image/gif' : 'image/*';
    const file = await pickFile(accept, { capture: kind === 'camera' ? 'environment' : undefined });
    if (!file) return;
    if (file.size > 60 * 1024 * 1024) return toast('Arquivo grande demais.');
    state.pendingSticker = file;
    go('#editor');
  }

  function openSticker(s) {
    const mine = s.owner_id === state.me.id;
    const ext = isVideoUrl(s.url) ? (s.url.split('.').pop().split('?')[0]) : 'webp';
    const close = sheet(
      h('div', { style: { width: '160px', height: '160px', alignSelf: 'center' } }, stickerMedia(s.url)),
      h('button', { class: 'sheet-item', onClick: async () => {
        close();
        const { error } = await sb.from('messages').insert({ kind: 'sticker', media_url: s.url });
        if (error) return toast(errMsg(error));
        toast('Figurinha enviada no chat');
      } }, icon('send', 20), 'Enviar no chat'),
      h('button', { class: 'sheet-item', onClick: () => { close(); shareOrDownload(s.url, `figurinha-${s.id}.${ext}`); } }, icon('download', 20), 'Exportar / compartilhar'),
      mine ? h('button', { class: 'sheet-item danger', onClick: async () => {
        close();
        if (!(await confirmBox('Apagar esta figurinha do grupo?', 'Apagar', true))) return;
        const { error } = await sb.from('stickers').delete().eq('id', s.id);
        if (error) return toast(errMsg(error));
        load();
      } }, icon('trash', 20), 'Apagar figurinha') : null);
  }

  async function exportPack(list) {
    toast(`Exportando ${list.length} figurinhas…`);
    for (const s of list) {
      const ext = isVideoUrl(s.url) ? s.url.split('.').pop().split('?')[0] : 'webp';
      // eslint-disable-next-line no-await-in-loop
      await shareOrDownload(s.url, `figurinha-${s.id}.${ext}`);
    }
  }

  function draw() {
    if (!stickers.length) {
      packs.replaceChildren(h('div', { class: 'empty' }, h('span', { class: 'display' }, 'Acervo vazio.'), 'Ainda não tem nenhuma figurinha do grupo. A primeira vai virar clássico.'));
      return;
    }
    const byPack = new Map();
    stickers.forEach((s) => { if (!byPack.has(s.pack)) byPack.set(s.pack, []); byPack.get(s.pack).push(s); });
    const mineRecent = stickers.filter((s) => s.owner_id === state.me.id).slice(0, 8);
    const sections = [];
    for (const [name, list] of byPack) {
      sections.push(h('div', { class: 'row between' },
        h('div', null, h('h2', { class: 'display', style: { margin: 0, fontSize: '22px' } }, name), h('span', { class: 'small muted num' }, `${list.length} ${list.length === 1 ? 'figurinha' : 'figurinhas'}`)),
        h('button', { class: 'btn sm line', onClick: () => exportPack(list) }, h('span', { style: { color: 'var(--gold)' } }, icon('download', 16, 2)), 'Exportar')));
      sections.push(grid(list));
    }
    if (mineRecent.length) {
      sections.push(h('div', null, h('h2', { class: 'display', style: { margin: 0, fontSize: '22px' } }, 'Suas'), h('span', { class: 'small muted' }, 'As últimas que você fez')));
      sections.push(grid(mineRecent));
    }
    packs.replaceChildren(...sections);
  }

  const grid = (list) => h('div', { class: 'sticker-grid' },
    list.map((s) => h('button', { type: 'button', class: 'sticker-cell', 'aria-label': 'Figurinha', onClick: () => openSticker(s) }, stickerMedia(s.url))));

  async function load() {
    const { data, error } = await sb.from('stickers').select('*').order('id', { ascending: false }).limit(300);
    if (error) { packs.replaceChildren(h('div', { class: 'empty' }, errMsg(error))); return; }
    stickers = data;
    draw();
  }

  const rt = sb.channel(`stickers-${Date.now()}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'stickers', filter: `group_id=eq.${state.group.id}` }, load)
    .subscribe();

  root.replaceChildren(
    h('div', { class: 'masthead' }, h('div', null, h('span', { class: 'kicker' }, 'Acervo do grupo'), h('h1', { class: 'display' }, 'Figurinhas')),
      iconBtn('plus', 'Criar figurinha', () => choose('image'), 'gold round')),
    h('div', { class: 'scroll' }, h('div', { class: 'pad' },
      h('section', { class: 'panel brass make-card' },
        h('h2', { class: 'display' }, 'Faz uma nova'),
        h('p', { class: 'small', style: { margin: 0, color: '#BDB3A0', lineHeight: 1.5 } }, 'Aquela foto que todo mundo zoa, um vídeo de 3 segundos, um GIF. Recorta, escreve e manda.'),
        h('div', { class: 'sources' },
          h('button', { type: 'button', onClick: () => choose('image') }, h('span', { style: { color: 'var(--gold)' } }, icon('image', 22)), 'Galeria'),
          h('button', { type: 'button', onClick: () => choose('camera') }, h('span', { style: { color: 'var(--gold)' } }, icon('camera', 22)), 'Câmera'),
          h('button', { type: 'button', onClick: () => choose('video') }, h('span', { style: { color: 'var(--gold)' } }, icon('film', 22)), 'Vídeo / GIF'))),
      packs)));
  await load();
  return { destroy: () => sb.removeChannel(rt) };
}
