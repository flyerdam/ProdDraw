"use strict";
/* ---------- ZIP: zapis (STORE) + odczyt ---------- */
const CRC_T = (() => { const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c; } return t; })();
function crc32(u8) { let c = 0xFFFFFFFF;
  for (let i = 0; i < u8.length; i++) c = CRC_T[(c ^ u8[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0; }

function makeZip(files) { // files: [{name, data:Uint8Array}]
  const enc = new TextEncoder(), parts = [], central = []; let off = 0;
  for (const f of files) {
    const nb = enc.encode(f.name), crc = crc32(f.data);
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true);
    lh.setUint32(14, crc, true);
    lh.setUint32(18, f.data.length, true); lh.setUint32(22, f.data.length, true);
    lh.setUint16(26, nb.length, true);
    parts.push(new Uint8Array(lh.buffer), nb, f.data);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true);
    ch.setUint32(16, crc, true);
    ch.setUint32(20, f.data.length, true); ch.setUint32(24, f.data.length, true);
    ch.setUint16(28, nb.length, true); ch.setUint32(42, off, true);
    central.push(new Uint8Array(ch.buffer), nb);
    off += 30 + nb.length + f.data.length;
  }
  let cdSize = 0; central.forEach(p => cdSize += p.length);
  const eo = new DataView(new ArrayBuffer(22));
  eo.setUint32(0, 0x06054b50, true);
  eo.setUint16(8, files.length, true); eo.setUint16(10, files.length, true);
  eo.setUint32(12, cdSize, true); eo.setUint32(16, off, true);
  return new Blob([...parts, ...central, new Uint8Array(eo.buffer)], { type: 'application/zip' });
}

async function inflateRaw(u8) {
  const ds = new DecompressionStream('deflate-raw');
  const stream = new Blob([u8]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
async function readZipMedia(buf) { // wyciąga xl/media/* z xlsx
  const u8 = new Uint8Array(buf), dv = new DataView(buf);
  let eocd = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 70000); i--)
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('Nieprawidłowy plik ZIP/XLSX');
  const count = dv.getUint16(eocd + 10, true), cdOff = dv.getUint32(eocd + 16, true);
  const td = new TextDecoder(); const out = []; let p = cdOff;
  for (let n = 0; n < count; n++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true);
    const nl = dv.getUint16(p + 28, true), el = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true);
    const lo = dv.getUint32(p + 42, true);
    const name = td.decode(u8.subarray(p + 46, p + 46 + nl));
    if (/^xl\/media\//i.test(name)) {
      const lnl = dv.getUint16(lo + 26, true), lel = dv.getUint16(lo + 28, true);
      const start = lo + 30 + lnl + lel;
      const comp = u8.slice(start, start + csize);
      let data = null;
      if (method === 0) data = comp;
      else if (method === 8) data = await inflateRaw(comp);
      if (data) out.push({ name, data });
    }
    p += 46 + nl + el + cl;
  }
  return out;
}
/* czytanie wszystkich wpisów ZIP (do importu kształtów z XLSM) */
async function readZipAll(buf) {
  const u8 = new Uint8Array(buf), dv = new DataView(buf);
  let eocd = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 70000); i--)
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('Invalid ZIP/XLSX');
  const count = dv.getUint16(eocd + 10, true), cdOff = dv.getUint32(eocd + 16, true);
  const td = new TextDecoder(); const out = []; let p = cdOff;
  for (let n = 0; n < count; n++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true);
    const nl = dv.getUint16(p + 28, true), el = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true);
    const lo = dv.getUint32(p + 42, true);
    const name = td.decode(u8.subarray(p + 46, p + 46 + nl));
    const lnl = dv.getUint16(lo + 26, true), lel = dv.getUint16(lo + 28, true);
    const start = lo + 30 + lnl + lel;
    const comp = u8.slice(start, start + csize);
    let data = null;
    try {
      if (method === 0) data = comp;
      else if (method === 8) data = await inflateRaw(comp);
    } catch (e) {}
    if (data) out.push({ name, data });
    p += 46 + nl + el + cl;
  }
  return out;
}
function parseSheetDims(xml) {
  const DEFAULT_COL = 64, DEFAULT_ROW = 20;
  const colWidths = new Array(1024).fill(DEFAULT_COL);
  const rowHeights = new Array(65536).fill(DEFAULT_ROW);
  for (const m of xml.matchAll(/<col\s[^>]+>/g)) {
    const s = m[0];
    const minM = s.match(/\bmin="(\d+)"/), maxM = s.match(/\bmax="(\d+)"/);
    if (!minM || !maxM) continue;
    /* kolumna ukryta (hidden="1") -> szerokość 0, żeby nie wstrzykiwać "widma" odstępu */
    const hidden = /\bhidden="1"/.test(s);
    const wM = s.match(/\bwidth="([\d.]+)"/);
    const px = hidden ? 0 : (wM ? Math.max(4, Math.round(parseFloat(wM[1]) * 7 + 5)) : null);
    if (px !== null) for (let c = +minM[1] - 1; c <= +maxM[1] - 1 && c < 1024; c++) colWidths[c] = px;
  }
  for (const m of xml.matchAll(/<row\s[^>]+>/g)) {
    const s = m[0];
    const rM = s.match(/\br="(\d+)"/);
    if (!rM) continue;
    /* wiersz ukryty (hidden="1") -> wysokość 0 */
    if (/\bhidden="1"/.test(s)) { rowHeights[+rM[1] - 1] = 0; continue; }
    const htM = s.match(/\bht="([\d.]+)"/);
    if (htM) rowHeights[+rM[1] - 1] = Math.max(4, Math.round(parseFloat(htM[1]) * 96 / 72));
  }
  return { colWidths, rowHeights };
}
function cellPx(col, colOff, row, rowOff, dims) {
  const EPX = 9525;
  let x = colOff / EPX, y = rowOff / EPX;
  for (let c = 0; c < col && c < dims.colWidths.length; c++) x += dims.colWidths[c];
  for (let r = 0; r < row && r < dims.rowHeights.length; r++) y += dims.rowHeights[r];
  return { x, y };
}
function xlColor(xml) {
  const m = xml.match(/<a:srgbClr\s+val="([0-9a-fA-F]{6})"/);
  return m ? '#' + m[1] : null;
}
/* wyciągnij liczbowe atrybuty z tagu XML niezależnie od kolejności ich zapisu
   (niektóre generatory/kopie zapisują np. cy przed cx) */
