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
function downloadBlob(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
}

/* =====================================================================
   RENDEROWANIE
   ===================================================================== */
