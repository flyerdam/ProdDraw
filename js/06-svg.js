"use strict";
function getDash(dash, sw) {
  switch (dash) {
    case 'dash':    return `${sw * 4} ${sw * 2.5}`;
    case 'dot':     return `${sw * 0.9} ${sw * 2.2}`;
    case 'dashdot': return `${sw * 5} ${sw * 2} ${sw * 0.9} ${sw * 2}`;
    case 'longdash':return `${sw * 9} ${sw * 4}`;
    default: return '';
  }
}
/* podstawianie zmiennych {NAZWA} */
function subst(text, vals) {
  if (!vals) return text;
  return String(text ?? '').replace(/\{([^}]+)\}/g, (m, k) =>
    (k in vals) ? vals[k] : m);
}
function textBlockSVG(cx, cy, text, fs, color, bold, vals, font = 'Calibri', italic = false) {
  const lines = subst(text, vals).split('\n');
  if (!lines.join('')) return '';
  const lh = fs * 1.25;
  /* wyrównanie linii bazowej: środek wizualny w środku geometrycznym */
  const y0 = cy - (lines.length - 1) * lh / 2 + fs * 0.35;
  const ts = lines.map((l, i) =>
    `<tspan x="${cx}" y="${y0 + i * lh}">${escXml(l)}</tspan>`).join('');
  return `<text text-anchor="middle" font-family="${escXml(font || 'Calibri')},Arial,sans-serif" font-size="${fs}" ${bold ? 'font-weight="bold"' : ''} ${italic ? 'font-style="italic"' : ''} fill="${color}">${ts}</text>`;
}
/* punkty wielokątów dla presetów kształtów */
function polyPoints(preset, x, y, w, h) {
  const cx = x + w / 2, cy = y + h / 2, r = w / 2, ry = h / 2;
  const nPts = (n, oRx, oRy, iRx, iRy, sa) => {
    const pts = [];
    for (let i = 0; i < n * 2; i++) {
      const a = sa + (i * Math.PI / n);
      const rx = i % 2 === 0 ? oRx : iRx, ry2 = i % 2 === 0 ? oRy : iRy;
      pts.push([cx + rx * Math.cos(a), cy + ry2 * Math.sin(a)]);
    }
    return pts;
  };
  const regPoly = (n, sa = -Math.PI / 2) => Array.from({ length: n }, (_, i) => {
    const a = sa + i * 2 * Math.PI / n;
    return [cx + r * Math.cos(a), cy + ry * Math.sin(a)];
  });
  switch (preset) {
    case 'triangle': return [[cx, y], [x + w, y + h], [x, y + h]];
    case 'rtTriangle': return [[x, y], [x + w, y + h], [x, y + h]];
    case 'diamond': return [[cx, y], [x + w, cy], [cx, y + h], [x, cy]];
    case 'pentagon': return regPoly(5);
    case 'hexagon': return regPoly(6, 0);
    case 'heptagon': return regPoly(7);
    case 'octagon': return regPoly(8, -Math.PI / 8);
    case 'star4': return nPts(4, r, ry, r * 0.4, ry * 0.4, -Math.PI / 2);
    case 'star5': return nPts(5, r, ry, r * 0.38, ry * 0.38, -Math.PI / 2);
    case 'star6': return nPts(6, r, ry, r * 0.5, ry * 0.5, -Math.PI / 2);
    case 'cross': {
      const t = w * 0.3, t2 = h * 0.3;
      return [[cx - t / 2, y], [cx + t / 2, y], [cx + t / 2, cy - t2 / 2], [x + w, cy - t2 / 2],
        [x + w, cy + t2 / 2], [cx + t / 2, cy + t2 / 2], [cx + t / 2, y + h], [cx - t / 2, y + h],
        [cx - t / 2, cy + t2 / 2], [x, cy + t2 / 2], [x, cy - t2 / 2], [cx - t / 2, cy - t2 / 2]];
    }
    case 'parallelogram': { const s2 = w * 0.2; return [[x + s2, y], [x + w, y], [x + w - s2, y + h], [x, y + h]]; }
    case 'trapezoid': { const s2 = w * 0.15; return [[x + s2, y], [x + w - s2, y], [x + w, y + h], [x, y + h]]; }
    case 'chevron': { const p = w * 0.25; return [[x, y], [x + w - p, y], [x + w, cy], [x + w - p, y + h], [x, y + h], [x + p, cy]]; }
    case 'rightArrow': { const aw = w * 0.4, ah = h * 0.35; return [[x, cy - ah], [x + w - aw, cy - ah], [x + w - aw, y], [x + w, cy], [x + w - aw, y + h], [x + w - aw, cy + ah], [x, cy + ah]]; }
    case 'leftArrow': { const aw = w * 0.4, ah = h * 0.35; return [[x, cy], [x + aw, y], [x + aw, cy - ah], [x + w, cy - ah], [x + w, cy + ah], [x + aw, cy + ah], [x + aw, y + h]]; }
    default: return [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
  }
}
function arrowHeadSVG(fromX, fromY, tipX, tipY, sw, color) {
  const a = Math.atan2(tipY - fromY, tipX - fromX);
  const L = 5 + sw * 3.2, W = (5 + sw * 3.2) * 0.42;
  const bx = tipX - L * Math.cos(a), by = tipY - L * Math.sin(a);
  const px = -Math.sin(a) * W, py = Math.cos(a) * W;
  return `<polygon points="${tipX},${tipY} ${bx + px},${by + py} ${bx - px},${by - py}" fill="${color}"/>`;
}
/* pełny (nieprzycięty) prostokąt obrazka — obraz rysowany w tym rozmiarze, przycięcie tylko przysłania */
function fullRect(s) {
  const l = (s.crop && s.crop.l) || 0, tp = (s.crop && s.crop.t) || 0;
  const r = (s.crop && s.crop.r) || 0, bt = (s.crop && s.crop.b) || 0;
  const FW = s.w / Math.max(0.02, 1 - l - r), FH = s.h / Math.max(0.02, 1 - tp - bt);
  return { x: s.x - l * FW, y: s.y - tp * FH, w: FW, h: FH };
}
/* środek kształtu (do obrotu) */
function shapeCenter(s) {
  if (s.type === 'line') return { x: (s.x1 + s.x2) / 2, y: (s.y1 + s.y2) / 2 };
  const b = bboxOf(s);
  return { x: b.x + b.w / 2, y: b.y + b.h / 2 };
}
/* transform: obrót + odbicie lustrzane wokół środka (linie: brak) */
function rotAttr(s) {
  if (s.type === 'line') return '';
  const hasFlip = s.flipH || s.flipV;
  if (!s.rot && !hasFlip) return '';
  const c = shapeCenter(s);
  let tr = '';
  if (s.rot) tr += `rotate(${s.rot} ${c.x} ${c.y}) `;
  if (hasFlip) {
    const sx = s.flipH ? -1 : 1, sy = s.flipV ? -1 : 1;
    tr += `translate(${c.x} ${c.y}) scale(${sx} ${sy}) translate(${-c.x} ${-c.y})`;
  }
  return ` transform="${tr.trim()}"`;
}
/* kształt -> SVG string. live=true dodaje data-id (interakcja) */
function shapeSVG(s, vals, live) {
  const did = (live ? ` data-id="${s.id}"` : '') + rotAttr(s);
  const stroke = s.noStroke ? 'none' : s.stroke;
  const fill = s.noFill ? 'none' : s.fill;
  const dash = getDash(s.dash, s.sw) ? ` stroke-dasharray="${getDash(s.dash, s.sw)}"` : '';
  if (s.type === 'rect') {
    let out = `<g${did}>` +
      `<rect x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}" fill="${fill}" stroke="${stroke}" stroke-width="${s.sw}"${dash}/>`;
    if (fill === 'none' && live)
      out += `<rect x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}" fill="transparent" stroke="none"/>`;
    out += textBlockSVG(s.x + s.w / 2, s.y + s.h / 2, s.text, s.fs, s.tc, s.bold, vals, s.font, s.italic) + '</g>';
    return out;
  }
  if (s.type === 'ellipse') {
    const cx = s.x + s.w / 2, cy = s.y + s.h / 2;
    let out = `<g${did}>` +
      `<ellipse cx="${cx}" cy="${cy}" rx="${s.w / 2}" ry="${s.h / 2}" fill="${fill}" stroke="${stroke}" stroke-width="${s.sw}"${dash}/>`;
    if (fill === 'none' && live)
      out += `<ellipse cx="${cx}" cy="${cy}" rx="${s.w / 2}" ry="${s.h / 2}" fill="transparent" stroke="none"/>`;
    out += textBlockSVG(cx, cy, s.text, s.fs, s.tc, s.bold, vals, s.font, s.italic) + '</g>';
    return out;
  }
  if (s.type === 'line') {
    const col = s.stroke;
    /* skróć linię pod grotem, żeby kreska nie wystawała z czubka */
    let x1 = s.x1, y1 = s.y1, x2 = s.x2, y2 = s.y2;
    const len = Math.hypot(x2 - x1, y2 - y1) || 1;
    const cut = (4 + s.sw * 2.4);
    const ux = (x2 - x1) / len, uy = (y2 - y1) / len;
    let lx1 = x1, ly1 = y1, lx2 = x2, ly2 = y2;
    if (s.ae && len > cut) { lx2 -= ux * cut; ly2 -= uy * cut; }
    if (s.as && len > cut) { lx1 += ux * cut; ly1 += uy * cut; }
    let out = `<g${did}>` +
      `<line x1="${lx1}" y1="${ly1}" x2="${lx2}" y2="${ly2}" stroke="${col}" stroke-width="${s.sw}"${dash}/>`;
    if (s.ae) out += arrowHeadSVG(x1, y1, x2, y2, s.sw, col);
    if (s.as) out += arrowHeadSVG(x2, y2, x1, y1, s.sw, col);
    if (live) out += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="transparent" stroke-width="${Math.max(12, s.sw + 8)}"/>`;
    return out + '</g>';
  }
  if (s.type === 'text') {
    const lines = subst(s.text, vals).split('\n');
    const lh = s.fs * 1.25;
    const ts = lines.map((l, i) =>
      `<tspan x="${s.x}" y="${s.y + s.fs + i * lh}">${escXml(l)}</tspan>`).join('');
    let out = `<g${did}><text font-family="${escXml(s.font || 'Calibri')},Arial,sans-serif" font-size="${s.fs}" ${s.bold ? 'font-weight="bold"' : ''} ${s.italic ? 'font-style="italic"' : ''} fill="${s.tc}">${ts}</text>`;
    if (live) { const b = bboxOf(s);
      out += `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" fill="transparent"/>`; }
    return out + '</g>';
  }
  if (s.type === 'image') {
    const cr = s.crop;
    const F = fullRect(s);
    /* w trybie przycinania: pokaż CAŁY obraz (przygaszenie/ramkę rysuje overlay) */
    if (live && cropMode === s.id) {
      return `<g${did}><image x="${F.x}" y="${F.y}" width="${F.w}" height="${F.h}" href="${s.href}" preserveAspectRatio="none" opacity="0.55"/></g>`;
    }
    if (cr && (cr.l || cr.t || cr.r || cr.b)) {
      const cid = 'clip_' + s.id;
      return `<g${did}><clipPath id="${cid}"><rect x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}"/></clipPath>` +
        `<image x="${F.x}" y="${F.y}" width="${F.w}" height="${F.h}" href="${s.href}" preserveAspectRatio="none" clip-path="url(#${cid})"/>` +
        (live ? `<rect x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}" fill="transparent"/>` : '') + `</g>`;
    }
    return `<g${did}><image x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}" href="${s.href}" preserveAspectRatio="none"/></g>`;
  }
  if (s.type === 'roundRect') {
    const rx = Math.min(s.rx || 8, s.w / 2, s.h / 2);
    let out = `<g${did}><rect x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}" rx="${rx}" ry="${rx}" fill="${fill}" stroke="${stroke}" stroke-width="${s.sw}"${dash}/>`;
    if (fill === 'none' && live)
      out += `<rect x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}" rx="${rx}" ry="${rx}" fill="transparent" stroke="none"/>`;
    out += textBlockSVG(s.x + s.w / 2, s.y + s.h / 2, s.text || '', s.fs || 14, s.tc || '#111827', s.bold, vals, s.font, s.italic) + '</g>';
    return out;
  }
  if (s.type === 'poly') {
    const pts = polyPoints(s.preset, s.x, s.y, s.w, s.h);
    const ptStr = pts.map(p => `${p[0]},${p[1]}`).join(' ');
    let out = `<g${did}><polygon points="${ptStr}" fill="${fill}" stroke="${stroke}" stroke-width="${s.sw}"${dash}/>`;
    out += textBlockSVG(s.x + s.w / 2, s.y + s.h / 2, s.text || '', s.fs || 14, s.tc || '#111827', s.bold, vals, s.font, s.italic);
    if (fill === 'none' && live)
      out += `<polygon points="${ptStr}" fill="transparent" stroke="none"/>`;
    return out + '</g>';
  }
  return '';
}
function currentVals() {
  return previewRow >= 0 && state.vars.rows[previewRow]
    ? state.vars.rows[previewRow].vals : null;
}
function render() {
  const z = view.z, vals = currentVals();
  const gs = +$('#gridSize').value || 10;
  let html =
    `<defs><pattern id="gp" width="${gs}" height="${gs}" patternUnits="userSpaceOnUse">` +
    `<path d="M ${gs} 0 L 0 0 0 ${gs}" fill="none" stroke="var(--grid)" stroke-width="${1 / z}"/></pattern>` +
    `<pattern id="gp5" width="${gs * 5}" height="${gs * 5}" patternUnits="userSpaceOnUse">` +
    `<rect width="${gs * 5}" height="${gs * 5}" fill="url(#gp)"/>` +
    `<path d="M ${gs * 5} 0 L 0 0 0 ${gs * 5}" fill="none" stroke="#cdd3da" stroke-width="${1 / z}"/></pattern></defs>` +
    `<g transform="translate(${view.x},${view.y}) scale(${z})">`;
  const P = state.page;
  if (P && P.mode !== 'off') {
    html += `<rect x="-50000" y="-50000" width="100000" height="100000" fill="#dde1e6"/>` +
      `<rect x="2" y="3" width="${P.w}" height="${P.h}" fill="rgba(0,0,0,.14)"/>` +
      `<rect x="0" y="0" width="${P.w}" height="${P.h}" fill="#ffffff"/>` +
      `<rect x="0" y="0" width="${P.w}" height="${P.h}" fill="url(#gp5)" stroke="#9aa1ab" stroke-width="${1.5 / z}"/>`;
  } else {
    html += `<rect x="-50000" y="-50000" width="100000" height="100000" fill="url(#gp5)"/>`;
  }
  html += `<g id="shapes">`;
  for (const s of state.shapes) html += shapeSVG(s, vals, true);
  html += '</g><g id="ovl">' + overlaySVG() + '</g></g>';
  cv.innerHTML = html;
  $('#zoomLbl').textContent = Math.round(z * 100) + '%';
}
function cropOverlaySVG() {
  const s = state.shapes.find(a => a.id === cropMode);
  if (!s || s.type !== 'image') return '';
  const z = view.z, hw = 5 / z;
  const F = fullRect(s);
  const dim = 'rgba(0,0,0,.5)';
  let out = '';
  /* przygaszenie obszaru poza ramką przycięcia */
  out += `<rect x="${F.x}" y="${F.y}" width="${F.w}" height="${Math.max(0, s.y - F.y)}" fill="${dim}"/>`;
  out += `<rect x="${F.x}" y="${s.y + s.h}" width="${F.w}" height="${Math.max(0, F.y + F.h - (s.y + s.h))}" fill="${dim}"/>`;
  out += `<rect x="${F.x}" y="${s.y}" width="${Math.max(0, s.x - F.x)}" height="${s.h}" fill="${dim}"/>`;
  out += `<rect x="${s.x + s.w}" y="${s.y}" width="${Math.max(0, F.x + F.w - (s.x + s.w))}" height="${s.h}" fill="${dim}"/>`;
  /* ramka + uchwyty przycięcia */
  out += `<rect x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}" fill="none" stroke="#fff" stroke-width="${1.6 / z}"/>`;
  const H = [['nw', s.x, s.y], ['n', s.x + s.w / 2, s.y], ['ne', s.x + s.w, s.y], ['e', s.x + s.w, s.y + s.h / 2],
    ['se', s.x + s.w, s.y + s.h], ['s', s.x + s.w / 2, s.y + s.h], ['sw', s.x, s.y + s.h], ['w', s.x, s.y + s.h / 2]];
  for (const [k, x, y] of H)
    out += `<rect data-crop="1" data-handle="${k}" x="${x - hw}" y="${y - hw}" width="${hw * 2}" height="${hw * 2}" fill="var(--acc)" stroke="#111" stroke-width="${1 / z}"/>`;
  return `<g${rotAttr(s)}>${out}</g>`;
}
function overlaySVG() {
  if (cropMode) return cropOverlaySVG();
  const z = view.z; let out = '';
  const hw = 4 / z, hs = `width="${hw * 2}" height="${hw * 2}" fill="#fff" stroke="var(--sel)" stroke-width="${1.2 / z}"`;
  const ss = selShapes();
  const lockedSel = hasLockedSelection(ss);
  const sizeLock = hasSizeLock(ss);
  /* kontury zaznaczenia */
  for (const s of ss) {
    if (s.type === 'line') {
      out += `<line x1="${s.x1}" y1="${s.y1}" x2="${s.x2}" y2="${s.y2}" stroke="var(--sel)" stroke-width="${1 / z}" stroke-dasharray="${4 / z} ${3 / z}"/>`;
    } else {
      const b = bboxOf(s);
      const rt = s.rot ? ` transform="rotate(${s.rot} ${b.x + b.w / 2} ${b.y + b.h / 2})"` : '';
      out += `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" fill="none" stroke="var(--sel)" stroke-width="${1 / z}" stroke-dasharray="${4 / z} ${3 / z}"${rt}/>`;
    }
  }
  /* uchwyty (ukryte gdy zablokowany rozmiar/obrót) */
  if (ss.length === 1 && !sizeLock) {
    const s = ss[0];
    if (s.type === 'line') {
      out += `<circle data-handle="p1" cx="${s.x1}" cy="${s.y1}" r="${5 / z}" fill="#fff" stroke="var(--sel)" stroke-width="${1.4 / z}" style="cursor:move"/>`;
      out += `<circle data-handle="p2" cx="${s.x2}" cy="${s.y2}" r="${5 / z}" fill="#fff" stroke="var(--sel)" stroke-width="${1.4 / z}" style="cursor:move"/>`;
    } else {
      const b = bboxOf(s);
      const rt = s.rot ? ` transform="rotate(${s.rot} ${b.x + b.w / 2} ${b.y + b.h / 2})"` : '';
      let hh = '';
      if (s.type !== 'text') {
        const H = [
          ['nw', b.x, b.y, 'nwse-resize'], ['n', b.x + b.w / 2, b.y, 'ns-resize'],
          ['ne', b.x + b.w, b.y, 'nesw-resize'], ['e', b.x + b.w, b.y + b.h / 2, 'ew-resize'],
          ['se', b.x + b.w, b.y + b.h, 'nwse-resize'], ['s', b.x + b.w / 2, b.y + b.h, 'ns-resize'],
          ['sw', b.x, b.y + b.h, 'nesw-resize'], ['w', b.x, b.y + b.h / 2, 'ew-resize']];
        for (const [k, x, y, cur] of H)
          hh += `<rect data-handle="${k}" x="${x - hw}" y="${y - hw}" ${hs} style="cursor:${cur}"/>`;
      }
      /* uchwyt obrotu — nad środkiem górnej krawędzi */
      const rx = b.x + b.w / 2, ry = b.y - 26 / z;
      hh += `<line x1="${b.x + b.w / 2}" y1="${b.y}" x2="${rx}" y2="${ry}" stroke="var(--sel)" stroke-width="${1 / z}"/>`;
      hh += `<circle data-handle="rot" cx="${rx}" cy="${ry}" r="${5 / z}" fill="var(--acc)" stroke="#fff" stroke-width="${1.4 / z}" style="cursor:grab"/>`;
      out += `<g${rt}>${hh}</g>`;
    }
  } else if (ss.length > 1 && !sizeLock) {
    const b = unionBBox(ss);
    out += `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" fill="none" stroke="var(--sel)" stroke-width="${1.2 / z}"/>`;
    const H = [
      ['nw', b.x, b.y, 'nwse-resize'], ['n', b.x + b.w / 2, b.y, 'ns-resize'],
      ['ne', b.x + b.w, b.y, 'nesw-resize'], ['e', b.x + b.w, b.y + b.h / 2, 'ew-resize'],
      ['se', b.x + b.w, b.y + b.h, 'nwse-resize'], ['s', b.x + b.w / 2, b.y + b.h, 'ns-resize'],
      ['sw', b.x, b.y + b.h, 'nesw-resize'], ['w', b.x, b.y + b.h / 2, 'ew-resize']];
    for (const [k, x, y, cur] of H)
      out += `<rect data-handle="${k}" x="${x - hw}" y="${y - hw}" ${hs} style="cursor:${cur}"/>`;
  }
  /* ikona kłódki dla zablokowanego zaznaczenia */
  if (lockedSel) {
    const b = unionBBox(ss);
    if (b) {
      const lx = b.x + 8 / z, ly = b.y + 8 / z;
      out += `<g><rect x="${lx}" y="${ly + 6 / z}" width="${14 / z}" height="${10 / z}" rx="${2 / z}" fill="#fff7d6" stroke="var(--acc)" stroke-width="${1 / z}"/><path d="M ${lx + 3 / z} ${ly + 6 / z} v ${-3 / z} a ${4 / z} ${4 / z} 0 0 1 ${8 / z} 0 v ${3 / z}" fill="none" stroke="var(--acc)" stroke-width="${1 / z}" stroke-linecap="round"/></g>`;
    }
  }
  /* linie pomocnicze przyciągania */
  for (const g of guides) {
    if (g.v !== undefined)
      out += `<line x1="${g.v}" y1="-50000" x2="${g.v}" y2="50000" stroke="var(--guide)" stroke-width="${1 / z}"/>`;
    else
      out += `<line x1="-50000" y1="${g.h}" x2="50000" y2="${g.h}" stroke="var(--guide)" stroke-width="${1 / z}"/>`;
  }
  /* zaznaczanie ramką */
  if (drag && drag.mode === 'marquee') {
    const x = Math.min(drag.sx, drag.cx ?? drag.sx), y = Math.min(drag.sy, drag.cy ?? drag.sy);
    const w = Math.abs((drag.cx ?? drag.sx) - drag.sx), h = Math.abs((drag.cy ?? drag.sy) - drag.sy);
    out += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="rgba(29,127,212,.08)" stroke="var(--sel)" stroke-width="${1 / z}"/>`;
  }
  return out;
}

/* SVG samodzielny (eksport / miniatury) */
function buildSVG(shapes, vals, pad = 16, region = null) {
  let vb;
  if (region) {
    vb = { x: region.x, y: region.y, w: region.w, h: region.h };
  } else {
    const b = unionBBox(shapes);
    if (!b) return null;
    /* uwzględnij grubość linii */
    const m = pad + Math.max(0, ...shapes.map(s => (s.sw || 0)));
    vb = { x: b.x - m, y: b.y - m, w: b.w + 2 * m, h: b.h + 2 * m };
  }
  let body = '';
  for (const s of shapes) body += shapeSVG(s, vals, false);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb.x} ${vb.y} ${vb.w} ${vb.h}" width="${vb.w}" height="${vb.h}">` +
    `<rect x="${vb.x}" y="${vb.y}" width="${vb.w}" height="${vb.h}" fill="#ffffff"/>` + body + '</svg>';
  return { svg, w: vb.w, h: vb.h };
}
function svgToPngBlob(svgStr, w, h, scale = 2, mime = 'image/png') {
  return new Promise((res, rej) => {
    const img = new Image();
    const url = URL.createObjectURL(new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' }));
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(w * scale));
      c.height = Math.max(1, Math.round(h * scale));
      const g = c.getContext('2d');
      g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
      g.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      c.toBlob(b => b ? res(b) : rej(new Error('Błąd PNG')), mime,
        mime === 'image/jpeg' ? 0.92 : undefined);
    };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('Błąd renderowania SVG')); };
    img.src = url;
  });
}

/* =====================================================================
   PRZYCIĄGANIE
   ===================================================================== */
