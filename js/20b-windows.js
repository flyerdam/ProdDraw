"use strict";
/* =====================================================================
   Pływające okna paneli bocznych (Właściwości/Biblioteka/Warianty/
   Warstwy/Ustawienia/Pomoc) — zamiast jednego paska zakładek (jeden
   widoczny panel na raz), każdy panel to osobne, przeciągalne i
   skalowalne okno. Kilka może być otwartych naraz (np. Właściwości +
   Warstwy), da się je przesunąć gdzie wygodnie, zamknąć i przywrócić
   ikoną z prawej szyny (#winRail). Pozycja/rozmiar/widoczność/kolejność
   z-order każdego okna trwają w settings.panels (localStorage), więc
   układ przetrwa przeładowanie — jak w "normalnym" oprogramowaniu z
   dokowalnymi panelami.

   Treść okien renderują te same funkcje co wcześniej (renderProps/
   renderLib/renderVars/renderLayers/renderSettings/renderHelp) — piszą
   do tych samych #tab-* divów, teraz zagnieżdżonych w .winBody zamiast
   w .tabBody, więc żadna z nich nie wymagała zmian. ===================================================================== */
const WIN_IDS = ['props', 'lib', 'vars', 'layers', 'settings', 'help'];
let winZTop = 10;
function winState() { return settings.panels || (settings.panels = {}); }
/* domyślne położenie: kaskada w prawym górnym rogu, żeby od razu było
   widać, że to osobne okna, a nie jedna sztywna kolumna jak kiedyś */
function winDefaultRect(idx) {
  const vw = Math.max(window.innerWidth, 900), vh = Math.max(window.innerHeight, 600);
  const w = 340, h = Math.min(560, vh - 150);
  return { x: Math.max(10, vw - w - 56 - (idx % 4) * 26), y: 84 + (idx % 4) * 26, w, h };
}
function winGet(id) {
  const st = winState();
  if (!st[id]) {
    const idx = WIN_IDS.indexOf(id);
    st[id] = Object.assign(winDefaultRect(idx), { visible: id === 'props' || id === 'layers', z: ++winZTop });
  }
  if (st[id].z > winZTop) winZTop = st[id].z;
  return st[id];
}
function winSave() { saveSettingsLS(); }
function winClampPos(x, y) {
  const vw = window.innerWidth, vh = window.innerHeight;
  return { x: Math.min(Math.max(x, -260), vw - 60), y: Math.min(Math.max(y, 0), vh - 40) };
}
/* ---------- przyciąganie okien (do krawędzi ekranu i do siebie nawzajem) ----------
   Dwa niezależne mechanizmy, jak w zwykłych menedżerach okien:
   1) strefy brzegu ekranu (jak Aero Snap w Windows) — dociągnięcie okna do
      lewej/prawej krawędzi obszaru roboczego daje połowę szerokości, do
      górnej — cały obszar, do rogu — ćwiartkę. Podgląd (przezroczysty
      prostokąt) pokazuje co się stanie PRZED puszczeniem, samo okno w
      trakcie przeciągania nadal jedzie za kursorem.
   2) magnetyczne przyciąganie do innych okien — gdy krawędź przeciąganego
      okna zbliży się do krawędzi innego widocznego okna, delikatnie się
      do niej dopasowuje (bez zmiany rozmiaru), więc łatwo ułożyć panele
      krawędź w krawędź bez szczeliny. */
