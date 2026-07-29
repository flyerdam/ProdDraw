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
let xlsxFileBase = ''; // nazwa pliku xlsx (bez rozszerzenia) — do nazwania projektów

/* kolory motywu Excela; ExcelJS podaje kolor jako {argb} ALBO {theme, tint}
   ALBO {indexed}. Bez rozwiązania motywu białe nagłówki na ciemnym tle
   wychodziły czarne. Tablica indeksów Excela bierze się z SCHEME_HEX
   (js/05-zip.js), które applyWorkbookTheme() podmienia REALNYM motywem
   tego skoroszytu na początku importXlsx() — różne szablony mają różne
   kolory akcentów/tła2, sztywna paleta domyślna dawała złe kolory. */
function xlApplyTint(hex, tint) {
  if (!tint) return hex;
  const ap = v => tint < 0 ? Math.round(v * (1 + tint)) : Math.round(v * (1 - tint) + 255 * tint);
  const h2 = n => Math.max(0, Math.min(255, n)).toString(16).padStart(2, '0');
  return '#' + h2(ap(parseInt(hex.slice(1, 3), 16))) + h2(ap(parseInt(hex.slice(3, 5), 16))) + h2(ap(parseInt(hex.slice(5, 7), 16)));
}
function xlColorHex(c) {
  if (!c) return null;
  if (c.argb) return argbToHex(c.argb);
  const XL_THEME = xlThemeArr();
  if (c.theme != null && XL_THEME[c.theme]) return xlApplyTint(XL_THEME[c.theme], c.tint || 0);
  return null;
}

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
  const addBorder = (x1, y1, x2, y2, side) => {
    if (!side || !side.style || side.style === 'none') return;
    const bs = borderStylePx(side.style);
    const key = Math.round(x1) + ',' + Math.round(y1) + ',' + Math.round(x2) + ',' + Math.round(y2);
    borderMap.set(key, { id: uid(), type: 'line', x1, y1, x2, y2,
      stroke: xlColorHex(side.color) || '#000000', sw: bs.sw, dash: bs.dash, as: false, ae: false, locked: false, g: groupId });
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
        const fillC = xlColorHex(fill.fgColor);
        if (fillC) fillsArr.push({ id: uid(), type: 'rect', x, y, w, h, fill: fillC, noFill: false,
          stroke: '#000000', noStroke: true, sw: 1, dash: 'solid', text: '', fs: 14, tc: '#000000', bold: false, font: 'Calibri', locked: false, g: groupId });
      }
      if (hasBorder) {
        if (border.top) addBorder(x, y, x + w, y, border.top);
        if (border.bottom) addBorder(x, y + h, x + w, y + h, border.bottom);
        if (border.left) addBorder(x, y, x, y + h, border.left);
        if (border.right) addBorder(x + w, y, x + w, y + h, border.right);
      }
      if (hasText) {
        const fnt = cell.font || {};
        const fs = Math.max(6, Math.round((fnt.size || 11) * 96 / 72));
        const bold = !!fnt.bold, italic = !!fnt.italic, font = fnt.name || 'Calibri';
        const tc = xlColorHex(fnt.color) || '#000000';
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

/* ---- EMF (Enhanced Metafile) -> PNG w przeglądarce ----
   Przeglądarki nie renderują EMF w <img>. Logo MAN, mini-ciężarówka itp. w
   plikach Excela to najczęściej EMF „opakowujące" bitmapę (rekordy
   EMR_STRETCHDIBITS z osadzonym DIB). Wyciągamy każdy DIB, składamy z niego
   plik BMP, rysujemy na kanwie wg pozycji rekordu i eksportujemy do PNG.
   Czysto wektorowe EMF (bez bitmap) zwracają null -> pomijane. */
function dibToBmp(bmi, bits) {
  const out = new Uint8Array(14 + bmi.length + bits.length);
  const dv = new DataView(out.buffer);
  out[0] = 0x42; out[1] = 0x4D;                 // 'BM'
  dv.setUint32(2, out.length, true);            // bfSize
  dv.setUint32(10, 14 + bmi.length, true);      // bfOffBits (po BITMAPINFO)
  out.set(bmi, 14); out.set(bits, 14 + bmi.length);
  return out;
}
/* Kompaktowy renderer EMF (podzbiór GDI wystarczający dla ikon Office):
   pędzle/pióra (CREATEBRUSHINDIRECT/EXTCREATEPEN/SELECTOBJECT), wielokąty
   (POLYGON16/POLYLINE16), prostokąty/elipsy oraz bitmapy (STRETCHDIBITS).
   Każdy rekord rysujący ma własne rclBounds (device px) — używamy go do
   transformacji punktów (bez parsowania window/viewport). Rysowanie w
   kolejności rekordów zachowuje z-order (tło -> bitmapa -> strzałka). */
function emfBgr(c) { return '#' + [(c & 0xFF), (c >> 8) & 0xFF, (c >> 16) & 0xFF].map(x => x.toString(16).padStart(2, '0')).join(''); }
async function emfToPngDataURL(bytes) {
  try {
    const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    if (u8.length < 88) return null;
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    if (dv.getUint32(0, true) !== 1) return null;               // EMR_HEADER
    const bl = dv.getInt32(8, true), bt = dv.getInt32(12, true), brr = dv.getInt32(16, true), bb = dv.getInt32(20, true);
    let W = brr - bl + 1, H = bb - bt + 1;
    if (!(W > 1 && H > 1 && W < 20000 && H < 20000)) { W = 400; H = 300; }
    const SS = W < 700 ? 2 : 1;                                  // nadpróbkowanie małych ikon
    const cnv = document.createElement('canvas'); cnv.width = W * SS; cnv.height = H * SS;
    const ctx = cnv.getContext('2d'); ctx.scale(SS, SS); ctx.lineJoin = 'round';
    const rcl = off => ({ l: dv.getInt32(off + 8, true), t: dv.getInt32(off + 12, true), r: dv.getInt32(off + 16, true), b: dv.getInt32(off + 20, true) });
    const objs = {}; let curBrush = null, curPen = { color: '#000000', w: 1 }, hadDraw = false;
    /* punkty POLYGON16/POLYLINE16 -> canvas przez rclBounds rekordu. Cache po
       zestawie punktów: wypełnienie i obrys tej samej figury mają IDENTYCZNE
       punkty, ale różne rclBounds (obrys rozdmuchany o grubość pióra) — bez
       cache obrys rozjeżdżał się z wypełnieniem („ramka" przy strzałce). */
    const polyCache = {};
    const mapPoly = (off, n) => {
      const pts = [];
      for (let k = 0; k < n; k++) pts.push([dv.getInt16(off + 28 + k * 4, true), dv.getInt16(off + 30 + k * 4, true)]);
      const key = pts.join(';');
      if (polyCache[key]) return polyCache[key];
      let mnx = Infinity, mny = Infinity, mxx = -Infinity, mxy = -Infinity;
      for (const p of pts) { if (p[0] < mnx) mnx = p[0]; if (p[0] > mxx) mxx = p[0]; if (p[1] < mny) mny = p[1]; if (p[1] > mxy) mxy = p[1]; }
      const R = rcl(off), sx = (mxx - mnx) || 1, sy = (mxy - mny) || 1;
      const rw = (R.r - R.l), rh = (R.b - R.t);
      const out = pts.map(p => [(R.l - bl) + (p[0] - mnx) / sx * rw, (R.t - bt) + (p[1] - mny) / sy * rh]);
      polyCache[key] = out;
      return out;
    };
    const drawPoly = (canvasPts, closed) => {
      if (!canvasPts.length) return;
      ctx.beginPath(); ctx.moveTo(canvasPts[0][0], canvasPts[0][1]);
      for (let k = 1; k < canvasPts.length; k++) ctx.lineTo(canvasPts[k][0], canvasPts[k][1]);
      if (closed) ctx.closePath();
      if (closed && curBrush && curBrush.color) { ctx.fillStyle = curBrush.color; ctx.fill(); hadDraw = true; }
      if (curPen && curPen.color) { ctx.strokeStyle = curPen.color; ctx.lineWidth = curPen.w || 1; ctx.stroke(); hadDraw = true; }
    };
    const loadImgData = async (bmp) => {
      const url = URL.createObjectURL(new Blob([bmp], { type: 'image/bmp' }));
      try {
        const img = await new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = url; });
        const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
        const cx = c.getContext('2d'); cx.drawImage(img, 0, 0);
        return cx.getImageData(0, 0, c.width, c.height);
      } catch (e) { return null; } finally { URL.revokeObjectURL(url); }
    };
    /* narysuj DIB w prostokącie docelowym; maska 1bpp -> kanał alfa (biel=przezroczyste),
       a pojedynczy DIB -> kluczowanie bieli, żeby ikona nie miała białego pudełka na tle */
    const drawDibs = async (colorBmp, maskBmp, x, y, w, h, flipH, flipV) => {
      const colorID = await loadImgData(colorBmp); if (!colorID) return;
      const d = colorID.data;
      const maskID = maskBmp ? await loadImgData(maskBmp) : null;
      if (maskID && maskID.width === colorID.width && maskID.height === colorID.height) {
        const m = maskID.data;
        for (let i = 0; i < d.length; i += 4) d[i + 3] = m[i] > 128 ? 255 : 0;
      } else {
        for (let i = 0; i < d.length; i += 4) if (d[i] > 244 && d[i + 1] > 244 && d[i + 2] > 244) d[i + 3] = 0;
      }
      const tmp = document.createElement('canvas'); tmp.width = colorID.width; tmp.height = colorID.height;
      tmp.getContext('2d').putImageData(colorID, 0, 0);
      const dw = w || colorID.width, dh = h || colorID.height;
      /* honoruj znak cxDest/cyDest ze STRETCHDIBITS (ujemny = odbicie bitmapy) —
         bez tego ciężarówka była lustrzana względem strzałki */
      ctx.save();
      ctx.translate(flipH ? x + dw : x, flipV ? y + dh : y);
      ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1);
      ctx.drawImage(tmp, 0, 0, dw, dh);
      ctx.restore();
      hadDraw = true;
    };
    const dibAt = off => {
      const gu = k => dv.getUint32(off + k, true);
      const offBmi = gu(48), cbBmi = gu(52), offBits = gu(56), cbBits = gu(60);
      if (!(cbBmi && cbBits && off + offBmi + cbBmi <= u8.length && off + offBits + cbBits <= u8.length)) return null;
      return dibToBmp(u8.subarray(off + offBmi, off + offBmi + cbBmi), u8.subarray(off + offBits, off + offBits + cbBits));
    };
    let off = 0;
    while (off + 8 <= u8.length) {
      const t = dv.getUint32(off, true); let sz = dv.getUint32(off + 4, true);
      if (sz < 8 || off + sz > u8.length) break;
      if (t === 39) {                                           // CREATEBRUSHINDIRECT
        const ih = dv.getUint32(off + 8, true), style = dv.getUint32(off + 12, true), col = dv.getUint32(off + 16, true);
        objs[ih] = { kind: 'brush', color: style === 0 ? emfBgr(col) : null };
      } else if (t === 58) {                                    // EXTCREATEPEN
        const ih = dv.getUint32(off + 8, true), col = dv.getUint32(off + 40, true);
        objs[ih] = { kind: 'pen', color: emfBgr(col), w: 1 };
      } else if (t === 38) {                                    // CREATEPEN
        const ih = dv.getUint32(off + 8, true), col = dv.getUint32(off + 20, true);
        objs[ih] = { kind: 'pen', color: emfBgr(col), w: 1 };
      } else if (t === 37) {                                    // SELECTOBJECT
        const ih = dv.getUint32(off + 8, true);
        if (ih & 0x80000000) {                                  // obiekt systemowy
          const s = ih & 0x7fffffff;
          if (s === 5) curBrush = null;                         // NULL_BRUSH
          else if (s === 0 || s === 1) curBrush = { color: null }; // WHITE/LTGRAY -> pomiń tło
          else if (s === 8) curPen = null;                      // NULL_PEN
          else if (s === 7) curPen = { color: '#000000', w: 1 };// BLACK_PEN
        } else if (objs[ih]) {
          if (objs[ih].kind === 'brush') curBrush = objs[ih];
          else curPen = objs[ih];
        }
      } else if (t === 40) {                                    // DELETEOBJECT
        delete objs[dv.getUint32(off + 8, true)];
      } else if (t === 86) {                                    // POLYGON16
        drawPoly(mapPoly(off, dv.getInt32(off + 24, true)), true);
      } else if (t === 87) {                                    // POLYLINE16
        const savedBrush = curBrush; curBrush = null; drawPoly(mapPoly(off, dv.getInt32(off + 24, true)), false); curBrush = savedBrush;
      } else if (t === 43 || t === 42) {                        // RECTANGLE / ELLIPSE
        const R = rcl(off), x = R.l - bl, y = R.t - bt, w = R.r - R.l, h = R.b - R.t;
        ctx.beginPath();
        if (t === 42) ctx.ellipse(x + w / 2, y + h / 2, Math.abs(w / 2), Math.abs(h / 2), 0, 0, 2 * Math.PI);
        else ctx.rect(x, y, w, h);
        if (curBrush && curBrush.color) { ctx.fillStyle = curBrush.color; ctx.fill(); hadDraw = true; }
        if (curPen && curPen.color) { ctx.strokeStyle = curPen.color; ctx.lineWidth = curPen.w || 1; ctx.stroke(); hadDraw = true; }
      } else if (t === 81) {                                    // STRETCHDIBITS
        const R = rcl(off);
        const cxDest = dv.getInt32(off + 72, true), cyDest = dv.getInt32(off + 76, true);
        let color = dibAt(off), mask = null;
        /* para w tym samym prostokącie = (maska, kolor) dla przezroczystości ikony */
        const nOff = off + sz;
        if (nOff + 8 <= u8.length && dv.getUint32(nOff, true) === 81) {
          const nR = rcl(nOff);
          if (nR.l === R.l && nR.t === R.t && nR.r === R.r && nR.b === R.b) {
            const next = dibAt(nOff);
            if (next) { mask = color; color = next; sz += dv.getUint32(nOff + 4, true); }
          }
        }
        if (mask && color && mask.length > color.length) { const tmp = mask; mask = color; color = tmp; }
        if (color) await drawDibs(color, mask, Math.min(R.l, R.r) - bl, Math.min(R.t, R.b) - bt, Math.abs(R.r - R.l), Math.abs(R.b - R.t), cxDest < 0, cyDest < 0);
      }
      if (t === 14) break;                                      // EOF
      off += sz;
    }
    if (!hadDraw) return null;                                  // nic nie narysowano (czysty wektor bez obsługi) -> pomiń
    return cnv.toDataURL('image/png');
  } catch (e) { return null; }
}

