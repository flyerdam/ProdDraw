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
   renderLib/renderVars/renderObjects/renderSettings/renderHelp) — piszą
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
      const onMove = me => {
        const c = winClampPos(ox + (me.clientX - sx), oy + (me.clientY - sy));
        st.x = c.x; st.y = c.y;
        el.style.left = st.x + 'px'; el.style.top = st.y + 'px';
      };
      const onUp = () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); winSave(); };
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