const SNAP_ZONE = 26, SNAP_MAG = 10;
function workspaceRect() {
  const cw = document.getElementById('cwrap');
  const r = cw ? cw.getBoundingClientRect() : { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
  return { x: r.left, y: r.top, w: r.width, h: r.height };
}
function screenSnapZone(x, y, w, h) {
  const ws = workspaceRect();
  const nearL = x <= ws.x + SNAP_ZONE, nearR = (x + w) >= ws.x + ws.w - SNAP_ZONE;
  const nearT = y <= ws.y + SNAP_ZONE, nearB = (y + h) >= ws.y + ws.h - SNAP_ZONE;
  if (nearL && nearT) return { x: ws.x, y: ws.y, w: ws.w / 2, h: ws.h / 2 };
  if (nearR && nearT) return { x: ws.x + ws.w / 2, y: ws.y, w: ws.w / 2, h: ws.h / 2 };
  if (nearL && nearB) return { x: ws.x, y: ws.y + ws.h / 2, w: ws.w / 2, h: ws.h / 2 };
  if (nearR && nearB) return { x: ws.x + ws.w / 2, y: ws.y + ws.h / 2, w: ws.w / 2, h: ws.h / 2 };
  if (nearT) return { x: ws.x, y: ws.y, w: ws.w, h: ws.h };
  if (nearL) return { x: ws.x, y: ws.y, w: ws.w / 2, h: ws.h };
  if (nearR) return { x: ws.x + ws.w / 2, y: ws.y, w: ws.w / 2, h: ws.h };
  return null;
}
function magneticSnap(x, y, w, h, selfId) {
  let dx = null, dy = null;
  for (const id of WIN_IDS) {
    if (id === selfId) continue;
    const st = winGet(id);
    if (!st.visible) continue;
    if (dx === null) {
      const cx = [[x, st.x + st.w], [x + w, st.x], [x, st.x], [x + w, st.x + st.w]];
      for (const [my, target] of cx) if (Math.abs(my - target) <= SNAP_MAG) { dx = target - my; break; }
    }
    if (dy === null) {
      const cy = [[y, st.y + st.h], [y + h, st.y], [y, st.y], [y + h, st.y + st.h]];
      for (const [my, target] of cy) if (Math.abs(my - target) <= SNAP_MAG) { dy = target - my; break; }
    }
    if (dx !== null && dy !== null) break;
  }
  return { dx: dx || 0, dy: dy || 0 };
}
function winSnapPreviewEl() {
  let el = document.getElementById('winSnapPreview');
  if (!el) {
    el = document.createElement('div'); el.id = 'winSnapPreview';
    document.getElementById('floatLayer').appendChild(el);
  }
  return el;
}
function showSnapPreview(rect) {
  const el = winSnapPreviewEl();
  el.style.left = rect.x + 'px'; el.style.top = rect.y + 'px';
  el.style.width = rect.w + 'px'; el.style.height = rect.h + 'px';
  el.style.display = 'block';
}
function hideSnapPreview() { const el = document.getElementById('winSnapPreview'); if (el) el.style.display = 'none'; }
function winApply(id) {
  const el = document.getElementById('win-' + id);
  if (!el) return;
  const st = winGet(id);
  el.style.left = st.x + 'px'; el.style.top = st.y + 'px';
  el.style.width = st.w + 'px'; el.style.height = st.h + 'px';
  el.style.zIndex = st.z;
  el.classList.toggle('hidden', !st.visible);
  const btn = document.querySelector('.winRailBtn[data-win="' + id + '"]');
  if (btn) btn.classList.toggle('on', !!st.visible);
}
function winFront(id) { const st = winGet(id); st.z = ++winZTop; winApply(id); winSave(); }
function winShow(id) { const st = winGet(id); st.visible = true; st.z = ++winZTop; winApply(id); winSave(); }
function winHide(id) { const st = winGet(id); st.visible = false; winApply(id); winSave(); }
function winToggle(id) { winGet(id).visible ? winHide(id) : winShow(id); }
function initWindows() {
  WIN_IDS.forEach((id, idx) => {
    const el = document.getElementById('win-' + id);
    if (!el) return;
    winApply(id);
    const head = el.querySelector('.winHead');
    const resizeHandle = el.querySelector('.winResize');
    el.addEventListener('pointerdown', () => winFront(id), { capture: true });
    head.addEventListener('pointerdown', e => {
      if (e.target.closest('[data-close]')) return;
      e.preventDefault();
      const st = winGet(id);
      const sx = e.clientX, sy = e.clientY, ox = st.x, oy = st.y;
      let pendingZone = null;
      const onMove = me => {
        let c = winClampPos(ox + (me.clientX - sx), oy + (me.clientY - sy));
        const zone = screenSnapZone(c.x, c.y, st.w, st.h);
        if (zone) { pendingZone = zone; showSnapPreview(zone); }
        else {
          pendingZone = null; hideSnapPreview();
          const mag = magneticSnap(c.x, c.y, st.w, st.h, id);
          c = { x: c.x + mag.dx, y: c.y + mag.dy };
        }
        st.x = c.x; st.y = c.y;
        el.style.left = st.x + 'px'; el.style.top = st.y + 'px';
      };
      const onUp = () => {
        window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp);
        hideSnapPreview();
        if (pendingZone) { st.x = pendingZone.x; st.y = pendingZone.y; st.w = pendingZone.w; st.h = pendingZone.h; winApply(id); }
        winSave();
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    });
    resizeHandle.addEventListener('pointerdown', e => {
      e.preventDefault(); e.stopPropagation();
      const st = winGet(id);
      const sx = e.clientX, sy = e.clientY, ow = st.w, oh = st.h;
      const onMove = me => {
        st.w = Math.max(220, ow + (me.clientX - sx));
        st.h = Math.max(160, oh + (me.clientY - sy));
        el.style.width = st.w + 'px'; el.style.height = st.h + 'px';
      };
      const onUp = () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); winSave(); };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    });
    el.querySelector('[data-close]').addEventListener('click', () => winHide(id));
  });
  $$('.winRailBtn').forEach(b => b.addEventListener('click', () => winToggle(b.dataset.win)));
  /* okno przesunięte poza zmniejszone okno przeglądarki wraca w widoczny obszar */
  window.addEventListener('resize', () => WIN_IDS.forEach(id => {
    const st = winGet(id);
    const c = winClampPos(st.x, st.y);
    st.x = c.x; st.y = c.y; winApply(id);
  }));
}
