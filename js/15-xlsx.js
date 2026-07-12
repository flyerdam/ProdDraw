"use strict";
function insertImageURL(url) {
  const img = new Image();
  img.onload = () => {
    pushUndo();
    const maxW = 480;
    const k = img.naturalWidth > maxW ? maxW / img.naturalWidth : 1;
    const r = cv.getBoundingClientRect();
    /* kaskada — kolejne obrazy nie nakładają się na siebie */
    const off = (imgCascade % 10) * 28 / view.z;
    imgCascade++;
    const c = { x: (r.width / 2 - view.x) / view.z + off, y: (r.height / 2 - view.y) / view.z + off };
    const s = { id: uid(), type: 'image', href: url,
      x: c.x - img.naturalWidth * k / 2, y: c.y - img.naturalHeight * k / 2,
      w: img.naturalWidth * k, h: img.naturalHeight * k };
    state.shapes.push(s);
    setSelection([s.id]); setTool('select'); autosave();
  };
  img.onerror = () => toast(t('t.imgLoadErr'));
  img.src = url;
}
function fileToDataURL(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}
/* wklejanie: obraz ze schowka (np. zrzut z CATII) lub skopiowane kształty */
const CLIP_PREFIX = 'PRODDRAW_SHAPES:';
document.addEventListener('paste', async e => {
  if (document.activeElement && ['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;
  /* skopiowane kształty (autorytatywne — nadpisują stary obrazek w schowku) */
  const txt = (e.clipboardData && e.clipboardData.getData('text/plain')) || '';
  if (txt.startsWith(CLIP_PREFIX)) {
    e.preventDefault();
    clip = txt.slice(CLIP_PREFIX.length);
    pasteClip();
    return;
  }
  const items = [...(e.clipboardData?.items || [])];
  const imgItem = items.find(i => i.type.startsWith('image/'));
  if (imgItem) {
    e.preventDefault();
    insertImageURL(await fileToDataURL(imgItem.getAsFile()));
    toast(t('t.pasteImg'));
    return;
  }
  /* obrazy w HTML ze schowka (np. kształty/zakres skopiowane z Excela) */
  const html = e.clipboardData?.getData('text/html');
  if (html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const srcs = [...doc.querySelectorAll('img')].map(im => im.getAttribute('src'))
      .filter(src => src && /^data:image\//.test(src));
    if (srcs.length) {
      e.preventDefault();
      srcs.forEach(src => insertImageURL(src));
      toast(t('t.pasteImg'));
      return;
    }
  }
  if (clip) { e.preventDefault(); pasteClip(); }
});
function copySel() {
  const ss = selShapes(); if (!ss.length) return;
  clip = JSON.stringify(ss);
  /* nadpisz schowek systemowy naszymi kształtami (usuwa stary obrazek) */
  try { if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(CLIP_PREFIX + clip); } catch (e) {}
  toast(t('t.copied') + ss.length);
}
function pasteClip() {
  if (!clip) return;
  pushUndo();
  const gmap = {};
  const copies = JSON.parse(clip).map(s => {
    s.id = uid();
    if (s.g) { gmap[s.g] = gmap[s.g] || ('G' + uid()); s.g = gmap[s.g]; }
    if (s.type === 'line') { s.x1 += 18; s.y1 += 18; s.x2 += 18; s.y2 += 18; }
    else { s.x += 18; s.y += 18; }
    return s;
  });
  state.shapes.push(...copies);
  setSelection(copies.map(c => c.id)); autosave();
}
/* import XLSX/XLSM — tylko osadzone obrazy (bez „śmieciowych" kształtów) */
/* buforowana lista elementów importu XLSX (obrazy + kształty do wyboru) */
let xlsxImportItems = [];
function buildImageShapeFromURL(url, offset = 0) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => {
      const maxW = 480;
      const k = img.naturalWidth > maxW ? maxW / img.naturalWidth : 1;
      const r = cv.getBoundingClientRect();
      const c = { x: (r.width / 2 - view.x) / view.z, y: (r.height / 2 - view.y) / view.z };
      res({ id: uid(), type: 'image', href: url,
        x: c.x - img.naturalWidth * k / 2 + offset, y: c.y - img.naturalHeight * k / 2 + offset,
        w: img.naturalWidth * k, h: img.naturalHeight * k });
    };
    img.onerror = () => rej(new Error('Image load failed'));
    img.src = url;
  });
}
function cloneShapesWithFreshIds(shapes) {
  const gMap = {};
  return shapes.map(s => {
    const n = JSON.parse(JSON.stringify(s));
    n.id = uid();
    if (n.g) { gMap[n.g] = gMap[n.g] || ('G' + uid()); n.g = gMap[n.g]; }
    return n;
  });
}
function closeXlsxModal() {
  $('#xlModal').classList.remove('on');
  for (const it of xlsxImportItems) if (it.kind === 'image' && it.previewUrl) URL.revokeObjectURL(it.previewUrl);
  xlsxImportItems = [];
}
function renderXlsxImportPicker(skippedEMF = 0) {
  const body = $('#xlBody'); body.innerHTML = '';
  const ctl = document.createElement('div');
  ctl.style.cssText = 'grid-column:1/-1;display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:6px;';
  const allCb = document.createElement('input');
  allCb.type = 'checkbox';
  allCb.checked = xlsxImportItems.every(i => i.selected);
  const allLbl = document.createElement('label');
  allLbl.className = 'hint';
  allLbl.style.cssText = 'display:flex;align-items:center;gap:6px;cursor:pointer;';
  allLbl.appendChild(allCb);
  allLbl.appendChild(document.createTextNode(t('xl.selectAll')));
  const importBtn = document.createElement('button');
  importBtn.className = 'btn primary';
  importBtn.textContent = t('xl.importSel');
  importBtn.addEventListener('click', applySelectedXlsxItems);
  ctl.appendChild(allLbl); ctl.appendChild(importBtn);
  body.appendChild(ctl);
  allCb.addEventListener('change', () => {
    xlsxImportItems.forEach(i => i.selected = allCb.checked);
    renderXlsxImportPicker(skippedEMF);
  });
  xlsxImportItems.forEach((it, idx) => {
    const d = document.createElement('div');
    d.className = 'xlImg';
    const checked = it.selected ? 'checked' : '';
    if (it.kind === 'image') {
      d.innerHTML = `<div class="xlSel"><label><input type="checkbox" data-xlpick="${idx}" ${checked}> ${t('xl.image')}</label></div><img src="${it.previewUrl}"><div>${escXml(it.name)}</div>`;
    } else {
      d.innerHTML = `<div class="xlSel"><label><input type="checkbox" data-xlpick="${idx}" ${checked}> ${t('xl.shape')}</label></div><div class="xlShapePrev"><svg viewBox="0 0 120 90">${shapeSVG(it.shape, null, false)}</svg></div><div>${escXml(it.name)}</div>`;
    }
    body.appendChild(d);
  });
  $$('#xlBody [data-xlpick]').forEach(cb => cb.addEventListener('change', e => {
    xlsxImportItems[+e.target.dataset.xlpick].selected = e.target.checked;
  }));
  if (skippedEMF) {
    const w = document.createElement('div');
    w.className = 'hint'; w.style.gridColumn = '1/-1';
    w.textContent = t('t.emfHint', { n: skippedEMF });
    body.appendChild(w);
  }
}
async function applySelectedXlsxItems() {
  const selected = xlsxImportItems.filter(i => i.selected);
  if (!selected.length) return toast(t('xl.nothing'));
  state.page = { mode: 'off' };
  syncPageUI();
  pushUndo();
  const add = [];
  let imageN = 0, shapeN = 0;
  for (const it of selected) {
    if (it.kind === 'shape') {
      add.push(...cloneShapesWithFreshIds([it.shape]));
      shapeN++;
    } else {
      try {
        const dataUrl = await fileToDataURL(new Blob([it.data], { type: it.mime }));
        if (it.anchored) add.push({ id: uid(), type: 'image', href: dataUrl, x: it.x, y: it.y, w: it.w, h: it.h });
        else add.push(await buildImageShapeFromURL(dataUrl, imageN * 18));
        imageN++;
      } catch (e) {}
    }
  }
  if (!add.length) return toast(t('xl.fail'));
  const normalized = add.map(normalizeShape);
  state.shapes.push(...normalized);
  setSelection(normalized.map(a => a.id));
  render(); renderProps(); autosave();
  closeXlsxModal();
  toast(t('xl.done', { i: imageN, s: shapeN }));
  /* zamiast od razu kończyć — pokaż kreator kadru roboczego nad świeżo
     zaimportowanymi elementami (patrz xlsxCropStart poniżej) */
  xlsxCropStart(normalized);
}

