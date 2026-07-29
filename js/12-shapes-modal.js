"use strict";
/* ---------- kształty dodatkowe (modal) ---------- */
const EXTRA_SHAPES = [
  { preset: 'triangle', label: 'Trójkąt' },
  { preset: 'rtTriangle', label: 'Trójkąt prostokątny' },
  { preset: 'diamond', label: 'Romb' },
  { preset: 'pentagon', label: 'Pięciokąt' },
  { preset: 'hexagon', label: 'Sześciokąt' },
  { preset: 'octagon', label: 'Ośmiokąt' },
  { preset: 'star4', label: 'Gwiazda 4' },
  { preset: 'star5', label: 'Gwiazda 5' },
  { preset: 'star6', label: 'Gwiazda 6' },
  { preset: 'cross', label: 'Krzyż' },
  { preset: 'parallelogram', label: 'Równoległobok' },
  { preset: 'trapezoid', label: 'Trapez' },
  { preset: 'chevron', label: 'Chevron' },
  { preset: 'rightArrow', label: 'Strzałka →' },
  { preset: 'leftArrow', label: 'Strzałka ←' },
  { preset: 'roundRect', label: 'Zaokrąglony prostokąt', type: 'roundRect' },
];
function openShapeModal() {
  const body = $('#shapeBody'); body.innerHTML = '';
  for (const item of EXTRA_SHAPES) {
    const div = document.createElement('div');
    div.className = 'xlImg';
    const type = item.type || 'poly';
    const prev = { id: 'prev', type, preset: item.preset, rx: 8, x: 4, y: 4, w: 92, h: 72,
      fill: '#d1e7ff', noFill: false, stroke: '#1d5fa0', noStroke: false,
      sw: 2, dash: 'solid', text: '', fs: 12, tc: '#111827', bold: false, font: 'Calibri' };
    div.innerHTML = `<div style="background:#fff;height:80px;display:flex;align-items:center;justify-content:center;overflow:hidden">
      <svg viewBox="0 0 100 80" width="100" height="80">${shapeSVG(prev, null, false)}</svg></div><div>${escXml(item.label)}</div>`;
    div.addEventListener('click', () => {
      pushUndo();
      const r = cv.getBoundingClientRect();
      const c = { x: (r.width / 2 - view.x) / view.z, y: (r.height / 2 - view.y) / view.z };
      const s = { id: uid(), type: item.type || 'poly', preset: item.preset, rx: 8,
        x: c.x - 60, y: c.y - 40, w: 120, h: 80,
        fill: '#ffffff', noFill: false, stroke: '#111827', noStroke: false,
        sw: 2, dash: 'solid', text: '', fs: 14, tc: '#111827', bold: false, font: 'Calibri', locked: false };
      state.shapes.push(s);
      setSelection([s.id]); setTool('select'); autosave();
      $('#shapeModal').classList.remove('on');
      toast(t('t.added') + item.label);
    });
    body.appendChild(div);
  }
  $('#shapeModal').classList.add('on');
}

/* =====================================================================
   WARIANTY — macierz zmiennych, generowanie zestawu PNG
   ===================================================================== */