function xmlNums(tagXml, ...names) {
  const out = {};
  for (const n of names) {
    const m = tagXml && tagXml.match(new RegExp('\\b' + n + '="(-?\\d+)"'));
    out[n] = m ? +m[1] : undefined;
  }
  return out;
}
function parseNodeXfrm(xml) {
  const xfrm = xml.match(/<a:xfrm[^>]*>([\s\S]*?)<\/a:xfrm>/)?.[1];
  if (!xfrm) return null;
  const offTag = xfrm.match(/<a:off\b[^>]*\/?>/)?.[0];
  const extTag = xfrm.match(/<a:ext\b[^>]*\/?>/)?.[0];
  const chOffTag = xfrm.match(/<a:chOff\b[^>]*\/?>/)?.[0];
  const chExtTag = xfrm.match(/<a:chExt\b[^>]*\/?>/)?.[0];
  const off = xmlNums(offTag, 'x', 'y');
  const ext = xmlNums(extTag, 'cx', 'cy');
  const chOff = xmlNums(chOffTag, 'x', 'y');
  const chExt = xmlNums(chExtTag, 'cx', 'cy');
  return {
    offX: off.x || 0, offY: off.y || 0,
    extX: ext.cx || 0, extY: ext.cy || 0,
    chOffX: chOff.x || 0, chOffY: chOff.y || 0,
    chExtX: chExt.cx || 0, chExtY: chExt.cy || 0
  };
}
function parseShapeNode(nodeXml, box) {
  const prstM = nodeXml.match(/<a:prstGeom\s+prst="([^"]+)"/);
  const prst = prstM ? prstM[1] : 'rect';
  let fill = '#ffffff', noFill = false;
  const spFillM = nodeXml.match(/<a:solidFill>([\s\S]*?)<\/a:solidFill>/);
  if (/<a:noFill/.test(nodeXml.match(/<a:spPr[^>]*>([\s\S]*?)<\/a:spPr>/)?.[1] || '')) {
    noFill = true; fill = 'none';
  } else if (spFillM) {
    const c = xlColor(spFillM[1]); if (c) fill = c;
  }
  let stroke = '#111827', noStroke = false, sw = 1.5;
  const lnM = nodeXml.match(/<a:ln(?:\s[^>]*)?>[\s\S]*?<\/a:ln>/);
  if (lnM) {
    const lnStr = lnM[0];
    if (/<a:noFill/.test(lnStr)) noStroke = true;
    const wm = lnStr.match(/\bw="(\d+)"/);
    if (wm) sw = Math.max(0.5, Math.round(+wm[1] / 12700 * 10) / 10);
    const lc = xlColor(lnStr); if (lc) stroke = lc;
  } else noStroke = true;
  let text = '', fs = 14, tc = '#111827', bold = false, font = 'Calibri';
  const txM = nodeXml.match(/<xdr:txBody>([\s\S]*?)<\/xdr:txBody>/);
  if (txM) {
    const parts = [];
    for (const tm of txM[1].matchAll(/<a:t>([^<]*)<\/a:t>/g)) parts.push(tm[1]);
    text = parts.join('');
    const fontM = txM[1].match(/typeface="([^"]+)"/);
    if (fontM && fontM[1]) {
      const raw = fontM[1];
      /* "+mn-lt"/"+mj-lt" to odwołania do czcionki motywu (Minor/Major Latin), nie realna
         nazwa fontu — CSS font-family jej nie rozpozna i renderer wpada w domyślny szeryfowy */
      font = (raw === '+mn-lt' || raw === '+mj-lt')
        ? ((typeof settings !== 'undefined' && settings.defaults && settings.defaults.font) || 'Calibri')
        : raw;
    }
    const rPrM = txM[1].match(/<a:rPr\s([^>]+)/);
    if (rPrM) {
      const szM = rPrM[1].match(/\bsz="(\d+)"/);
      if (szM) fs = Math.max(6, Math.round(+szM[1] / 100));
      bold = /\bb="1"/.test(rPrM[1]);
      const tcM = txM[1].match(/<a:rPr[^>]*>([\s\S]*?)<\/a:rPr>/);
      if (tcM) { const tcc = xlColor(tcM[1]); if (tcc) tc = tcc; }
    }
  }
  const polyPrests = {
    ellipse: null, triangle: 'triangle', rtTriangle: 'rtTriangle', diamond: 'diamond',
    pentagon: 'pentagon', hexagon: 'hexagon', heptagon: 'heptagon', octagon: 'octagon',
    star4: 'star4', star5: 'star5', star6: 'star6', plus: 'cross', irregularSeal1: 'star5',
    irregularSeal2: 'star6', rightArrow: 'rightArrow', leftArrow: 'leftArrow',
    parallelogram: 'parallelogram', trapezoid: 'trapezoid', chevron: 'chevron', homePlate: 'chevron'
  };
  const knownPrst = new Set(['rect', 'roundRect', 'ellipse', ...Object.keys(polyPrests)]);
  const s = {
    id: uid(), type: 'rect', x: box.x, y: box.y, w: box.w, h: box.h,
    fill, noFill, stroke, noStroke, sw, dash: 'solid', text, fs, tc, bold, font, locked: false
  };
  if (prst === 'ellipse') s.type = 'ellipse';
  else if (prst === 'roundRect') { s.type = 'roundRect'; s.rx = 8; }
  else if (polyPrests[prst]) { s.type = 'poly'; s.preset = polyPrests[prst]; }
  const rid = nodeXml.match(/<a:blip[^>]*r:embed="([^"]+)"/)?.[1] || null;
  s._unsupported = !knownPrst.has(prst);
  s._embedRid = rid;
  return s;
}
function parseConnectorNode(nodeXml, box) {
  let stroke = '#111827', sw = 1.5;
  const lnM = nodeXml.match(/<a:ln(?:\s[^>]*)?>[\s\S]*?<\/a:ln>/);
  if (lnM) {
    const wm = lnM[0].match(/\bw="(\d+)"/);
    if (wm) sw = Math.max(0.5, Math.round(+wm[1] / 12700 * 10) / 10);
    const lc = xlColor(lnM[0]); if (lc) stroke = lc;
  }
  const flipH = /<a:xfrm[^>]*\bflipH="1"/.test(nodeXml);
  const flipV = /<a:xfrm[^>]*\bflipV="1"/.test(nodeXml);
  const ae = /<a:tailEnd[^>]*(?:type="arrow"|type="triangle")/.test(nodeXml) ||
             /<a:headEnd[^>]*(?:type="arrow"|type="triangle")/.test(nodeXml);
  return {
    id: uid(), type: 'line',
    x1: flipH ? box.x + box.w : box.x, y1: flipV ? box.y + box.h : box.y,
    x2: flipH ? box.x : box.x + box.w, y2: flipV ? box.y : box.y + box.h,
    stroke, sw, dash: 'solid', as: false, ae, locked: false
  };
}
function parseGroupedShapes(aXml, anchorBox, relMap = {}, mediaMap = {}) {
  const out = [];
  const pictures = [];
  let unsupportedFallbacks = 0;
  const groupId = 'G' + Date.now().toString(36) + '_' + uidN;
  const grpXml = aXml.match(/<xdr:grpSp[\s>][\s\S]*?<\/xdr:grpSp>/)?.[0];
  if (!grpXml) return { shapes: out, pictures, unsupportedFallbacks };
  const gx = parseNodeXfrm(grpXml);
  const chW = gx?.chExtX || gx?.extX || 1;
  const chH = gx?.chExtY || gx?.extY || 1;
  const chOX = gx?.chOffX || 0;
  const chOY = gx?.chOffY || 0;
  const mapBox = (xf) => {
    const lx = xf?.offX || 0, ly = xf?.offY || 0, lw = xf?.extX || chW, lh = xf?.extY || chH;
    return {
      x: Math.round(anchorBox.x + ((lx - chOX) / chW) * anchorBox.w),
      y: Math.round(anchorBox.y + ((ly - chOY) / chH) * anchorBox.h),
      w: Math.max(2, Math.round((lw / chW) * anchorBox.w)),
      h: Math.max(2, Math.round((lh / chH) * anchorBox.h))
    };
  };
  for (const sm of grpXml.matchAll(/<xdr:sp[\s>][\s\S]*?<\/xdr:sp>/g)) {
    const spXml = sm[0];
    const box = mapBox(parseNodeXfrm(spXml));
    const s = parseShapeNode(spXml, box);
    if (s._unsupported && s._embedRid && relMap[s._embedRid] && mediaMap[relMap[s._embedRid]]) {
      pictures.push({ ...box, ...mediaMap[relMap[s._embedRid]], name: relMap[s._embedRid].replace(/^xl\/media\//i, '') });
      unsupportedFallbacks++;
      continue;
    }
    delete s._unsupported; delete s._embedRid;
    s.g = groupId;
    out.push(s);
  }
  for (const cm of grpXml.matchAll(/<xdr:cxnSp[\s>][\s\S]*?<\/xdr:cxnSp>/g)) {
    const box = mapBox(parseNodeXfrm(cm[0]));
    const s = parseConnectorNode(cm[0], box);
    s.g = groupId;
    out.push(s);
  }
  for (const pm of grpXml.matchAll(/<xdr:pic[\s>][\s\S]*?<\/xdr:pic>/g)) {
    const pXml = pm[0];
    const box = mapBox(parseNodeXfrm(pXml));
    const rid = pXml.match(/<a:blip[^>]*r:embed="([^"]+)"/)?.[1];
    const mediaPath = rid ? relMap[rid] : null;
    if (mediaPath && mediaMap[mediaPath]) pictures.push({ ...box, ...mediaMap[mediaPath], name: mediaPath.replace(/^xl\/media\//i, '') });
  }
  return { shapes: out, pictures, unsupportedFallbacks };
}
function parseDrawingShapes(xml, dims, relMap = {}, mediaMap = {}) {
  const shapes = [];
  const pictures = [];
  let unsupportedFallbacks = 0;
  const EPX = 9525;
  const anchorRe = /<xdr:(absoluteAnchor|twoCellAnchor|oneCellAnchor)>([\s\S]*?)<\/xdr:\1>/g;
  let am;
  while ((am = anchorRe.exec(xml)) !== null) {
    const aType = am[1], aXml = am[2];
    let x, y, w, h;
    try {
      if (aType === 'absoluteAnchor') {
        const posTag = aXml.match(/<xdr:pos\b[^>]*\/?>/)?.[0];
        const extTag = aXml.match(/<xdr:ext\b[^>]*\/?>/)?.[0];
        const pos = xmlNums(posTag, 'x', 'y'), ext = xmlNums(extTag, 'cx', 'cy');
        if (pos.x === undefined || pos.y === undefined || ext.cx === undefined || ext.cy === undefined) continue;
        x = pos.x / EPX; y = pos.y / EPX; w = ext.cx / EPX; h = ext.cy / EPX;
      } else if (aType === 'twoCellAnchor') {
        const fm = aXml.match(/<xdr:from>([\s\S]*?)<\/xdr:from>/);
        const tm = aXml.match(/<xdr:to>([\s\S]*?)<\/xdr:to>/);
        if (!fm || !tm) continue;
        const fi = fm[1], ti = tm[1], g = s => parseInt(s || '0');
        const fc = g(fi.match(/<xdr:col>(\d+)/)?.[1]), fco = g(fi.match(/<xdr:colOff>(\d+)/)?.[1]);
        const fr = g(fi.match(/<xdr:row>(\d+)/)?.[1]), fro = g(fi.match(/<xdr:rowOff>(\d+)/)?.[1]);
        const tc = g(ti.match(/<xdr:col>(\d+)/)?.[1]), tco = g(ti.match(/<xdr:colOff>(\d+)/)?.[1]);
        const tr = g(ti.match(/<xdr:row>(\d+)/)?.[1]), tro = g(ti.match(/<xdr:rowOff>(\d+)/)?.[1]);
        const fp = cellPx(fc, fco, fr, fro, dims), tp = cellPx(tc, tco, tr, tro, dims);
        x = fp.x; y = fp.y; w = tp.x - fp.x; h = tp.y - fp.y;
      } else {
        const fm = aXml.match(/<xdr:from>([\s\S]*?)<\/xdr:from>/);
        const extTag = aXml.match(/<xdr:ext\b[^>]*\/?>/)?.[0];
        const ext = xmlNums(extTag, 'cx', 'cy');
        if (!fm || ext.cx === undefined || ext.cy === undefined) continue;
        const fi = fm[1], g = s => parseInt(s || '0');
        const fc = g(fi.match(/<xdr:col>(\d+)/)?.[1]), fco = g(fi.match(/<xdr:colOff>(\d+)/)?.[1]);
        const fr = g(fi.match(/<xdr:row>(\d+)/)?.[1]), fro = g(fi.match(/<xdr:rowOff>(\d+)/)?.[1]);
        const fp = cellPx(fc, fco, fr, fro, dims);
        x = fp.x; y = fp.y; w = ext.cx / EPX; h = ext.cy / EPX;
      }
    } catch (e) { continue; }
    if (!w || !h || w < 2 || h < 2) continue;
    const box = { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) };
    /* dysjunktywny łańcuch if/else-if — kotwica z zagnieżdżoną grupą (grpSp) NIGDY nie
       przechodzi dalej do sp/cxnSp/pic (te tagi też występują WEWNĄTRZ grpSp, więc bez
       "else" doszłoby do podwójnego parsowania i pominięcia dalszych gałęzi) */
    if (/<xdr:grpSp[\s>]/.test(aXml)) {
      const g = parseGroupedShapes(aXml, box, relMap, mediaMap);
      shapes.push(...g.shapes);
      pictures.push(...g.pictures);
      unsupportedFallbacks += g.unsupportedFallbacks;
    } else if (/<xdr:sp[\s>]/.test(aXml)) {
      const spXml = aXml.match(/<xdr:sp[\s>][\s\S]*?<\/xdr:sp>/)?.[0];
      if (spXml) {
        const s = parseShapeNode(spXml, box);
        if (s._unsupported && s._embedRid && relMap[s._embedRid] && mediaMap[relMap[s._embedRid]]) {
          pictures.push({ ...box, ...mediaMap[relMap[s._embedRid]], name: relMap[s._embedRid].replace(/^xl\/media\//i, '') });
          unsupportedFallbacks++;
        } else {
          delete s._unsupported; delete s._embedRid;
          shapes.push(s);
        }
      }
    } else if (/<xdr:cxnSp[\s>]/.test(aXml)) {
      const cxnXml = aXml.match(/<xdr:cxnSp[\s>][\s\S]*?<\/xdr:cxnSp>/)?.[0];
      if (cxnXml) shapes.push(parseConnectorNode(cxnXml, box));
    } else if (/<xdr:pic[\s>]/.test(aXml)) {
      const picXml = aXml.match(/<xdr:pic[\s>][\s\S]*?<\/xdr:pic>/)?.[0];
      if (picXml) {
        const rid = picXml.match(/<a:blip[^>]*r:embed="([^"]+)"/)?.[1];
        const mediaPath = rid ? relMap[rid] : null;
        if (mediaPath && mediaMap[mediaPath]) pictures.push({ ...box, ...mediaMap[mediaPath], name: mediaPath.replace(/^xl\/media\//i, '') });
      }
    }
  }
  return { shapes, pictures, unsupportedFallbacks };
}
function resolveRelTarget(basePath, target) {
  if (!target) return null;
  if (/^\/xl\//i.test(target)) return target.replace(/^\//, '');
  if (/^xl\//i.test(target)) return target;
  const baseParts = basePath.split('/'); baseParts.pop();
  for (const seg of target.split('/')) {
    if (!seg || seg === '.') continue;
    if (seg === '..') baseParts.pop();
    else baseParts.push(seg);
  }
  return baseParts.join('/');
}
function parseDrawingRels(relXml, drawingPath) {
  const map = {};
  for (const m of relXml.matchAll(/<Relationship\b[^>]*\bId="([^"]+)"[^>]*\bTarget="([^"]+)"/g))
    map[m[1]] = resolveRelTarget(drawingPath, m[2]);
  return map;
}
function mediaMimeFromName(name) {
  const ext = name.split('.').pop().toLowerCase();
  if (ext === 'png') return 'image/png';
  if (ext === 'gif') return 'image/gif';
  if (ext === 'bmp') return 'image/bmp';
  if (ext === 'webp') return 'image/webp';
  return 'image/jpeg';
}
/* =====================================================================
   IMPORT SIATKI ARKUSZA XLSX — "ekosystem Excela" (komórki + style),
   nakładany na wspólny układ współrzędnych (parseSheetDims), a potem
   wypiekany na natywne kształty ProdDraw (patrz js/15-xlsx.js).
   ===================================================================== */
function unescapeXml(s) {
  return String(s ?? '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
    .replace(/&amp;/g, '&');
}
/* ARGB ("FF1F4E79") / RGB ("1F4E79") -> "#1f4e79"; theme/indexed/auto -> null */
function argbToHex(v) {
  if (!v) return null;
  const h = v.length === 8 ? v.slice(2) : v;
  return /^[0-9a-fA-F]{6}$/.test(h) ? '#' + h.toLowerCase() : null;
}
/* "B12" -> {c:1, r:11} (0-based); zwraca null gdy brak części kolumnowej */
function a1ToRC(ref) {
  const m = /^([A-Z]+)(\d+)$/.exec(ref || '');
  if (!m) return null;
  let c = 0;
  for (const ch of m[1]) c = c * 26 + (ch.charCodeAt(0) - 64);
  return { c: c - 1, r: +m[2] - 1 };
}
function parseSharedStrings(xml) {
  const out = [];
  if (!xml) return out;
  for (const m of xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)) {
    const parts = [];
    for (const tm of m[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)) parts.push(unescapeXml(tm[1]));
    out.push(parts.join(''));
  }
  return out;
}
/* mapowanie stylów krawędzi Excela -> {sw, dash} ProdDraw */
function borderStylePx(style) {
  switch (style) {
    case 'hair': return { sw: 0.4, dash: 'solid' };
    case 'thin': return { sw: 0.75, dash: 'solid' };
    case 'medium': return { sw: 1.75, dash: 'solid' };
    case 'thick': return { sw: 2.75, dash: 'solid' };
    case 'double': return { sw: 2.2, dash: 'solid' };
    case 'dashed': case 'mediumDashed': return { sw: 1, dash: 'dash' };
    case 'dotted': return { sw: 1, dash: 'dot' };
    case 'dashDot': case 'mediumDashDot': return { sw: 1, dash: 'dashdot' };
    case 'dashDotDot': case 'mediumDashDotDot': return { sw: 1, dash: 'dashdot' };
    case 'slantDashDot': return { sw: 1, dash: 'dashdot' };
    default: return { sw: 1, dash: 'solid' };
  }
}
/* jedna strona krawędzi (left/right/top/bottom) -> {style, sw, dash, color} | null */
function parseBorderSide(borderXml, side) {
  const m = borderXml.match(new RegExp('<' + side + '\\b([^>]*)(?:\\/>|>([\\s\\S]*?)<\\/' + side + '>)'));
  if (!m) return null;
  const styleM = m[1].match(/\bstyle="([^"]+)"/);
  const style = styleM ? styleM[1] : null;
  if (!style || style === 'none') return null;
  const colM = (m[2] || '').match(/<color\b[^>]*\brgb="([0-9a-fA-F]{6,8})"/);
  const bs = borderStylePx(style);
  return { style, sw: bs.sw, dash: bs.dash, color: argbToHex(colM ? colM[1] : null) || '#000000' };
}
/* styles.xml -> {fonts, fills, borders, numFmts, cellXfs} (indeksy jak w OOXML) */
function parseStyles(xml) {
  const res = { fonts: [], fills: [], borders: [], numFmts: {}, cellXfs: [] };
  if (!xml) return res;
  for (const m of xml.matchAll(/<numFmt\b[^>]*\bnumFmtId="(\d+)"[^>]*\bformatCode="([^"]*)"/g))
    res.numFmts[+m[1]] = unescapeXml(m[2]);
  const fontsSec = xml.match(/<fonts\b[^>]*>([\s\S]*?)<\/fonts>/)?.[1] || '';
  for (const fm of fontsSec.matchAll(/<font\b[^>]*>([\s\S]*?)<\/font>/g)) {
    const f = fm[1];
    const szM = f.match(/<sz\b[^>]*\bval="([\d.]+)"/);
    const nameM = f.match(/<(?:rFont|name)\b[^>]*\bval="([^"]+)"/);
    const colM = f.match(/<color\b[^>]*\brgb="([0-9a-fA-F]{6,8})"/);
    res.fonts.push({
      sz: szM ? Math.max(6, Math.round(parseFloat(szM[1]) * 96 / 72)) : 15,
      name: nameM ? nameM[1] : 'Calibri',
      color: argbToHex(colM ? colM[1] : null) || '#000000',
      bold: /<b\b[^>]*\/?>/.test(f), italic: /<i\b[^>]*\/?>/.test(f)
    });
  }
  const fillsSec = xml.match(/<fills\b[^>]*>([\s\S]*?)<\/fills>/)?.[1] || '';
  for (const fm of fillsSec.matchAll(/<fill\b[^>]*>([\s\S]*?)<\/fill>/g)) {
    const pf = fm[1].match(/<patternFill\b([^>]*)>?([\s\S]*?)(?:<\/patternFill>|\/>)/);
    let color = null;
    if (pf && /patternType="solid"/.test(pf[1])) {
      const fg = fm[1].match(/<fgColor\b[^>]*\brgb="([0-9a-fA-F]{6,8})"/);
      color = argbToHex(fg ? fg[1] : null);
    }
    res.fills.push({ color });
  }
  const bordersSec = xml.match(/<borders\b[^>]*>([\s\S]*?)<\/borders>/)?.[1] || '';
  for (const bm of bordersSec.matchAll(/<border\b[^>]*>([\s\S]*?)<\/border>/g)) {
    const b = bm[1];
    res.borders.push({
      left: parseBorderSide(b, 'left'), right: parseBorderSide(b, 'right'),
      top: parseBorderSide(b, 'top'), bottom: parseBorderSide(b, 'bottom')
    });
  }
  const xfSec = xml.match(/<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/)?.[1] || '';
  for (const xm of xfSec.matchAll(/<xf\b([^>]*?)(?:\/>|>([\s\S]*?)<\/xf>)/g)) {
    const a = xm[1], inner = xm[2] || '';
    const gi = n => { const m = a.match(new RegExp('\\b' + n + '="(\\d+)"')); return m ? +m[1] : 0; };
    const ap = n => new RegExp('\\b' + n + '="1"').test(a);
    const alM = inner.match(/<alignment\b([^>]*)\/?>/);
    const al = alM ? alM[1] : '';
    res.cellXfs.push({
      numFmtId: gi('numFmtId'), fontId: gi('fontId'), fillId: gi('fillId'), borderId: gi('borderId'),
      applyFont: ap('applyFont'), applyFill: ap('applyFill'), applyBorder: ap('applyBorder'), applyNumFmt: ap('applyNumberFormat'),
      halign: (al.match(/\bhorizontal="([^"]+)"/) || [])[1] || null,
      valign: (al.match(/\bvertical="([^"]+)"/) || [])[1] || null,
      wrap: /\bwrapText="1"/.test(al)
    });
  }
  return res;
}
/* sheetN.xml -> {cells:[{c,r,s,v}], merges:[{c1,r1,c2,r2}]} (v = tekst do wyświetlenia) */
function parseSheetCells(xml, shared, styles) {
  const cells = [], merges = [];
  const BUILTIN_DATE = new Set([14, 15, 16, 17, 22, 45, 46, 47]);
  for (const cm of xml.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
    const attrs = cm[1], inner = cm[2] || '';
    const rc = a1ToRC((attrs.match(/\br="([A-Z]+\d+)"/) || [])[1]);
    if (!rc) continue;
    const sIdx = +((attrs.match(/\bs="(\d+)"/) || [])[1] || -1);
    const t = (attrs.match(/\bt="([^"]+)"/) || [])[1] || 'n';
    let val = '', num = false, bool = false;
    if (t === 'inlineStr') {
      const parts = [];
      for (const tm of inner.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)) parts.push(unescapeXml(tm[1]));
      val = parts.join('');
    } else {
      const vm = inner.match(/<v\b[^>]*>([\s\S]*?)<\/v>/);
      const raw = vm ? vm[1] : '';
      if (t === 's') val = shared[+raw] ?? '';
      else if (t === 'str') val = unescapeXml(raw);
      else if (t === 'b') { val = raw === '1' ? 'TRUE' : 'FALSE'; bool = true; }
      else if (t === 'e') val = unescapeXml(raw);
      else {
        const xf = (styles && styles.cellXfs[sIdx]) || null;
        const code = xf ? (styles.numFmts[xf.numFmtId] || (BUILTIN_DATE.has(xf.numFmtId) ? 'yyyy-mm-dd' : null)) : null;
        val = raw === '' ? '' : fmtExcel(raw, code);
        num = raw !== '';
      }
    }
    cells.push({ c: rc.c, r: rc.r, s: sIdx, v: val, num, bool });
  }
  const mcSec = xml.match(/<mergeCells\b[^>]*>([\s\S]*?)<\/mergeCells>/)?.[1] || '';
  for (const mm of mcSec.matchAll(/<mergeCell\b[^>]*\bref="([A-Z]+\d+):([A-Z]+\d+)"/g)) {
    const a = a1ToRC(mm[1]), b = a1ToRC(mm[2]);
    if (a && b) merges.push({ c1: Math.min(a.c, b.c), r1: Math.min(a.r, b.r), c2: Math.max(a.c, b.c), r2: Math.max(a.r, b.r) });
  }
  return { cells, merges };
}
/* układ współrzędnych: sumy prefiksowe px kolumn/wierszy -> szybkie pudełko komórki */
function gridGeom(dims) {
  const nc = dims.colWidths.length, nr = dims.rowHeights.length;
  const colX = new Float64Array(nc + 1), rowY = new Float64Array(nr + 1);
  for (let c = 0; c < nc; c++) colX[c + 1] = colX[c] + dims.colWidths[c];
  for (let r = 0; r < nr; r++) rowY[r + 1] = rowY[r] + dims.rowHeights[r];
  const X = c => colX[Math.max(0, Math.min(nc, c))];
  const Y = r => rowY[Math.max(0, Math.min(nr, r))];
  return {
    box: (c1, r1, c2, r2) => ({ x: X(c1), y: Y(r1), w: X(c2 + 1) - X(c1), h: Y(r2 + 1) - Y(r1) })
  };
}
/* formatowanie liczb/dat Excela — pragmatyczny podzbiór najczęstszych kodów;
   nieobsłużone kody -> przycięta liczba (bez utraty wartości) */
function fmtExcel(raw, code) {
  const num = parseFloat(raw);
  if (!isFinite(num)) return unescapeXml(raw);
  const trim = n => {
    let s = n.toPrecision(12); s = String(parseFloat(s));
    return s;
  };
  if (!code || /^general$/i.test(code)) return trim(num);
  const section = code.split(';')[0];
  const bare = section.replace(/"[^"]*"/g, '').replace(/\[[^\]]*\]/g, '').replace(/\\./g, '');
  const isDate = /[ymdhs]/i.test(bare) && !/[#0]/.test(bare);
  if (isDate) return fmtExcelDate(num, section);
  const percent = /%/.test(bare);
  let v = percent ? num * 100 : num;
  const decM = bare.match(/\.(0+)/);
  const dec = decM ? decM[1].length : 0;
  const thousands = /[#0],[#0]/.test(bare);
  let s = Math.abs(v).toFixed(dec);
  if (thousands) {
    const [ip, dp] = s.split('.');
    s = ip.replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + (dp ? '.' + dp : '');
  }
  if (v < 0) s = '-' + s;
  if (percent) s += '%';
  return s;
}
function fmtExcelDate(serial, code) {
  const ms = Date.UTC(1899, 11, 30) + Math.round(serial * 86400000);
  const d = new Date(ms);
  const p2 = n => String(n).padStart(2, '0');
  const Y = d.getUTCFullYear(), Mo = d.getUTCMonth() + 1, Da = d.getUTCDate();
  const H = d.getUTCHours(), Mi = d.getUTCMinutes(), Se = d.getUTCSeconds();
  const hasDate = /[ymd]/i.test(code), hasTime = /[hs]/i.test(code);
  const parts = [];
  if (hasDate) parts.push(/yyyy/i.test(code) ? `${Y}-${p2(Mo)}-${p2(Da)}` : `${p2(Da)}.${p2(Mo)}.${String(Y).slice(-2)}`);
  if (hasTime) parts.push(/s/i.test(code) ? `${p2(H)}:${p2(Mi)}:${p2(Se)}` : `${p2(H)}:${p2(Mi)}`);
  return parts.join(' ') || `${Y}-${p2(Mo)}-${p2(Da)}`;
}
function downloadBlob(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
}

/* =====================================================================
   RENDEROWANIE
   ===================================================================== */
