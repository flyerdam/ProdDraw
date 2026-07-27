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

/* =====================================================================
   IMPORT XLSX/XLSM przez ExcelJS — wielo-arkuszowy.
   ExcelJS rozpakowuje plik, parsuje XML i daje czysty model: komórki +
   style, szerokości kolumn / wysokości wierszy (także ukryte!) oraz obrazy
   z dokładnymi kotwicami (twoCellAnchor from/to). Kształty WEKTOROWE
   (strzałki, wielokąty, łączniki) ExcelJS pomija — te czytamy sami z
   drawingN.xml (patrz parseDrawingShapes w js/05-zip.js).
   Każdy wybrany arkusz otwiera się jako OSOBNY projekt (karta).
   ===================================================================== */
let xlsxSheets = [];   // bufor arkuszy z ostatniego wczytania (do okna wyboru)

/* geometria arkusza z modelu ExcelJS: szerokości kolumn / wysokości wierszy
   w px (ukryte -> 0), sumy prefiksowe (gridGeom) -> pudełka komórek oraz
   przeliczanie natywnych kotwic obrazów (col/off w EMU) na piksele. */
function ejsSheetGeom(ws) {
  const dim = ws.dimensions;                 // {top,left,bottom,right} 1-based lub null
  const imgs = ws.getImages();
  let maxC = dim ? dim.right : 1, maxR = dim ? dim.bottom : 1;
  for (const im of imgs) {
    if (im.range && im.range.br) {
      maxC = Math.max(maxC, Math.ceil(im.range.br.col) + 1);
      maxR = Math.max(maxR, Math.ceil(im.range.br.row) + 1);
    }
  }
  maxC = Math.min(Math.max(maxC, 1) + 2, 16384);
  maxR = Math.min(Math.max(maxR, 1) + 2, 1048576);
  const defColCh = (ws.properties && ws.properties.defaultColWidth) || 8.43;
  const defRowPt = (ws.properties && ws.properties.defaultRowHeight) || 15;
  const colWidths = new Array(maxC).fill(0), rowHeights = new Array(maxR).fill(0);
  for (let c = 0; c < maxC; c++) {
    const col = ws.getColumn(c + 1);
    if (col && col.hidden) continue;                       // ukryta -> 0 px
    const wCh = (col && col.width != null) ? col.width : defColCh;
    colWidths[c] = Math.max(4, Math.round(wCh * 7 + 5));
  }
  for (let r = 0; r < maxR; r++) {
    const row = ws.getRow(r + 1);
    if (row && row.hidden) continue;                       // ukryty -> 0 px
    const hPt = (row && row.height != null) ? row.height : defRowPt;
    rowHeights[r] = Math.max(4, Math.round(hPt * 96 / 72));
  }
  const geom = gridGeom({ colWidths, rowHeights });
  const EPX = 9525;
  const pxCol = (nCol, off) => geom.box(nCol, 0, nCol, 0).x + (off || 0) / EPX;
  const pxRow = (nRow, off) => geom.box(0, nRow, 0, nRow).y + (off || 0) / EPX;
  return { dims: { colWidths, rowHeights }, geom, pxCol, pxRow };
}

/* pomiar tekstu + zawijanie do szerokości komórki (Excel wrapText) */
let _measureCtx = null;
function measureTextW(txt, fs, bold, italic, font) {
  if (!_measureCtx) _measureCtx = document.createElement('canvas').getContext('2d');
  _measureCtx.font = `${italic ? 'italic ' : ''}${bold ? 'bold ' : ''}${fs}px "${font || 'Calibri'}",Arial,sans-serif`;
  return _measureCtx.measureText(txt).width;
}
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

/* model komórek arkusza ExcelJS -> natywne kształty ProdDraw
   (tła rect na spodzie, krawędzie line, tekst na wierzchu; krawędzie
   współdzielone deduplikowane po geometrii). */