/* obrazy arkusza z ExcelJS -> kształty image (href=dataURL, pozycja z kotwicy).
   flips = [{col,row,flipH,flipV,rot}] z rysunku (ExcelJS ich nie zwraca). */
async function ejsSheetImages(ws, wb, gi, flips = []) {
  const out = [];
  for (const im of ws.getImages()) {
    let media = null;
    try { media = wb.getImage(im.imageId); } catch (e) {}
    if (!media || !media.buffer) continue;
    const ext = (media.extension || 'png').toLowerCase();
    const tl = im.range.tl, br = im.range.br;
    const x1 = gi.pxCol(tl.nativeCol || 0, tl.nativeColOff), y1 = gi.pxRow(tl.nativeRow || 0, tl.nativeRowOff);
    let x2, y2;
    if (br && br.nativeCol != null) { x2 = gi.pxCol(br.nativeCol, br.nativeColOff); y2 = gi.pxRow(br.nativeRow, br.nativeRowOff); }
    else if (im.range.ext) { x2 = x1 + (im.range.ext.width || 100); y2 = y1 + (im.range.ext.height || 100); }
    else { x2 = x1 + 100; y2 = y1 + 100; }
    const w = Math.max(4, Math.round(x2 - x1)), h = Math.max(4, Math.round(y2 - y1));
    const flip = flips.find(fl => fl.col === (tl.nativeCol || 0) && fl.row === (tl.nativeRow || 0));
    let href;
    if (ext === 'emf') {
      href = await emfToPngDataURL(media.buffer);   // bitmapa opakowana w EMF -> PNG
      if (!href) continue;                          // czysto wektorowe EMF/WMF -> pomiń
    } else if (ext === 'wmf') {
      continue;                                     // starszy metafile — brak konwersji
    } else {
      const mime = (ext === 'jpg' || ext === 'jpeg') ? 'image/jpeg' : ext === 'gif' ? 'image/gif'
        : ext === 'bmp' ? 'image/bmp' : ext === 'webp' ? 'image/webp' : 'image/png';
      try { href = await fileToDataURL(new Blob([media.buffer], { type: mime })); } catch (e) { continue; }
    }
    const sh = { id: uid(), type: 'image', href, x: Math.round(x1), y: Math.round(y1), w, h, locked: false };
    if (flip && flip.flipH) sh.flipH = true;
    if (flip && flip.flipV) sh.flipV = true;
    if (flip && flip.rot) sh.rot = Math.round(flip.rot * 10) / 10;
    out.push(sh);
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
/* zawijanie tekstu kształtów (Excel textbox / autokształt) do szerokości
   pudełka — ExcelJS/rysunek dają tekst jednoliniowy, a w Excelu się zawija */
function wrapShapeText(shapes) {
  for (const s of shapes) {
    if (!(s.text && s.w > 6 && ['rect', 'roundRect', 'ellipse', 'poly'].includes(s.type))) continue;
    const fs = s.fs || 14, maxW = s.w - 6;
    /* zawijaj TYLKO gdy tekst wyraźnie wystaje (tolerancja ~8%) — inaczej krótkie
       etykiety jak „PRAWA WEWNĄTRZ" łamałyby się przez różnice metryk fontów */
    let longest = 0;
    for (const para of String(s.text).split('\n'))
      longest = Math.max(longest, measureTextW(para, fs, !!s.bold, !!s.italic, s.font || 'Calibri'));
    if (longest > maxW * 1.08)
      s.text = wrapCellText(s.text, maxW, fs, !!s.bold, !!s.italic, s.font || 'Calibri');
  }
  return shapes;
}
/* nazwa projektu dla arkusza: 1 wybrany arkusz -> nazwa pliku;
   wiele arkuszy -> "nazwaPliku-nazwaArkusza" */
function projectNameForSheet(sheetName, single) {
  const base = xlsxFileBase || 'Import';
  const sh = (sheetName || 'Arkusz').trim() || 'Arkusz';
  return single ? base : (base + '-' + sh);
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

/* otwórz zaznaczone arkusze — każdy jako OSOBNY projekt (karta).
   Kanwa nieskończona (mode 'off') + współrzędne z Excela zachowane, żeby
   po imporcie od razu zadziałał kreator KADRU (autocrop) usuwający zbędne. */
function applySelectedSheets() {
  const chosen = xlsxSheets.filter(s => s.selected);
  if (!chosen.length) return toast(t('xl.noSheets'));
  if (typeof PS_commitActive === 'function') PS_commitActive();
  const single = chosen.length === 1;
  const primary = chosen.find(s => s.primary) || chosen[0];
  const created = [];   // {slot, name, shapes, isPrimary}
  for (const s of chosen) {
    const shapes = cloneShapesWithFreshIds(assembleSheetShapes(s));   // świeże ID = osobny projekt
    const name = projectNameForSheet(s.name, single);
    const slot = PS_createProjectWithContent(name, shapes, { mode: 'off' });
    created.push({ slot, name, shapes, isPrimary: s === primary });
  }
  closeXlsxModal();
  const prim = created.find(c => c.isPrimary) || created[0];
  /* aktywuj główny arkusz ładując treść WPROST z pamięci — NIE przez odczyt z
     localStorage (przy dużych obrazach zapis może przekroczyć limit i cichy
     błąd zapisu dawałby pusty fallback: „drugi import robi pustą kanwę"). */
  PS_active = prim.slot;
  PS_setOpen(PS_openSlots(), prim.slot);
  currentProjectHandle = null;
  state = {
    name: prim.name,
    shapes: prim.shapes.map(normalizeShape),
    vars: { cols: [], rows: [] },
    page: { mode: 'off' },
    layers: null
  };
  ensureLayers();
  if ($('#projName')) $('#projName').value = state.name;
  sel.clear(); previewRow = -1; clearHistory();
  syncPageUI(); fitPage(); render(); renderProps(); renderVars();
  autosave();
  if (typeof PS_heartbeat === 'function') PS_heartbeat();
  if (typeof Tabs_render === 'function') Tabs_render();
  toast(t('xl.sheetDone', { n: chosen.length }));
  /* kreator kadru roboczego nad świeżym importem (o ile nie wyłączony) */
  if (settings.xlsxAutoCrop !== false && state.shapes.length) xlsxCropStart(state.shapes);
}

async function importXlsx(file) {
  try {
    if (typeof ExcelJS === 'undefined') return toast(t('t.importErr') + 'ExcelJS');
    toast(t('t.reading'));
    xlsxFileBase = stripExt(sanitizeFile(file.name || 'Import')) || 'Import';
    const buf = await file.arrayBuffer();
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    /* kształty wektorowe (strzałki/wielokąty/łączniki) — ExcelJS ich nie czyta;
       bierzemy z drawingN.xml, mapując rysunek na arkusz po nazwie */
    let allZip = [], sheetMap = [];
    try { allZip = await readZipAll(buf); sheetMap = parseWorkbookSheetMap(allZip); } catch (e) {}
    const td = new TextDecoder();
    /* motyw TEGO skoroszytu (kolory akcentów/tła/tekstu) -> podmień domyślną
       paletę, inaczej kolory z schemeClr/theme index wychodzą złe (patrz
       SCHEME_HEX w js/05-zip.js) */
    try {
      const themeFile = allZip.find(f => /^xl\/theme\/theme\d*\.xml$/i.test(f.name));
      applyWorkbookTheme(themeFile ? parseWorkbookTheme(td.decode(themeFile.data)) : null);
    } catch (e) { applyWorkbookTheme(null); }
    /* pobierz XML rysunku raz -> kształty wektorowe (ExcelJS ich nie czyta) + odbicia obrazów */
    const drawingDataFor = (drawingFile, dims) => {
      const empty = { vectors: [], flips: [] };
      if (!drawingFile) return empty;
      const df = allZip.find(f => f.name === drawingFile);
      if (!df) return empty;
      const xml = td.decode(df.data);
      const relPath = drawingFile.replace(/^xl\/drawings\//i, 'xl/drawings/_rels/') + '.rels';
      const relFile = allZip.find(f => f.name === relPath);
      const relMap = relFile ? parseDrawingRels(td.decode(relFile.data), drawingFile) : {};
      let vectors = [], flips = [];
      try { vectors = parseDrawingShapes(xml, dims, relMap, {}).shapes || []; } catch (e) {}
      try { flips = parseDrawingPicFlips(xml); } catch (e) {}
      return { vectors, flips };
    };

    const sheets = [];
    for (let i = 0; i < wb.worksheets.length; i++) {
      const ws = wb.worksheets[i];
      const gi = ejsSheetGeom(ws);
      const groupId = 'G' + uid();
      const grid = ejsBakeGrid(ws, gi.geom, groupId);
      const map = sheetMap.find(m => m.name === ws.name) || sheetMap[i] || {};
      const dr = drawingDataFor(map.drawingFile, gi.dims);
      const images = await ejsSheetImages(ws, wb, gi, dr.flips);
      const vectors = wrapShapeText(dr.vectors);
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
   EKSPORT do .xlsx (ExcelJS + własny drawing1.xml) — aktywny projekt jako
   jeden arkusz z PRAWDZIWYMI, edytowalnymi obiektami (prostokąty/elipsy/
   linie/tekst jako <xdr:sp>/<xdr:cxnSp>, obrazy jako <xdr:pic>), nie jednym
   płaskim obrazkiem PNG wklejonym w A1. ExcelJS umie zapisać tylko obrazy —
   kształty wektorowe dopisujemy sami, dokładnie odwrotnością tego, co
   czytamy przy imporcie (patrz parseShapeNode/parseConnectorNode w
   js/05-zip.js): budujemy bazowy skoroszyt przez ExcelJS, rozpakowujemy go
   naszym readZipAll, doklejamy xl/drawings/drawing1.xml (+ rels + media +
   wpis w [Content_Types].xml + <drawing r:id> w arkuszu) i pakujemy
   z powrotem przez makeZip. Grupy (shape.g) eksportują się jako osobne,
   niezgrupowane kształty — Excel nie zobaczy ich jako jednej grupy, ale
   każdy z osobna jest w pełni edytowalny. ===================================================================== */
function sanitizeSheetName(name) {
  let n = String(name || 'Arkusz').replace(/[\[\]\*\?\/\\:]/g, ' ').trim();
  if (!n) n = 'Arkusz';
  return n.slice(0, 31);
}
const XLSX_OUT_EPX = 9525;   // px -> EMU (96 dpi)
const XLSX_OUT_PRESET = { triangle: 'triangle', rtTriangle: 'rtTriangle', diamond: 'diamond', pentagon: 'pentagon',
  hexagon: 'hexagon', heptagon: 'heptagon', octagon: 'octagon', star4: 'star4', star5: 'star5', star6: 'star6',
  cross: 'plus', rightArrow: 'rightArrow', leftArrow: 'leftArrow', parallelogram: 'parallelogram', trapezoid: 'trapezoid', chevron: 'chevron' };
const XLSX_OUT_DASH = { solid: 'solid', dash: 'dash', dot: 'dot', dashdot: 'dashDot', longdash: 'lgDash' };
function xlsxOutEmu(px) { return Math.max(0, Math.round(px * XLSX_OUT_EPX)); }
function xlsxOutHex(hex) { return (hex || '#000000').replace('#', '').toUpperCase(); }
function xlsxOutFillLn(s) {
  const hasFill = !s.noFill && s.fill;
  const fill = hasFill ? `<a:solidFill><a:srgbClr val="${xlsxOutHex(s.fill)}"/></a:solidFill>` : '<a:noFill/>';
  const hasStroke = !s.noStroke && s.stroke;
  const ln = hasStroke
    ? `<a:ln w="${Math.max(1, Math.round((s.sw || 1) * 12700))}"><a:solidFill><a:srgbClr val="${xlsxOutHex(s.stroke)}"/></a:solidFill><a:prstDash val="${XLSX_OUT_DASH[s.dash] || 'solid'}"/></a:ln>`
    : '<a:ln><a:noFill/></a:ln>';
  return fill + ln;
}
function xlsxOutTextBody(s) {
  const raw = subst(s.text || '', currentVals());
  const lines = raw ? raw.split('\n') : [''];
  const paras = lines.map(line => {
    if (!line) return '<a:p><a:endParaRPr lang="en-US"/></a:p>';
    const sz = Math.max(100, Math.round((s.fs || 14) * 100 * 72 / 96));
    const rPr = `sz="${sz}"${s.bold ? ' b="1"' : ''}${s.italic ? ' i="1"' : ''}`;
    return `<a:p><a:pPr algn="ctr"/><a:r><a:rPr ${rPr}><a:solidFill><a:srgbClr val="${xlsxOutHex(s.tc)}"/></a:solidFill>` +
      `<a:latin typeface="${escXml(s.font || 'Calibri')}"/></a:rPr><a:t>${escXml(line)}</a:t></a:r></a:p>`;
  }).join('');
  return `<xdr:txBody><a:bodyPr wrap="square" anchor="ctr" lIns="0" tIns="0" rIns="0" bIns="0"/><a:lstStyle/>${paras}</xdr:txBody>`;
}
let _xlsxOutId = 1;
/* siatka domyślna (bez jawnie ustawionych szerokości/wysokości) używana przez
   ExcelJS/nasz import przy braku formatowania kolumn/wierszy — patrz
   ejsSheetGeom(): defColCh=8.43 -> round(8.43*7+5)=64px, defRowPt=15pt ->
   round(15*96/72)=20px. Kotwiczymy piksele do TEJ SAMEJ siatki, żeby
   ponowny import (przez naszą applySelectedSheets) odtworzył dokładną
   pozycję/rozmiar. */
const XLSX_OUT_COL_PX = 64, XLSX_OUT_ROW_PX = 20;
function xlsxOutCellRef(px, cellPx) {
  const idx = Math.max(0, Math.floor(px / cellPx));
  const off = Math.max(0, Math.round((px - idx * cellPx) * XLSX_OUT_EPX));
  return { idx, off };
}
/* owija zawartość kształtu w <xdr:twoCellAnchor editAs="absolute">. Świadomie NIE
   używamy <xdr:absoluteAnchor> — ExcelJS (i realny Excel/LibreOffice/Sheets) czyta
   obrazy z drawingu tylko przez oneCell/twoCellAnchor; z absoluteAnchor obrazy
   eksportu znikały przy ponownym imporcie (ws.getImages() ich nie widziało). */
function xlsxOutAnchorTag(x, y, w, h, innerXml) {
  const c1 = xlsxOutCellRef(x, XLSX_OUT_COL_PX), r1 = xlsxOutCellRef(y, XLSX_OUT_ROW_PX);
  const c2 = xlsxOutCellRef(x + Math.max(w, 1), XLSX_OUT_COL_PX), r2 = xlsxOutCellRef(y + Math.max(h, 1), XLSX_OUT_ROW_PX);
  return `<xdr:twoCellAnchor editAs="absolute">` +
    `<xdr:from><xdr:col>${c1.idx}</xdr:col><xdr:colOff>${c1.off}</xdr:colOff><xdr:row>${r1.idx}</xdr:row><xdr:rowOff>${r1.off}</xdr:rowOff></xdr:from>` +
    `<xdr:to><xdr:col>${c2.idx}</xdr:col><xdr:colOff>${c2.off}</xdr:colOff><xdr:row>${r2.idx}</xdr:row><xdr:rowOff>${r2.off}</xdr:rowOff></xdr:to>` +
    innerXml + `<xdr:clientData/></xdr:twoCellAnchor>`;
}
/* kształt ProdDraw -> XML <xdr:twoCellAnchor>...</xdr:twoCellAnchor>. mediaRel = rId obrazu (tylko dla type image) */
function xlsxOutShapeXml(s, mediaRel) {
  const id = ++_xlsxOutId;
  if (s.type === 'image') {
    const c = s.crop;
    const srcRect = c ? `<a:srcRect l="${Math.round((c.l || 0) * 100000)}" t="${Math.round((c.t || 0) * 100000)}" r="${Math.round((c.r || 0) * 100000)}" b="${Math.round((c.b || 0) * 100000)}"/>` : '';
    const rot = s.rot ? ` rot="${Math.round((((s.rot % 360) + 360) % 360) * 60000)}"` : '';
    const flip = `${s.flipH ? ' flipH="1"' : ''}${s.flipV ? ' flipV="1"' : ''}`;
    const border = (!s.noStroke && s.stroke) ? `<a:ln w="${Math.max(1, Math.round((s.sw || 1) * 12700))}"><a:solidFill><a:srgbClr val="${xlsxOutHex(s.stroke)}"/></a:solidFill></a:ln>` : '';
    if (!mediaRel) return '';   // brak danych obrazu (nie powinno się zdarzyć, ale nie eksportuj złamanego odwołania)
    const inner = `<xdr:pic><xdr:nvPicPr><xdr:cNvPr id="${id}" name="Obraz ${id}"/><xdr:cNvPicPr/></xdr:nvPicPr>` +
      `<xdr:blipFill><a:blip r:embed="${mediaRel}"/>${srcRect}<a:stretch><a:fillRect/></a:stretch></xdr:blipFill>` +
      `<xdr:spPr><a:xfrm${rot}${flip}><a:off x="${xlsxOutEmu(s.x)}" y="${xlsxOutEmu(s.y)}"/><a:ext cx="${xlsxOutEmu(s.w)}" cy="${xlsxOutEmu(s.h)}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom>${border}</xdr:spPr>` +
      `</xdr:pic>`;
    return xlsxOutAnchorTag(s.x, s.y, s.w, s.h, inner);
  }
  if (s.type === 'line') {
    const x = Math.min(s.x1, s.x2), y = Math.min(s.y1, s.y2);
    const w = Math.abs(s.x2 - s.x1), h = Math.abs(s.y2 - s.y1);
    const flipH = s.x2 < s.x1 ? ' flipH="1"' : '', flipV = s.y2 < s.y1 ? ' flipV="1"' : '';
    const arrow = end => `<a:${end}End type="triangle"/>`;
    const ln = `<a:ln w="${Math.max(1, Math.round((s.sw || 1) * 12700))}"><a:solidFill><a:srgbClr val="${xlsxOutHex(s.stroke || '#000000')}"/></a:solidFill>` +
      `<a:prstDash val="${XLSX_OUT_DASH[s.dash] || 'solid'}"/>${s.as ? arrow('head') : ''}${s.ae ? arrow('tail') : ''}</a:ln>`;
    const inner = `<xdr:cxnSp><xdr:nvCxnSpPr><xdr:cNvPr id="${id}" name="Łącznik ${id}"/><xdr:cNvCxnSpPr/></xdr:nvCxnSpPr>` +
      `<xdr:spPr><a:xfrm${flipH}${flipV}><a:off x="${xlsxOutEmu(x)}" y="${xlsxOutEmu(y)}"/><a:ext cx="${xlsxOutEmu(w) || 1}" cy="${xlsxOutEmu(h) || 1}"/></a:xfrm><a:prstGeom prst="line"><a:avLst/></a:prstGeom>${ln}</xdr:spPr>` +
      `</xdr:cxnSp>`;
    return xlsxOutAnchorTag(x, y, w, h, inner);
  }
  /* rect / roundRect / ellipse / poly / text — wszystkie jako <xdr:sp>, pozycja z bboxOf (tekst bez własnych w/h liczy się z treści) */
  const b = bboxOf(s);
  const rot = s.rot ? ` rot="${Math.round((((s.rot % 360) + 360) % 360) * 60000)}"` : '';
  const flip = `${s.flipH ? ' flipH="1"' : ''}${s.flipV ? ' flipV="1"' : ''}`;
  const prst = s.type === 'ellipse' ? 'ellipse' : s.type === 'roundRect' ? 'roundRect' : s.type === 'poly' ? (XLSX_OUT_PRESET[s.preset] || 'rect') : 'rect';
  const avLst = prst === 'roundRect' ? `<a:gd name="adj" fmla="val ${Math.round(((s.rx || 8) / Math.max(1, Math.min(b.w, b.h))) * 100000)}"/>` : '';
  const inner = `<xdr:sp macro="" textlink=""><xdr:nvSpPr><xdr:cNvPr id="${id}" name="Kształt ${id}"/><xdr:cNvSpPr/></xdr:nvSpPr>` +
    `<xdr:spPr><a:xfrm${rot}${flip}><a:off x="${xlsxOutEmu(b.x)}" y="${xlsxOutEmu(b.y)}"/><a:ext cx="${xlsxOutEmu(b.w) || 1}" cy="${xlsxOutEmu(b.h) || 1}"/></a:xfrm><a:prstGeom prst="${prst}"><a:avLst>${avLst}</a:avLst></a:prstGeom>${xlsxOutFillLn(s)}</xdr:spPr>` +
    xlsxOutTextBody(s) +
    `</xdr:sp>`;
  return xlsxOutAnchorTag(b.x, b.y, b.w, b.h, inner);
}
/* tło pod eksportowanymi kształtami — bez niego widać siatkę Excela w
   miejscach, gdzie kanwa jest przezroczysta (przy PNG/JPG tę samą rolę
   pełni biały <rect> w buildSVG()/svgToPngBlob()). Zwykły <xdr:sp> typu
   rect, wstawiany jako PIERWSZY (spód z-order). */
function xlsxOutBgRect(box) {
  const inner = `<xdr:sp macro="" textlink=""><xdr:nvSpPr><xdr:cNvPr id="${++_xlsxOutId}" name="Tło"/><xdr:cNvSpPr/></xdr:nvSpPr>` +
    `<xdr:spPr><a:xfrm><a:off x="${xlsxOutEmu(box.x)}" y="${xlsxOutEmu(box.y)}"/><a:ext cx="${xlsxOutEmu(box.w) || 1}" cy="${xlsxOutEmu(box.h) || 1}"/></a:xfrm>` +
    `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:ln><a:noFill/></a:ln></xdr:spPr>` +
    `<xdr:txBody><a:bodyPr/><a:lstStyle/><a:p/></xdr:txBody></xdr:sp>`;
  return xlsxOutAnchorTag(box.x, box.y, box.w, box.h, inner);
}
/* data: URL obrazu -> {bytes, ext} do zapisu jako plik w xl/media */
function xlsxOutImageBytes(href) {
  const m = /^data:image\/([a-zA-Z0-9.+-]+);base64,(.*)$/.exec(href || '');
  if (!m) return null;
  let ext = m[1].toLowerCase(); if (ext === 'svg+xml') ext = 'svg'; if (ext === 'jpg') ext = 'jpeg';
  const bin = atob(m[2]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { bytes, ext };
}
async function exportXlsx() {
  try {
    if (typeof ExcelJS === 'undefined') return toast(t('t.importErr') + 'ExcelJS');
    const shapes = state.shapes;
    if (!shapes.length) return toast(t('t.emptyCanvas'));
    toast(t('t.reading'));
    _xlsxOutId = 1;
    /* 1) bazowy skoroszyt przez ExcelJS (arkusz, ustawienia, style — to ExcelJS robi dobrze) */
    const wb = new ExcelJS.Workbook();
    wb.creator = 'ProdDraw';
    wb.addWorksheet(sanitizeSheetName($('#projName').value || state.name));
    const base = await wb.xlsx.writeBuffer();
    const baseAb = base.buffer ? base.buffer.slice(base.byteOffset, base.byteOffset + base.byteLength) : base;
    const parts = await readZipAll(baseAb);
    /* 2) media (obrazy) + relacje drawing1.xml.rels */
    const mediaFiles = [];
    let drawingRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">';
    let relN = 0;
    const mediaRelFor = s => {
      const img = xlsxOutImageBytes(s.href);
      if (!img) return null;
      relN++;
      const name = `image${relN}.${img.ext}`;
      mediaFiles.push({ name: 'xl/media/' + name, data: img.bytes });
      drawingRels += `<Relationship Id="rId${relN}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/${name}"/>`;
      return 'rId' + relN;
    };
    /* 3) drawing1.xml — jeden <xdr:twoCellAnchor> na kształt, w kolejności z-order (patrz layeredShapes()),
       poprzedzony białym tłem na spodzie (patrz xlsxOutBgRect) tak samo rozciągniętym jak przy PNG/JPG:
       format strony jeśli ustawiony, inaczej obrys kształtów + margines kanwy nieskończonej */
    const visible = layeredShapes().filter(s => !isShapeEffectivelyHidden(s));
    let bgBox = pageRegion();
    if (!bgBox && visible.length) {
      const pad = (settings.infiniteCanvasMargin != null) ? settings.infiniteCanvasMargin : 16;
      const b = unionBBox(visible);
      bgBox = { x: b.x - pad, y: b.y - pad, w: b.w + 2 * pad, h: b.h + 2 * pad };
    }
    let drawingBody = bgBox ? xlsxOutBgRect(bgBox) : '';
    for (const s of visible) {
      drawingBody += xlsxOutShapeXml(s, s.type === 'image' ? mediaRelFor(s) : null);
    }
    drawingRels += '</Relationships>';
    const drawingXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      drawingBody + '</xdr:wsDr>';
    /* 4) dopnij drawing1.xml do arkusza: rels arkusza + <drawing r:id> w sheet1.xml + wpisy w [Content_Types].xml */
    const enc = new TextEncoder(), td = new TextDecoder();
    const sheetPart = parts.find(p => p.name === 'xl/worksheets/sheet1.xml');
    let sheetXml = td.decode(sheetPart.data);
    sheetXml = sheetXml.replace('</worksheet>', '<drawing r:id="rId1"/></worksheet>');
    sheetPart.data = enc.encode(sheetXml);
    const sheetRelsXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/></Relationships>';
    const ctPart = parts.find(p => p.name === '[Content_Types].xml');
    let ctXml = td.decode(ctPart.data);
    const extras = ['<Default Extension="png" ContentType="image/png"/>', '<Default Extension="jpeg" ContentType="image/jpeg"/>',
      '<Default Extension="gif" ContentType="image/gif"/>', '<Default Extension="bmp" ContentType="image/bmp"/>',
      '<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>']
      .filter(tag => !ctXml.includes(tag.match(/Extension="([^"]+)"|PartName="([^"]+)"/)[0]));
    ctXml = ctXml.replace('</Types>', extras.join('') + '</Types>');
    ctPart.data = enc.encode(ctXml);
    /* 5) spakuj z powrotem: pliki istniejące (bez katalogów-atrap) + nowe */
    const outFiles = parts.filter(p => !p.name.endsWith('/')).map(p => ({ name: p.name, data: p.data }));
    outFiles.push({ name: 'xl/drawings/drawing1.xml', data: enc.encode(drawingXml) });
    outFiles.push({ name: 'xl/drawings/_rels/drawing1.xml.rels', data: enc.encode(drawingRels) });
    outFiles.push({ name: 'xl/worksheets/_rels/sheet1.xml.rels', data: enc.encode(sheetRelsXml) });
    outFiles.push(...mediaFiles);
    const blob = makeZip(outFiles);
    const name = (stripExt(sanitizeFile($('#projName').value)) || 'ProdDraw') + '.xlsx';
    downloadBlob(new Blob([blob], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), name);
    toast(t('t.xlsxExported') + name, 6000);
  } catch (err) { toast(t('t.saveErr')); }
}

/* =====================================================================
   KREATOR KADRU po imporcie XLSX — zaznacz obszar roboczy (przeciągnięciem
   na kanwie), dopasuj do niego format strony, opcjonalnie usuwając kształty
   leżące całkowicie poza nim. Import odbywa się na kanwie NIESKOŃCZONEJ.
   ===================================================================== */
function xlsxCropDefaultBox(shapes) {
  const b = unionBBox(shapes);
  if (!b) return { x: 0, y: 0, w: 400, h: 300 };
  const pad = 20;
  return { x: Math.round(b.x - pad), y: Math.round(b.y - pad), w: Math.round(b.w + pad * 2), h: Math.round(b.h + pad * 2) };
}
let xlsxCropImportedIds = null;   // id-y kształtów z TEGO importu (filtr „usuń poza obszarem")
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
      if (!importedIds.has(s.id)) return true;   /* nie ruszaj kształtów spoza importu */
      const b = aabbOf(s);
      /* usuń tylko CAŁKOWICIE poza kadrem — zostaw wszystko, co choć trochę zachodzi */
      return b.x < box.x + box.w && b.x + b.w > box.x && b.y < box.y + box.h && b.y + b.h > box.y;
    });
  }
  const dx = -box.x, dy = -box.y;
  for (const s of state.shapes) shiftShapeXY(s, dx, dy);
  state.page = { mode: 'custom', w: Math.max(10, Math.round(box.w)), h: Math.max(10, Math.round(box.h)) };
  syncPageUI();
  xlsxCropEnd();
  sel.clear();
  fitPage(); render(); renderProps(); renderVars(); autosave();
  toast(t('xlsxcrop.done'));
}
/* „Nie przycinaj" — zachowaj import bez kadrowania, tylko zamknij kreator */
function xlsxCropSkip() { xlsxCropEnd(); toast(t('xlsxcrop.skipped')); }
/* „Anuluj" — odrzuć kształty z TEGO importu (jakby import się nie odbył) */
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
if ($('#xlsxCropConfirm')) $('#xlsxCropConfirm').addEventListener('click', xlsxCropConfirm);
if ($('#xlsxCropSkip')) $('#xlsxCropSkip').addEventListener('click', xlsxCropSkip);
if ($('#xlsxCropCancel')) $('#xlsxCropCancel').addEventListener('click', xlsxCropAbort);

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
