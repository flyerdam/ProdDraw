"use strict";
/* =====================================================================
   Okno tekstowe (zamiast window.prompt).
   window.prompt() nie działa w Electron (Chromium embedder nie obsługuje
   dialogu prompt — tylko alert/confirm), więc w desktopowej wersji apki
   zwracał się cicho bez pokazania okna. Ten modal działa identycznie
   w przeglądarce i w Electron.
   ===================================================================== */
let _promptResolve = null;
function promptDialog(title, defaultValue) {
  return new Promise(resolve => {
    _promptResolve = resolve;
    $('#promptTitle').textContent = title || '';
    const inp = $('#promptInput');
    inp.value = defaultValue || '';
    $('#promptModal').classList.add('on');
    inp.focus(); inp.select();
  });
}
function _promptFinish(val) {
  $('#promptModal').classList.remove('on');
  const r = _promptResolve; _promptResolve = null;
  if (r) r(val);
}
$('#promptOk').addEventListener('click', () => _promptFinish($('#promptInput').value));
$('#promptCancel').addEventListener('click', () => _promptFinish(null));
$('#promptInput').addEventListener('keydown', e => {
  if (e.key === 'Enter') { e.preventDefault(); _promptFinish($('#promptInput').value); }
  else if (e.key === 'Escape') { e.preventDefault(); _promptFinish(null); }
});