function ejsBakeGrid(ws, geom, groupId) {
  const dim = ws.dimensions;
  if (!dim) return [];
  const fillsArr = [], textArr = [], borderMap = new Map();
  /* scalenia z modelu ExcelJS (ref "A3:C4") */
  const merges = [];
  for (const ref of (ws.model.merges || [])) {
    const [a, b] = ref.split(':');
    const A = a1ToRC(a), B = a1ToRC(b || a);
    if (A && B) merges.push({ c1: Math.min(A.c, B.c), r1: Math.min(A.r, B.r), c2: Math.max(A.c, B.c), r2: Math.max(A.r, B.r) });
  }
  const covered = new Set(), mergeAt = new Map();
  for (const m of merges) {
    for (let r = m.r1; r <= m.r2; r++) for (let c = m.c1; c <= m.c2; c++)
      if (!(r === m.r1 && c === m.c1)) covered.add(c + ',' + r);
    mergeAt.set(m.c1 + ',' + m.r1, m);
  }
  const addBorder = (x1, y1, x2, y2, style, colorArgb) => {
    if (!style || style === 'none') return;
    const bs = borderStylePx(style);
    const key = Math.round(x1) + ',' + Math.round(y1) + ',' + Math.round(x2) + ',' + Math.round(y2);
    borderMap.set(key, { id: uid(), type: 'line', x1, y1, x2, y2,
      stroke: argbToHex(colorArgb) || '#000000', sw: bs.sw, dash: bs.dash, as: false, ae: false, locked: false, g: groupId });
  };
  /* zakres roboczy z ograniczeniem, żeby ogromny arkusz nie wybuchł */
  const top = dim.top, left = dim.left, bottom = Math.min(dim.bottom, dim.top + 4000), right = Math.min(dim.right, dim.left + 256);
  for (let r1 = top; r1 <= bottom; r1++) {
    for (let c1 = left; c1 <= right; c1++) {
      const c0 = c1 - 1, r0 = r1 - 1;
      if (covered.has(c0 + ',' + r0)) continue;
      const cell = ws.getCell(r1, c1);
      const val = cell.text;
      const fill = cell.fill;
      const border = cell.border;
      const hasFill = fill && fill.type === 'pattern' && fill.pattern === 'solid';
      const hasBorder = border && (border.top || border.bottom || border.left || border.right);
      const hasText = val != null && String(val) !== '';
      if (!hasFill && !hasBorder && !hasText) continue;
      const mg = mergeAt.get(c0 + ',' + r0);
      const bx = mg ? geom.box(mg.c1, mg.r1, mg.c2, mg.r2) : geom.box(c0, r0, c0, r0);
      const x = Math.round(bx.x), y = Math.round(bx.y), w = Math.round(bx.w), h = Math.round(bx.h);
      if (w < 1 || h < 1) continue;
      if (hasFill) {
        const fillC = argbToHex(fill.fgColor && fill.fgColor.argb);
        if (fillC) fillsArr.push({ id: uid(), type: 'rect', x, y, w, h, fill: fillC, noFill: false,
          stroke: '#000000', noStroke: true, sw: 1, dash: 'solid', text: '', fs: 14, tc: '#000000', bold: false, font: 'Calibri', locked: false, g: groupId });
      }
      if (hasBorder) {
        if (border.top) addBorder(x, y, x + w, y, border.top.style, border.top.color && border.top.color.argb);
        if (border.bottom) addBorder(x, y + h, x + w, y + h, border.bottom.style, border.bottom.color && border.bottom.color.argb);
        if (border.left) addBorder(x, y, x, y + h, border.left.style, border.left.color && border.left.color.argb);
        if (border.right) addBorder(x + w, y, x + w, y + h, border.right.style, border.right.color && border.right.color.argb);
      }
      if (hasText) {
        const fnt = cell.font || {};
        const fs = Math.max(6, Math.round((fnt.size || 11) * 96 / 72));
        const bold = !!fnt.bold, italic = !!fnt.italic, font = fnt.name || 'Calibri';
        const tc = argbToHex(fnt.color && fnt.color.argb) || '#000000';
        const al = cell.alignment || {};
        const isNum = typeof cell.value === 'number';
        const isBool = typeof cell.value === 'boolean';
        const ha = al.horizontal;
        const align = (ha === 'center' || ha === 'centerContinuous') ? 'c'
          : (ha === 'right' || ha === 'end') ? 'r'
          : (ha === 'left' || ha === 'general' || !ha) ? (isBool ? 'c' : (isNum && !ha ? 'r' : 'l')) : 'l';
        const va = al.vertical === 'middle' ? 'm' : al.vertical === 'top' ? 't' : 'b';
        let txt = String(val);
        if (al.wrapText) txt = wrapCellText(txt, w - 4, fs, bold, italic, font);
        textArr.push({ id: uid(), type: 'text', x, y, boxW: w, boxH: h, align, valign: va, pad: 2,
          text: txt, fs, tc, bold, italic, font, locked: false, g: groupId });
      }
    }
  }
  return [...fillsArr, ...borderMap.values(), ...textArr];
}

