"use strict";
function snapCandidates(excludeIds) {
  const xs = [], ys = [];
  for (const s of state.shapes) {
    if (excludeIds && excludeIds.has(s.id)) continue;
    const b = aabbOf(s);
    xs.push(b.x, b.x + b.w / 2, b.x + b.w);
    ys.push(b.y, b.y + b.h / 2, b.y + b.h);
  }
  return { xs, ys };
}
function snapPt(p, excludeIds) {
  guides = [];
  let x = p.x, y = p.y;
  const th = 7 / view.z;
  if ($('#snapG').checked) {
    const gs = +$('#gridSize').value || 10;
    x = Math.round(x / gs) * gs;
    y = Math.round(y / gs) * gs;
  }
  if ($('#snapO').checked) {
    const c = snapCandidates(excludeIds);
    let bx = null, by = null, dx = th, dy = th;
    for (const v of c.xs) if (Math.abs(v - p.x) < dx) { dx = Math.abs(v - p.x); bx = v; }
    for (const v of c.ys) if (Math.abs(v - p.y) < dy) { dy = Math.abs(v - p.y); by = v; }
    if (bx !== null) { x = bx; guides.push({ v: bx }); }
    if (by !== null) { y = by; guides.push({ h: by }); }
  }
  return { x, y };
}
/* przyciąganie przy przesuwaniu: koryguje (dx,dy) tak, by krawędzie/środki
   przesuwanego bboxa trafiały w krawędzie/środki innych kształtów lub siatkę */
function snapMove(dx, dy, b0, excludeIds) {
  guides = [];
  const th = 7 / view.z;
  const mx = [b0.x + dx, b0.x + b0.w / 2 + dx, b0.x + b0.w + dx];
  const my = [b0.y + dy, b0.y + b0.h / 2 + dy, b0.y + b0.h + dy];
  let adjX = null, adjY = null, gX = null, gY = null, bdx = th, bdy = th;
  if ($('#snapO').checked) {
    const c = snapCandidates(excludeIds);
    for (const m of mx) for (const v of c.xs) {
      const d = Math.abs(v - m);
      if (d < bdx) { bdx = d; adjX = v - m; gX = v; }
    }
    for (const m of my) for (const v of c.ys) {
      const d = Math.abs(v - m);
      if (d < bdy) { bdy = d; adjY = v - m; gY = v; }
    }
  }
  if ($('#snapG').checked) {
    const gs = +$('#gridSize').value || 10;
    if (adjX === null) { const t = Math.round(mx[0] / gs) * gs; adjX = t - mx[0]; }
    if (adjY === null) { const t = Math.round(my[0] / gs) * gs; adjY = t - my[0]; }
  }
  if (gX !== null) guides.push({ v: gX });
  if (gY !== null) guides.push({ h: gY });
  return { dx: dx + (adjX || 0), dy: dy + (adjY || 0) };
}

/* =====================================================================
   INTERAKCJE MYSZY
   ===================================================================== */
