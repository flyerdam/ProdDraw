"use strict";
async function saveToLib() {
  const ss = selShapes(); if (!ss.length) return toast(t('t.min2'));
  const name = await promptDialog(t('p.libName'), t('lib.default1'));
  if (!name) return;
  const b = unionBBox(ss);
  const shapes = ss.map(s => {
    const c = JSON.parse(JSON.stringify(s));
    delete c.id; delete c.g;
    if (c.type === 'line') { c.x1 -= b.x; c.y1 -= b.y; c.x2 -= b.x; c.y2 -= b.y; }
    else { c.x -= b.x; c.y -= b.y; }
    return c;
  });
  lib.push({ name, shapes });
  saveLib(); renderLib();
  toast(t('t.libSaved') + name);
}
function placeLib(item) {
  pushUndo();
  const r = cv.getBoundingClientRect();
  const c = { x: (r.width / 2 - view.x) / view.z, y: (r.height / 2 - view.y) / view.z };
  const b = unionBBox(item.shapes) || { w: 0, h: 0 };
  const off = snapPt({ x: c.x - b.w / 2, y: c.y - b.h / 2 }); guides = [];
  const g = 'G' + Date.now().toString(36);
  const copies = item.shapes.map(s => {
    const n = JSON.parse(JSON.stringify(s));
    n.id = uid(); n.g = g;
    if (n.type === 'line') { n.x1 += off.x; n.y1 += off.y; n.x2 += off.x; n.y2 += off.y; }
    else { n.x += off.x; n.y += off.y; }
    return n;
  });
  state.shapes.push(...copies);
  setSelection(copies.map(a => a.id)); autosave();
}
function saveLibFolders() { try { localStorage.setItem('prodrys_libfolders', JSON.stringify(libFolders)); } catch (e) {} }
function moveLibToFolder(i, folder) {
  if (i < 0 || i >= lib.length) return;
  lib[i].folder = folder || ''; saveLib(); renderLib();
}
function renderLib() {
  const el = $('#tab-lib');
  const tile = i => {
    const item = lib[i];
    const b = buildSVG(item.shapes, null, 6);
    return `<div class="libTile" draggable="true" data-libdrag="${i}">
      <div class="libThumb" data-lib="${i}" title="${t('lib.insertHint')}">${b ? b.svg : ''}</div>
      <div class="cap" title="${escXml(item.name)}">${escXml(item.name)}</div>
      <div class="tileBar"><span class="grab" title="${t('lib.drag')}">⠿</span>
        <button class="miniBtn" data-libdel="${i}" title="${t('props.del')}"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div></div>`;
  };
  const idxByFolder = f => lib.map((it, i) => ({ it, i })).filter(o => (o.it.folder || '') === f).map(o => o.i);
  const grid = ids => ids.length ? `<div class="libGrid">${ids.map(tile).join('')}</div>` : `<div class="empty" style="padding:8px">${t('lib.emptyFolder')}</div>`;
  let h = `<div class="hint" style="margin-bottom:8px">${t('lib.hint')}<br>${t('lib.dragHint')}</div>`;
  h += `<div class="row" style="margin-bottom:8px"><button class="btn" id="libAddFolder">${t('lib.newFolder')}</button></div>`;
  if (!lib.length) h += `<div class="empty">${t('lib.empty')}</div>`;
  /* korzeń (też cel upuszczenia) */
  h += `<div class="libDrop" data-drop=""><div class="libFolderHead"><span>▾ ${t('lib.root')}</span></div>${grid(idxByFolder(''))}</div>`;
  /* foldery */
  for (const f of libFolders) {
    const col = !!libCollapsed[f];
    h += `<div class="libDrop" data-drop="${escXml(f)}">
      <div class="libFolderHead" data-fold="${escXml(f)}"><span>${col ? '▸' : '▾'} 📁 ${escXml(f)}</span><button class="fdel" data-fdel="${escXml(f)}" title="${t('props.del')}">✕</button></div>
      ${col ? '' : grid(idxByFolder(f))}</div>`;
  }
  el.innerHTML = h;
  $('#libAddFolder').addEventListener('click', async () => {
    const n = ((await promptDialog(t('lib.folderName'))) || '').trim();
    if (!n || libFolders.includes(n)) return;
    libFolders.push(n); saveLibFolders(); renderLib();
  });
  $$('#tab-lib [data-lib]').forEach(n => n.addEventListener('click', () => placeLib(lib[+n.dataset.lib])));
  $$('#tab-lib [data-libdel]').forEach(n => n.addEventListener('click', ev => {
    ev.stopPropagation();
    if (!confirm(t('c.delLib', { n: lib[+n.dataset.libdel].name }))) return;
    lib.splice(+n.dataset.libdel, 1); saveLib(); renderLib();
  }));
  /* zwijanie folderu (klik w nagłówek) */
  $$('#tab-lib [data-fold]').forEach(n => n.addEventListener('click', ev => {
    if (ev.target.closest('.fdel')) return;
    const f = n.dataset.fold; libCollapsed[f] = !libCollapsed[f]; renderLib();
  }));
  $$('#tab-lib [data-fdel]').forEach(n => n.addEventListener('click', ev => {
    ev.stopPropagation();
    const f = n.dataset.fdel;
    if (!confirm(t('c.delFolder', { n: f }))) return;
    lib.forEach(it => { if ((it.folder || '') === f) it.folder = ''; });
    libFolders = libFolders.filter(x => x !== f); delete libCollapsed[f];
    saveLib(); saveLibFolders(); renderLib();
  }));
  /* drag & drop kafelków między folderami */
  $$('#tab-lib [data-libdrag]').forEach(n => n.addEventListener('dragstart', ev => {
    ev.dataTransfer.setData('text/plain', n.dataset.libdrag); ev.dataTransfer.effectAllowed = 'move';
  }));
  $$('#tab-lib [data-drop]').forEach(zone => {
    zone.addEventListener('dragover', ev => { ev.preventDefault(); zone.classList.add('dropOn'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('dropOn'));
    zone.addEventListener('drop', ev => {
      ev.preventDefault(); zone.classList.remove('dropOn');
      const i = parseInt(ev.dataTransfer.getData('text/plain'), 10);
      if (!isNaN(i)) moveLibToFolder(i, zone.dataset.drop);
    });
  });
}
function saveLib() { try { localStorage.setItem('prodrys_lib', JSON.stringify(lib)); } catch (e) {} }
function defaultLibItems() {
  return [{
    name: 'Linia wymiarowa',
    shapes: [
      { type: 'line', x1: 0, y1: 10, x2: 0, y2: 42, stroke: '#111827', sw: 1.5, dash: 'solid', as: false, ae: false },
      { type: 'line', x1: 160, y1: 10, x2: 160, y2: 42, stroke: '#111827', sw: 1.5, dash: 'solid', as: false, ae: false },
      { type: 'line', x1: 0, y1: 26, x2: 160, y2: 26, stroke: '#111827', sw: 1.5, dash: 'solid', as: true, ae: true },
      { type: 'rect', x: 50, y: 0, w: 60, h: 20, fill: '#ffffff', noFill: true, noStroke: true,
        stroke: '#111827', sw: 1, dash: 'solid', text: '{A}', fs: 13, tc: '#111827', bold: false }
    ]
  }, {
    name: 'Balon nr części',
    shapes: [
      { type: 'line', x1: 8, y1: 52, x2: 34, y2: 26, stroke: '#111827', sw: 1.5, dash: 'solid', as: true, ae: false },
      { type: 'ellipse', x: 26, y: 0, w: 36, h: 36, fill: '#ffffff', noFill: false, noStroke: false,
        stroke: '#111827', sw: 2, dash: 'solid', text: '1', fs: 15, tc: '#111827', bold: true }
    ]
  }];
}
function seedLib() { lib = defaultLibItems(); saveLib(); }