/* obrazy arkusza z ExcelJS -> kształty image (href=dataURL, pozycja z kotwicy) */
async function ejsSheetImages(ws, wb, gi) {
  const out = [];
  for (const im of ws.getImages()) {
    let media = null;
    try { media = wb.getImage(im.imageId); } catch (e) {}
    if (!media || !media.buffer) continue;
    const ext = (media.extension || 'png').toLowerCase();
    const mime = (ext === 'jpg' || ext === 'jpeg') ? 'image/jpeg' : ext === 'gif' ? 'image/gif'
      : ext === 'bmp' ? 'image/bmp' : ext === 'webp' ? 'image/webp' : 'image/png';
    const tl = im.range.tl, br = im.range.br;
    const x1 = gi.pxCol(tl.nativeCol || 0, tl.nativeColOff), y1 = gi.pxRow(tl.nativeRow || 0, tl.nativeRowOff);
    let x2, y2;
    if (br && br.nativeCol != null) { x2 = gi.pxCol(br.nativeCol, br.nativeColOff); y2 = gi.pxRow(br.nativeRow, br.nativeRowOff); }
    else if (im.range.ext) { x2 = x1 + (im.range.ext.width || 100); y2 = y1 + (im.range.ext.height || 100); }
    else { x2 = x1 + 100; y2 = y1 + 100; }
    const w = Math.max(4, Math.round(x2 - x1)), h = Math.max(4, Math.round(y2 - y1));
    let href;
    try { href = await fileToDataURL(new Blob([media.buffer], { type: mime })); } catch (e) { continue; }
    out.push({ id: uid(), type: 'image', href, x: Math.round(x1), y: Math.round(y1), w, h, locked: false });
  }
  return out;
}

/* pole powierzchni kształtu (do sortowania z-order: duże na spód) */
function shapeArea(s) { return s.type === 'line' ? 0 : (s.w || 0) * (s.h || 0); }
function shiftShapeXY(s, dx, dy) {
  if (s.type === 'line') { s.x1 += dx; s.y1 += dy; s.x2 += dx; s.y2 += dy; }
  else { s.x += dx; s.y += dy; }
}

/* złóż wszystkie kształty arkusza w kolejności z-order:
   siatka (spód) -> wektory+obrazy wg powierzchni malejąco (duże tła niżej) */
function assembleSheetShapes(sheet) {
  const combined = [
    ...sheet.vectors.map(sh => ({ sh, area: shapeArea(sh) })),
    ...sheet.images.map(sh => ({ sh, area: shapeArea(sh) }))
  ].sort((a, b) => b.area - a.area).map(o => o.sh);
  return [...sheet.grid, ...combined];
}
/* dopasuj stronę projektu do zawartości arkusza: przesuń do początku (0,0)
   z marginesem i ustaw format custom = rozmiar zawartości */
function fitSheetToPage(shapes) {
  if (!shapes.length) return { shapes: [], page: { mode: 'a4l', w: PAGES.a4l.w, h: PAGES.a4l.h } };
  const b = unionBBox(shapes);
  const pad = 20;
  const dx = -(b.x - pad), dy = -(b.y - pad);
  for (const s of shapes) shiftShapeXY(s, dx, dy);
  return { shapes, page: { mode: 'custom', w: Math.max(10, Math.round(b.w + pad * 2)), h: Math.max(10, Math.round(b.h + pad * 2)) } };
}

