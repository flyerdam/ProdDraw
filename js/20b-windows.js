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
   1) strefy brzegu ekranu (jak Aero Snap w Windows) — dotknięcie KURSOREM
      lewej/prawej krawędzi obszaru roboczego daje połowę szerokości, góry —
      cały obszar, rogu — ćwiartkę. Podgląd (przezroczysty prostokąt)
      pokazuje co się stanie PRZED puszczeniem.
      WAŻNE: próg liczony od pozycji KURSORA, nie krawędzi okna — okno
      przesuwane w środek ekranu, którego szerokość PRZYPADKIEM sięga
      brzegu (np. drugie okno dokowane pod pierwszym w tej samej kolumnie),
      nie ma być siłą rozciągane na pół ekranu tylko dlatego, że jego WŁASNA
      krawędź tam akurat leży — to źle rozumiane jako "okna nie chcą się do
      siebie przyciągać".
   2) magnetyczne przyciąganie do innych okien I do krawędzi obszaru
      roboczego — gdy krawędź przeciąganego/skalowanego okna zbliży się do
      krawędzi innego widocznego okna (albo do brzegu obszaru), dopasowuje
      się do niej dokładnie (bez wymuszania połowy/ćwiartki), więc łatwo
      ułożyć panele krawędź w krawędź bez szczeliny — nawet gdy nie chodzi
      o brzeg ekranu (np. drugie okno pod pierwszym, oba węższe niż pół
      ekranu). Działa też przy zmianie rozmiaru (przeciąganej krawędzi). */
const SNAP_ZONE = 22, SNAP_MAG = 18;
function workspaceRect() {
  const cw = document.getElementById('cwrap');
  const r = cw ? cw.getBoundingClientRect() : { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
  return { x: r.left, y: r.top, w: r.width, h: r.height };
}
function screenSnapZone(cursorX, cursorY) {
  const ws = workspaceRect();
  const nearL = cursorX <= ws.x + SNAP_ZONE, nearR = cursorX >= ws.x + ws.w - SNAP_ZONE;
  const nearT = cursorY <= ws.y + SNAP_ZONE, nearB = cursorY >= ws.y + ws.h - SNAP_ZONE;
  if (nearL && nearT) return { x: ws.x, y: ws.y, w: ws.w / 2, h: ws.h / 2 };
  if (nearR && nearT) return { x: ws.x + ws.w / 2, y: ws.y, w: ws.w / 2, h: ws.h / 2 };
  if (nearL && nearB) return { x: ws.x, y: ws.y + ws.h / 2, w: ws.w / 2, h: ws.h / 2 };
  if (nearR && nearB) return { x: ws.x + ws.w / 2, y: ws.y + ws.h / 2, w: ws.w / 2, h: ws.h / 2 };
  if (nearT) return { x: ws.x, y: ws.y, w: ws.w, h: ws.h };
  if (nearL) return { x: ws.x, y: ws.y, w: ws.w / 2, h: ws.h };
  if (nearR) return { x: ws.x + ws.w / 2, y: ws.y, w: ws.w / 2, h: ws.h };
  return null;
}
/* krawędzie X/Y wszystkich widocznych okien (poza selfId) + brzegów obszaru
   roboczego — wspólna pula celów magnetycznych dla przesuwania i skalowania */
function snapTargets(selfId) {
  const ws = workspaceRect();
  const xs = [ws.x, ws.x + ws.w], ys = [ws.y, ws.y + ws.h];
  for (const id of WIN_IDS) {
    if (id === selfId) continue;
    const st = winGet(id);
    if (!st.visible) continue;
    xs.push(st.x, st.x + st.w); ys.push(st.y, st.y + st.h);
  }
  return { xs, ys };
}
function nearestTarget(value, targets) {
  let best = null, bestD = SNAP_MAG + 1;
  for (const t of targets) { const d = Math.abs(value - t); if (d < bestD) { bestD = d; best = t; } }
  return best;
}
function magneticSnap(x, y, w, h, selfId) {
  const { xs, ys } = snapTargets(selfId);
  let dx = null, dy = null;
  for (const my of [x, x + w]) {
    const tgt = nearestTarget(my, xs);
    if (tgt !== null) { dx = tgt - my; break; }
  }
  for (const my of [y, y + h]) {
    const tgt = nearestTarget(my, ys);
    if (tgt !== null) { dy = tgt - my; break; }
  }
  return { dx: dx || 0, dy: dy || 0 };
}
/* przyciągnij POJEDYNCZĄ współrzędną krawędzi (używane przy skalowaniu —
   rusza się tylko jedna krawędź na raz, więc nie ma co próbować obu naraz
   jak w magneticSnap dla przesuwania) */
function snapEdgeValue(value, targets) {
  const tgt = nearestTarget(value, targets);
  return tgt === null ? value : tgt;
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
const RESIZE_DIRS = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];
const WIN_MIN_W = 220, WIN_MIN_H = 160;
/* przeciągnięcie krawędzi/rogu — kierunek decyduje którą kombinację x/y/w/h
   rusza; przeciwległa krawędź zawsze zostaje na miejscu. Krawędź, którą się
   właśnie ciągnie, przyciąga się magnetycznie do brzegu obszaru roboczego i
   do krawędzi innych okien (patrz snapEdgeValue). */
function startResize(id, el, dir, e) {
  e.preventDefault(); e.stopPropagation();
  const st = winGet(id);
  const sx = e.clientX, sy = e.clientY;
  const ox = st.x, oy = st.y, ow = st.w, oh = st.h;
  const onMove = me => {
    const dxMouse = me.clientX - sx, dyMouse = me.clientY - sy;
    let nx = ox, ny = oy, nw = ow, nh = oh;
    const { xs, ys } = snapTargets(id);
    if (dir.includes('e')) nw = Math.max(WIN_MIN_W, snapEdgeValue(ox + ow + dxMouse, xs) - ox);
    if (dir.includes('w')) { nw = Math.max(WIN_MIN_W, (ox + ow) - snapEdgeValue(ox + dxMouse, xs)); nx = (ox + ow) - nw; }
    if (dir.includes('s')) nh = Math.max(WIN_MIN_H, snapEdgeValue(oy + oh + dyMouse, ys) - oy);
    if (dir.includes('n')) { nh = Math.max(WIN_MIN_H, (oy + oh) - snapEdgeValue(oy + dyMouse, ys)); ny = (oy + oh) - nh; }
    st.x = nx; st.y = ny; st.w = nw; st.h = nh;
    el.style.left = nx + 'px'; el.style.top = ny + 'px'; el.style.width = nw + 'px'; el.style.height = nh + 'px';
  };
  const onUp = () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); winSave(); };
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
}
function initWindows() {
  WIN_IDS.forEach((id, idx) => {
    const el = document.getElementById('win-' + id);
    if (!el) return;
    winApply(id);
    const head = el.querySelector('.winHead');
    RESIZE_DIRS.forEach(dir => {
      const h = document.createElement('div');
      h.className = 'winResizeH dir-' + dir;
      h.addEventListener('pointerdown', e => startResize(id, el, dir, e));
      el.appendChild(h);
    });
    el.addEventListener('pointerdown', () => winFront(id), { capture: true });
    head.addEventListener('pointerdown', e => {
      if (e.target.closest('[data-close]')) return;
      e.preventDefault();
      const st = winGet(id);
      const sx = e.clientX, sy = e.clientY, ox = st.x, oy = st.y;
      let pendingZone = null;
      const onMove = me => {
        let c = winClampPos(ox + (me.clientX - sx), oy + (me.clientY - sy));
        const zone = screenSnapZone(me.clientX, me.clientY);
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
