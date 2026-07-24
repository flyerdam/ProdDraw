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
/* miniatura siatki (grupy kształtów) w oknie wyboru importu */
function gridPreviewSVG(shapes) {
  const b = unionBBox(shapes);
  if (!b || b.w < 1 || b.h < 1) return '<svg viewBox="0 0 120 90"></svg>';
  const inner = shapes.map(s => shapeSVG(s, null, false)).join('');
  return `<svg viewBox="${b.x} ${b.y} ${b.w} ${b.h}" preserveAspectRatio="xMidYMid meet">${inner}</svg>`;
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
    } else if (it.kind === 'grid') {
      d.innerHTML = `<div class="xlSel"><label><input type="checkbox" data-xlpick="${idx}" ${checked}> ${t('xl.grid')}</label></div><div class="xlShapePrev">${gridPreviewSVG(it.shapes)}</div><div>${escXml(it.name)}</div>`;
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
  let imageN = 0, shapeN = 0, gridN = 0;
  for (const it of selected) {
    if (it.kind === 'grid') {
      add.push(...cloneShapesWithFreshIds(it.shapes));
      gridN++;
    } else if (it.kind === 'shape') {
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
  toast(gridN ? t('xl.doneG', { i: imageN, s: shapeN, g: gridN }) : t('xl.done', { i: imageN, s: shapeN }));
  /* pokaż kreator kadru roboczego nad świeżo zaimportowanymi elementami —
     chyba że wyłączone w Ustawieniach (wtedy zachowaj się jak "Nie przycinaj") */
  if (settings.xlsxAutoCrop !== false) xlsxCropStart(normalized);
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
/* "Nie przycinaj" — zachowaj import dokładnie tak, jak został wczytany
   (bez kadrowania/przesunięcia), tylko zamknij kreator */
function xlsxCropSkip() {
  xlsxCropEnd();
  toast(t('xlsxcrop.skipped'));
}
/* "Anuluj" — odrzuć import: usuń kształty pochodzące z TEGO importu (patrz
   xlsxCropImportedIds), jakby import się nie odbył */
function xlsxCropAbort() {
  if (xlsxCropImportedIds && xlsxCropImportedIds.size) {
    pushUndo();
    state.shapes = state.shapes.filter(s => !xlsxCropImportedIds.has(s.id));
    sel.clear();
    render(); renderProps(); renderVars(); autosave();
  }
  xlsxCropEnd();
  toast(t('xlsxcrop.aborted'));
}
$('#xlsxCropConfirm').addEventListener('click', xlsxCropConfirm);
$('#xlsxCropSkip').addEventListener('click', xlsxCropSkip);
$('#xlsxCropCancel').addEventListener('click', xlsxCropAbort);
/* =====================================================================
   WYPIEKANIE SIATKI ARKUSZA na natywne kształty ProdDraw
   ("ekosystem Excela" -> rect (tło) + line (krawędzie) + text (treść))
   ===================================================================== */
let _measureCtx = null;
function measureTextW(txt, fs, bold, italic, font) {
  if (!_measureCtx) _measureCtx = document.createElement('canvas').getContext('2d');
  _measureCtx.font = `${italic ? 'italic ' : ''}${bold ? 'bold ' : ''}${fs}px "${font || 'Calibri'}",Arial,sans-serif`;
  return _measureCtx.measureText(txt).width;
}
/* zawijanie tekstu do szerokości komórki (Excel wrapText) */
function wrapCellText(text, maxW, fs, bold, italic, font) {
  if (maxW <= 0) return text;
  const out = [];
  for (const para of String(text).split('\n')) {
    const words = para.split(/(\s+)/);
    let line = '';
    for (const w of words) {
      const test = line + w;
      if (line && measureTextW(test, fs, bold, italic, font) > maxW) { out.push(line.replace(/\s+$/, '')); line = w.replace(/^\s+/, ''); }
      else line = test;
    }
    out.push(line.replace(/\s+$/, ''));
  }
  return out.join('\n');
}
/* model arkusza -> kształty; krawędzie współdzielone deduplikowane po geometrii;
   z-order: tła (spód) -> krawędzie -> tekst (wierzch) */
function bakeSheetGrid(model, styles, geom, offY, groupId) {
  const { cells, merges } = model;
  const fillsArr = [], textArr = [], borderMap = new Map();
  const covered = new Set(), mergeAt = new Map();
  for (const m of merges) {
    for (let r = m.r1; r <= m.r2; r++) for (let c = m.c1; c <= m.c2; c++)
      if (!(r === m.r1 && c === m.c1)) covered.add(c + ',' + r);
    mergeAt.set(m.c1 + ',' + m.r1, m);
  }
  const addBorder = (x1, y1, x2, y2, b) => {
    if (!b) return;
    const key = Math.round(x1) + ',' + Math.round(y1) + ',' + Math.round(x2) + ',' + Math.round(y2);
    borderMap.set(key, { id: uid(), type: 'line', x1, y1, x2, y2, stroke: b.color, sw: b.sw, dash: b.dash, as: false, ae: false, locked: false, g: groupId });
  };
  for (const cell of cells) {
    if (covered.has(cell.c + ',' + cell.r)) continue;
    const mg = mergeAt.get(cell.c + ',' + cell.r);
    const bx = mg ? geom.box(mg.c1, mg.r1, mg.c2, mg.r2) : geom.box(cell.c, cell.r, cell.c, cell.r);
    const x = Math.round(bx.x), y = Math.round(bx.y + offY), w = Math.round(bx.w), h = Math.round(bx.h);
    if (w < 1 || h < 1) continue;
    const xf = styles.cellXfs[cell.s] || {};
    const fillC = xf.fillId != null && styles.fills[xf.fillId] ? styles.fills[xf.fillId].color : null;
    if (fillC) fillsArr.push({ id: uid(), type: 'rect', x, y, w, h, fill: fillC, noFill: false, stroke: '#000000', noStroke: true, sw: 1, dash: 'solid', text: '', fs: 14, tc: '#000000', bold: false, font: 'Calibri', locked: false, g: groupId });
    const bd = styles.borders[xf.borderId] || {};
    addBorder(x, y, x + w, y, bd.top);
    addBorder(x, y + h, x + w, y + h, bd.bottom);
    addBorder(x, y, x, y + h, bd.left);
    addBorder(x + w, y, x + w, y + h, bd.right);
    if (cell.v !== '' && cell.v != null) {
      const fnt = styles.fonts[xf.fontId] || {};
      const fs = fnt.sz || 15, bold = !!fnt.bold, italic = !!fnt.italic, font = fnt.name || 'Calibri';
      const ha = xf.halign;
      const align = (ha === 'center' || ha === 'centerContinuous') ? 'c'
        : (ha === 'right' || ha === 'end') ? 'r'
        : (ha === 'left' || ha === 'general' || !ha) ? (cell.bool ? 'c' : cell.num && !ha ? 'r' : 'l') : 'l';
      const va = xf.valign === 'center' ? 'm' : xf.valign === 'top' ? 't' : 'b';   // Excel domyślnie dół
      let txt = String(cell.v);
      if (xf.wrap) txt = wrapCellText(txt, w - 4, fs, bold, italic, font);
      textArr.push({ id: uid(), type: 'text', x, y, boxW: w, boxH: h, align, valign: va, pad: 2, text: txt, fs, tc: fnt.color || '#000000', bold, italic, font, locked: false, g: groupId });
    }
  }
  return [...fillsArr, ...borderMap.values(), ...textArr];
}
function shapeBottom(s) {
  return s.type === 'line' ? Math.max(s.y1, s.y2) : (s.y || 0) + (s.h || 0);
}
function shiftShapeY(s, dy) {
  if (!dy) return;
  if (s.type === 'line') { s.y1 += dy; s.y2 += dy; } else s.y += dy;
}
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
    /* ---- ekosystem Excela: wspólne zasoby ---- */
    const ssFile = allFiles.find(f => /^xl\/sharedStrings\.xml$/i.test(f.name));
    const sharedStr = parseSharedStrings(ssFile ? td.decode(ssFile.data) : '');
    const stFile = allFiles.find(f => /^xl\/styles\.xml$/i.test(f.name));
    const styles = parseStyles(stFile ? td.decode(stFile.data) : '');

    /* arkusze w kolejności numerycznej — dla każdego: wymiary, układ współrzędnych,
       model komórek + spód treści; jednocześnie mapuj arkusz->rysunek */
    const sheetFiles = allFiles.filter(f => /^xl\/worksheets\/sheet\d+\.xml$/i.test(f.name))
      .sort((a, b) => (+a.name.match(/(\d+)\.xml$/i)[1]) - (+b.name.match(/(\d+)\.xml$/i)[1]));
    const drawingDims = {};    // drawingN.xml -> dims arkusza-właściciela
    const drawingSheet = {};   // drawingN.xml -> nazwa pliku arkusza
    const sheetInfo = [];      // {name, dims, geom, model, gridBottom}
    for (const sf of sheetFiles) {
      const sxml = td.decode(sf.data);
      const dims = parseSheetDims(sxml);
      const geom = gridGeom(dims);
      const model = parseSheetCells(sxml, sharedStr, styles);
      let maxC = 0, maxR = 0;
      for (const c of model.cells) { if (c.c > maxC) maxC = c.c; if (c.r > maxR) maxR = c.r; }
      for (const m of model.merges) { if (m.c2 > maxC) maxC = m.c2; if (m.r2 > maxR) maxR = m.r2; }
      const bb = model.cells.length ? geom.box(0, 0, maxC, maxR) : { x: 0, y: 0, w: 0, h: 0 };
      sheetInfo.push({ name: sf.name, dims, geom, model, gridBottom: bb.y + bb.h });
      const relPath = sf.name.replace(/^xl\/worksheets\//i, 'xl/worksheets/_rels/') + '.rels';
      const relFile = allFiles.find(f => f.name === relPath);
      if (!relFile) continue;
      for (const rm of td.decode(relFile.data).matchAll(/<Relationship\b[^>]*\/?>/g)) {
        const tag = rm[0];
        const typeM = tag.match(/\bType="([^"]+)"/), targetM = tag.match(/\bTarget="([^"]+)"/);
        if (!typeM || !targetM || !/\/drawing$/i.test(typeM[1])) continue;
        const drawingPath = resolveRelTarget(sf.name, targetM[1]);
        if (drawingPath) { drawingDims[drawingPath] = dims; drawingSheet[drawingPath] = sf.name; }
      }
    }
    /* awaryjnie (brak .rels albo relacji arkusz->rysunek) — wymiary pierwszego arkusza */
    const fallbackDims = sheetInfo.length ? sheetInfo[0].dims : parseSheetDims('');

    /* rysunki (obrazy/kształty wektorowe) — parsowane per plik, z zapamiętaniem arkusza */
    const drawingFiles = allFiles.filter(f => /^xl\/drawings\/drawing\d+\.xml$/i.test(f.name));
    const drawingResults = [];
    let unsupportedFallbacks = 0;
    for (const df of drawingFiles) {
      const relPath = df.name.replace(/^xl\/drawings\//i, 'xl/drawings/_rels/') + '.rels';
      const relFile = allFiles.find(f => f.name === relPath);
      const relMap = relFile ? parseDrawingRels(td.decode(relFile.data), df.name) : {};
      const dims = drawingDims[df.name] || fallbackDims;
      const parsed = parseDrawingShapes(td.decode(df.data), dims, relMap, mediaMap);
      drawingResults.push({ sheet: drawingSheet[df.name] || null, shapes: parsed.shapes, pictures: parsed.pictures });
      unsupportedFallbacks += parsed.unsupportedFallbacks || 0;
    }

    /* przesunięcia pionowe arkuszy — układamy je jeden pod drugim (siatka + rysunki
       tego samego arkusza dostają TEN SAM offset, więc zostają zsynchronizowane) */
    const drawBottom = {};
    for (const dr of drawingResults) {
      if (!dr.sheet) continue;
      let b = 0;
      for (const s of dr.shapes) b = Math.max(b, shapeBottom(s));
      for (const p of dr.pictures) b = Math.max(b, (p.y || 0) + (p.h || 0));
      drawBottom[dr.sheet] = Math.max(drawBottom[dr.sheet] || 0, b);
    }
    const GAP = 40, offOf = {};
    let cursor = 0;
    for (const si of sheetInfo) {
      offOf[si.name] = cursor;
      cursor += Math.max(si.gridBottom, drawBottom[si.name] || 0) + GAP;
    }

    /* wypiecz siatkę każdego arkusza (jedna grupa = jedna tabela) */
    const gridItems = [];
    for (const si of sheetInfo) {
      const gshapes = bakeSheetGrid(si.model, styles, si.geom, offOf[si.name] || 0, 'G' + uid());
      if (gshapes.length) gridItems.push({ kind: 'grid', name: si.name.replace(/^xl\/worksheets\//i, ''), shapes: gshapes, selected: true });
    }

    /* przesuń rysunki o offset ich arkusza i zbierz globalnie */
    const importedShapes = [], anchoredPictures = [];
    for (const dr of drawingResults) {
      const off = dr.sheet ? (offOf[dr.sheet] || 0) : 0;
      for (const s of dr.shapes) { shiftShapeY(s, off); importedShapes.push(s); }
      for (const p of dr.pictures) anchoredPictures.push({ ...p, y: (p.y || 0) + off, anchored: true });
    }

    const skippedEMF = allFiles.filter(f => /^xl\/media\//i.test(f.name) && /\.(emf|wmf)$/i.test(f.name)).length;
    if (!mediaFiles.length && !importedShapes.length && !anchoredPictures.length && !gridItems.length)
      return toast(t('xl.none') + (skippedEMF ? t('xl.emf', { n: skippedEMF }) : ''));
    closeXlsxModal();
    xlsxImportItems = [];
    /* siatki (tabele) na początku listy -> dodawane pierwsze -> spód z-order (pod rysunkami) */
    for (const g of gridItems) xlsxImportItems.push(g);
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
    const gridN = xlsxImportItems.filter(i => i.kind === 'grid').length;
    const shapeN = xlsxImportItems.length - imgN - gridN;
    $('#xlModal').querySelector('h3').textContent = gridN
      ? t('xl.countG', { i: imgN, s: shapeN, g: gridN })
      : t('xl.count', { i: imgN, s: shapeN });
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