function closeXlsxModal() {
  $('#xlModal').classList.remove('on');
  xlsxSheets = [];
}

/* okno wyboru arkuszy: zaznacz które otworzyć + wskaż główny (aktywny po imporcie) */
function renderSheetPicker() {
  const body = $('#xlBody'); body.innerHTML = '';
  const modal = $('#xlModal'); const h3 = modal.querySelector('h3'); if (h3) h3.textContent = t('xl.sheetTitle');
  const ctl = document.createElement('div');
  ctl.style.cssText = 'grid-column:1/-1;display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:6px;';
  const importBtn = document.createElement('button');
  importBtn.className = 'btn primary';
  importBtn.textContent = t('xl.openSel');
  importBtn.addEventListener('click', applySelectedSheets);
  ctl.appendChild(importBtn);
  body.appendChild(ctl);
  xlsxSheets.forEach((s, idx) => {
    const all = assembleSheetShapes(s);
    const empty = all.length === 0;
    const d = document.createElement('div');
    d.className = 'xlImg';
    const openChk = s.selected ? 'checked' : '';
    const primChk = s.primary ? 'checked' : '';
    const counts = `${s.grid.length ? '▦' : ''}${s.vectors.length ? ' ◇' + s.vectors.length : ''}${s.images.length ? ' ▣' + s.images.length : ''}`;
    d.innerHTML =
      `<div class="xlSel" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">` +
        `<label><input type="checkbox" data-xlopen="${idx}" ${openChk}> ${t('xl.open')}</label>` +
        `<label><input type="radio" name="xlPrimary" data-xlprim="${idx}" ${primChk}> ${t('xl.primary')}</label>` +
      `</div>` +
      `<div class="xlShapePrev">${empty ? '' : gridPreviewSVG(all)}</div>` +
      `<div>${escXml(s.name)}${empty ? ' <span class="hint">' + t('xl.empty') + '</span>' : ' <span class="hint">' + counts + '</span>'}</div>`;
    body.appendChild(d);
  });
  $$('#xlBody [data-xlopen]').forEach(cb => cb.addEventListener('change', e => {
    xlsxSheets[+e.target.dataset.xlopen].selected = e.target.checked;
  }));
  $$('#xlBody [data-xlprim]').forEach(rb => rb.addEventListener('change', e => {
    const i = +e.target.dataset.xlprim;
    xlsxSheets.forEach((s, k) => s.primary = (k === i));
    if (e.target.checked) { xlsxSheets[i].selected = true; renderSheetPicker(); }
  }));
}

/* otwórz zaznaczone arkusze — każdy jako OSOBNY projekt (karta) */
function applySelectedSheets() {
  const chosen = xlsxSheets.filter(s => s.selected);
  if (!chosen.length) return toast(t('xl.noSheets'));
  if (typeof PS_commitActive === 'function') PS_commitActive();
  let primarySlot = null;
  for (const s of chosen) {
    const assembled = cloneShapesWithFreshIds(assembleSheetShapes(s));   // świeże ID (osobny projekt)
    const fit = fitSheetToPage(assembled);
    const name = (s.name || 'Arkusz').trim() || 'Arkusz';
    const slot = PS_createProjectWithContent(name, fit.shapes, fit.page);
    if (s.primary && primarySlot === null) primarySlot = slot;
    if (primarySlot === null) primarySlot = slot;   // fallback: pierwszy
  }
  closeXlsxModal();
  if (primarySlot != null && typeof PS_switchTo === 'function') PS_switchTo(primarySlot);
  else if (typeof Tabs_render === 'function') Tabs_render();
  toast(t('xl.sheetDone', { n: chosen.length }));
}