/* =====================================================================
   KREATOR KADRU po imporcie XLSX — pozwala zaznaczyć obszar roboczy
   (przeciągnięciem na kanwie) i dopasować do niego format strony,
   opcjonalnie usuwając kształty leżące całkowicie poza nim.
   ===================================================================== */
function xlsxCropDefaultBox(shapes) {
  const b = unionBBox(shapes);
  if (!b) return { x: 0, y: 0, w: 400, h: 300 };
  const pad = 20;
  return { x: Math.round(b.x - pad), y: Math.round(b.y - pad), w: Math.round(b.w + pad * 2), h: Math.round(b.h + pad * 2) };
}
let xlsxCropImportedIds = null;   // id-y kształtów pochodzących z TEGO importu (do filtra "usuń poza obszarem")
function xlsxCropStart(justImportedShapes) {
  xlsxCropBox = xlsxCropDefaultBox(justImportedShapes);
  xlsxCropImportedIds = new Set(justImportedShapes.map(s => s.id));
  xlsxCropActive = true;
  const bar = $('#xlsxCropBar'); if (bar) bar.classList.add('on');
  const cb = $('#xlsxCropRemoveOutside'); if (cb) cb.checked = false;
  render();
}
function xlsxCropEnd() {
  xlsxCropActive = false; xlsxCropBox = null; xlsxCropImportedIds = null;
  const bar = $('#xlsxCropBar'); if (bar) bar.classList.remove('on');
  render();
}
function xlsxCropConfirm() {
  const box = xlsxCropBox;
  if (!box || box.w < 2 || box.h < 2) { toast(t('xlsxcrop.badBox')); return; }
  const removeOutside = !!($('#xlsxCropRemoveOutside') && $('#xlsxCropRemoveOutside').checked);
  const importedIds = xlsxCropImportedIds || new Set();
  pushUndo();
  if (removeOutside) {
    state.shapes = state.shapes.filter(s => {
      if (!importedIds.has(s.id)) return true;   /* nie ruszaj kształtów spoza tego importu */
      const b = aabbOf(s);
      /* usuń tylko te CAŁKOWICIE poza kadrem — zostaw wszystko, co choć trochę zachodzi */
      return b.x < box.x + box.w && b.x + b.w > box.x && b.y < box.y + box.h && b.y + b.h > box.y;
    });
  }
  const dx = -box.x, dy = -box.y;
  for (const s of state.shapes) {
    if (s.type === 'line') { s.x1 += dx; s.y1 += dy; s.x2 += dx; s.y2 += dy; }
    else { s.x += dx; s.y += dy; }
  }
  state.page = { mode: 'custom', w: Math.max(10, Math.round(box.w)), h: Math.max(10, Math.round(box.h)) };
  syncPageUI();
  xlsxCropEnd();
  sel.clear();
  fitPage(); render(); renderProps(); renderVars(); autosave();
  toast(t('xlsxcrop.done'));
}
$('#xlsxCropConfirm').addEventListener('click', xlsxCropConfirm);
$('#xlsxCropCancel').addEventListener('click', () => { xlsxCropEnd(); toast(t('xlsxcrop.cancelled')); });
/* import XLSX/XLSM — obrazy + kształty wektorowe (z pozycjami z arkusza) */
async function importXlsx(file) {
  try {
    if (typeof DecompressionStream === 'undefined') return toast(t('t.noDecomp'));
    toast(t('t.reading'));
    const buf = await file.arrayBuffer();
    const allFiles = await readZipAll(buf);
    const td = new TextDecoder();
    const mediaFiles = allFiles.filter(f => /^xl\/media\//i.test(f.name) && /\.(png|jpe?g|gif|bmp|webp)$/i.test(f.name));
    const mediaMap = {};
    mediaFiles.forEach(m => mediaMap[m.name] = { data: m.data, mime: mediaMimeFromName(m.name) });
    /* zmapuj każdy arkusz (sheetK.xml) na jego drawingN.xml (przez sheetK.xml.rels),
       żeby użyć WŁAŚCIWYCH wymiarów kolumn/wierszy TEGO arkusza — wcześniej zawsze
       brano pierwszy napotkany arkusz w archiwum, co psuło skalowanie/pozycję
       rysunków należących do arkusza 2, 3 itd. w skoroszytach wielo-arkuszowych */
    const sheetFiles = allFiles.filter(f => /^xl\/worksheets\/sheet\d+\.xml$/i.test(f.name));
    const drawingDims = {};   // 'xl/drawings/drawingN.xml' -> {colWidths, rowHeights} arkusza-właściciela
    for (const sf of sheetFiles) {
      const relPath = sf.name.replace(/^xl\/worksheets\//i, 'xl/worksheets/_rels/') + '.rels';
      const relFile = allFiles.find(f => f.name === relPath);
      if (!relFile) continue;
      const relXml = td.decode(relFile.data);
      for (const rm of relXml.matchAll(/<Relationship\b[^>]*\/?>/g)) {
        const tag = rm[0];
        const typeM = tag.match(/\bType="([^"]+)"/), targetM = tag.match(/\bTarget="([^"]+)"/);
        if (!typeM || !targetM || !/\/drawing$/i.test(typeM[1])) continue;
        const drawingPath = resolveRelTarget(sf.name, targetM[1]);
        if (drawingPath) drawingDims[drawingPath] = parseSheetDims(td.decode(sf.data));
      }
    }
    /* awaryjnie (brak .rels albo relacji arkusz->rysunek) — wymiary pierwszego arkusza */
    const fallbackDims = sheetFiles.length ? parseSheetDims(td.decode(sheetFiles[0].data)) : parseSheetDims('');

    const drawingFiles = allFiles.filter(f => /^xl\/drawings\/drawing\d+\.xml$/i.test(f.name));
    const importedShapes = [];
    const anchoredPictures = [];
    let unsupportedFallbacks = 0;
    for (const df of drawingFiles) {
      const relPath = df.name.replace(/^xl\/drawings\//i, 'xl/drawings/_rels/') + '.rels';
      const relFile = allFiles.find(f => f.name === relPath);
      const relMap = relFile ? parseDrawingRels(td.decode(relFile.data), df.name) : {};
      const dims = drawingDims[df.name] || fallbackDims;
      const parsed = parseDrawingShapes(td.decode(df.data), dims, relMap, mediaMap);
      importedShapes.push(...parsed.shapes);
      anchoredPictures.push(...parsed.pictures.map(p => ({ ...p, anchored: true })));
      unsupportedFallbacks += parsed.unsupportedFallbacks || 0;
    }
    const skippedEMF = allFiles.filter(f => /^xl\/media\//i.test(f.name) && /\.(emf|wmf)$/i.test(f.name)).length;
    if (!mediaFiles.length && !importedShapes.length && !anchoredPictures.length)
      return toast(t('xl.none') + (skippedEMF ? t('xl.emf', { n: skippedEMF }) : ''));
    closeXlsxModal();
    xlsxImportItems = [];
    const usedAnchored = new Set(anchoredPictures.map(p => 'xl/media/' + p.name.replace(/^xl\/media\//i, '')));

    /* uszereguj zakotwiczone elementy wg powierzchni MALEJĄCO, żeby duże tła trafiały
       na spód stosu (dodawane pierwsze = niższy z-order), a drobne detale i podpisy
       zostały na wierzchu, zamiast być przysłonięte przez większe kontenery */
    const anchoredCombined = [
      ...anchoredPictures.map(p => ({ kind: 'image', p, area: (p.w || 0) * (p.h || 0) })),
      ...importedShapes.map(s => ({ kind: 'shape', s, area: (s.w || 0) * (s.h || 0) }))
    ];
    anchoredCombined.sort((a, b) => b.area - a.area);

    let shapeIdx = 0;
    for (const it of anchoredCombined) {
      if (it.kind === 'image') {
        const p = it.p;
        xlsxImportItems.push({ kind: 'image', name: p.name, data: p.data, mime: p.mime, anchored: true,
          x: p.x, y: p.y, w: p.w, h: p.h,
          previewUrl: URL.createObjectURL(new Blob([p.data], { type: p.mime })), selected: true });
      } else {
        xlsxImportItems.push({ kind: 'shape', name: `${it.s.type}_${++shapeIdx}`, shape: it.s, selected: true });
      }
    }
    for (const m of mediaFiles) {
      if (usedAnchored.has(m.name)) continue;
      const mime = mediaMimeFromName(m.name);
      xlsxImportItems.push({ kind: 'image', name: m.name.replace('xl/media/', ''), data: m.data, mime, anchored: false,
        previewUrl: URL.createObjectURL(new Blob([m.data], { type: mime })), selected: true });
    }
    const imgN = xlsxImportItems.filter(i => i.kind === 'image').length;
    const shapeN = xlsxImportItems.length - imgN;
    $('#xlModal').querySelector('h3').textContent = t('xl.count', { i: imgN, s: shapeN });
    renderXlsxImportPicker(skippedEMF);
    if (unsupportedFallbacks) {
      const w = document.createElement('div');
      w.className = 'hint'; w.style.gridColumn = '1/-1';
      w.textContent = t('xl.fallback', { n: unsupportedFallbacks });
      $('#xlBody').appendChild(w);
    }
    $('#xlModal').classList.add('on');
  } catch (err) { toast(t('t.importErr') + err.message); }
}

/* =====================================================================
   PASEK GÓRNY, NARZĘDZIA, KLAWIATURA, INICJALIZACJA
   ===================================================================== */
function setTool(name) {
  tool = name;
  $$('.tool').forEach(b => b.classList.toggle('on', b.dataset.tool === name));
  cv.setAttribute('class', 't-' + name);
}
$$('.tool').forEach(b => b.addEventListener('click', () => {
  if (b.dataset.tool === 'image') { $('#fImg').click(); return; }
  if (b.dataset.tool === 'shapes') { openShapeModal(); return; }
  setTool(b.dataset.tool);
}));
$$('.tab').forEach(b => b.addEventListener('click', () => {
  $$('.tab').forEach(t => t.classList.toggle('on', t === b));
  $$('.tabBody').forEach(t => t.classList.toggle('on', t.id === 'tab-' + b.dataset.tab));
}));