async function importXlsx(file) {
  try {
    if (typeof ExcelJS === 'undefined') return toast(t('t.importErr') + 'ExcelJS');
    toast(t('t.reading'));
    const buf = await file.arrayBuffer();
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    /* kształty wektorowe (strzałki/wielokąty/łączniki) — ExcelJS ich nie czyta;
       bierzemy z drawingN.xml, mapując rysunek na arkusz po nazwie */
    let allZip = [], sheetMap = [];
    try { allZip = await readZipAll(buf); sheetMap = parseWorkbookSheetMap(allZip); } catch (e) {}
    const td = new TextDecoder();
    const drawingShapesFor = (drawingFile, dims) => {
      if (!drawingFile) return [];
      const df = allZip.find(f => f.name === drawingFile);
      if (!df) return [];
      const relPath = drawingFile.replace(/^xl\/drawings\//i, 'xl/drawings/_rels/') + '.rels';
      const relFile = allZip.find(f => f.name === relPath);
      const relMap = relFile ? parseDrawingRels(td.decode(relFile.data), drawingFile) : {};
      try {
        /* mediaMap pusty -> obrazów NIE dublujemy (te robi ExcelJS); zwracamy tylko wektory */
        return parseDrawingShapes(td.decode(df.data), dims, relMap, {}).shapes || [];
      } catch (e) { return []; }
    };

    const sheets = [];
    for (let i = 0; i < wb.worksheets.length; i++) {
      const ws = wb.worksheets[i];
      const gi = ejsSheetGeom(ws);
      const groupId = 'G' + uid();
      const grid = ejsBakeGrid(ws, gi.geom, groupId);
      const images = await ejsSheetImages(ws, wb, gi);
      const map = sheetMap.find(m => m.name === ws.name) || sheetMap[i] || {};
      const vectors = drawingShapesFor(map.drawingFile, gi.dims);
      sheets.push({ name: ws.name || ('Arkusz ' + (i + 1)), grid, images, vectors, selected: false, primary: false });
    }
    if (!sheets.length) return toast(t('xl.none'));
    /* domyślnie zaznacz niepuste; pierwszy niepusty = główny */
    let firstNonEmpty = -1;
    sheets.forEach((s, i) => {
      const has = s.grid.length + s.images.length + s.vectors.length > 0;
      s.selected = has;
      if (has && firstNonEmpty < 0) firstNonEmpty = i;
    });
    if (firstNonEmpty < 0) { sheets[0].selected = true; firstNonEmpty = 0; }
    sheets[firstNonEmpty].primary = true;
    xlsxSheets = sheets;
    renderSheetPicker();
    $('#xlModal').classList.add('on');
  } catch (err) { toast(t('t.importErr') + (err && err.message ? err.message : err)); }
}

/* =====================================================================
   EKSPORT do .xlsx (ExcelJS) — aktywny projekt jako jeden arkusz.
   Rysunek renderujemy do PNG i osadzamy jako obraz zakotwiczony w A1
   (grafika wektorowa nie daje się wiarygodnie odtworzyć jako komórki).
   ===================================================================== */
function sanitizeSheetName(name) {
  let n = String(name || 'Arkusz').replace(/[\[\]\*\?\/\\:]/g, ' ').trim();
  if (!n) n = 'Arkusz';
  return n.slice(0, 31);
}
async function exportXlsx() {
  try {
    if (typeof ExcelJS === 'undefined') return toast(t('t.importErr') + 'ExcelJS');
    const region = pageRegion();
    if (!state.shapes.length && !region) return toast(t('t.emptyCanvas'));
    toast(t('t.reading'));
    const pad = (settings.infiniteCanvasMargin != null) ? settings.infiniteCanvasMargin : 16;
    const b = buildSVG(state.shapes, currentVals(), pad, region);
    const blob = await svgToPngBlob(b.svg, b.w, b.h, 2, 'image/png');
    const arr = new Uint8Array(await blob.arrayBuffer());
    const wb = new ExcelJS.Workbook();
    wb.creator = 'ProdDraw';
    const ws = wb.addWorksheet(sanitizeSheetName($('#projName').value || state.name));
    const id = wb.addImage({ buffer: arr, extension: 'png' });
    ws.addImage(id, { tl: { col: 0, row: 0 }, ext: { width: b.w, height: b.h } });
    const out = await wb.xlsx.writeBuffer();
    const name = (stripExt(sanitizeFile($('#projName').value)) || 'ProdDraw') + '.xlsx';
    downloadBlob(new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), name);
    toast(t('t.xlsxExported') + name, 6000);
  } catch (err) { toast(t('t.saveErr')); }
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
