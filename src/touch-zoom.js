/* ---------- zoom and two-finger gestures (shared by the workshops) ---------- */
/* One finger paints as before. A second finger turns the touch into a gesture: the stroke the first
   finger just started is taken back, and the two fingers pinch to zoom and drag to pan. */
function twoFinger(el, h) {
  const pts = new Map(); let g = null, mark = null;
  const pair = () => { const a = [...pts.values()]; if (a.length < 2) return { x:a[0].x, y:a[0].y, d:0 };
    return { x:(a[0].x + a[1].x) / 2, y:(a[0].y + a[1].y) / 2, d:Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y) }; };
  el.addEventListener('pointerdown', e => {
    if (e.pointerType !== 'touch') return;
    pts.set(e.pointerId, { x:e.clientX, y:e.clientY });
    if (pts.size === 1) { mark = h.mark ? h.mark() : null; return; }
    e.stopPropagation(); e.preventDefault();
    if (!g && h.cancel) h.cancel(mark && performance.now() - mark.t < 700 ? mark : null);
    g = pair();
  }, true);
  el.addEventListener('pointermove', e => {
    const p = pts.get(e.pointerId); if (!p) return;
    p.x = e.clientX; p.y = e.clientY;
    if (!g) return;
    e.stopPropagation(); e.preventDefault();
    const n = pair(); h.move(g.d && n.d ? n.d / g.d : 1, n.x - g.x, n.y - g.y, g); g = n;
  }, true);
  const up = e => { if (!pts.delete(e.pointerId)) return; if (g) { if (pts.size) g = pair(); else { g = null; if (h.end) h.end(); } } if (!pts.size) mark = null; };
  el.addEventListener('pointerup', up, true); el.addEventListener('pointercancel', up, true);
}
function setupMapZoom(o) {
  const box = o.box, inner = o.inner, bar = o.bar; let z = 1, settle = 0;
  const maxZ = () => (typeof o.max === 'function' ? o.max() : o.max) || 6;
  const q = s => bar && bar.querySelector(s);
  function set(nz, cx, cy, quick) {
    nz = Math.max(1, Math.min(maxZ(), nz)); if (Math.abs(nz - 1) < .02) nz = 1;
    const r = box.getBoundingClientRect();
    const px = cx == null ? box.clientWidth / 2 : cx - r.left - box.clientLeft, py = cy == null ? box.clientHeight / 2 : cy - r.top - box.clientTop;
    const ux = (box.scrollLeft + px) / z, uy = (box.scrollTop + py) / z;
    z = nz; inner.style.width = z === 1 ? '' : (z * 100).toFixed(2) + '%'; box.classList.toggle('zoomed', z > 1);
    box.scrollLeft = ux * z - px; box.scrollTop = uy * z - py;
    if (bar) { q('[data-z="out"]').disabled = z <= 1; q('[data-z="in"]').disabled = z >= maxZ() - .01; q('[data-z="fit"]').disabled = z <= 1; q('output').textContent = Math.round(z * 100) + ' %'; }
    clearTimeout(settle); settle = setTimeout(() => o.onZoomed(z), quick ? 150 : 0);
  }
  twoFinger(box, { mark:o.mark, cancel:o.cancel, move:(s, dx, dy, prev) => { set(z * s, prev.x, prev.y, true); box.scrollLeft -= dx; box.scrollTop -= dy; }, end:() => set(z) });
  box.addEventListener('wheel', e => {
    if (!(e.ctrlKey || e.metaKey)) return; e.preventDefault();
    set(z * Math.exp(-Math.max(-60, Math.min(60, e.deltaY)) * .012), e.clientX, e.clientY, true);
  }, { passive:false });
  if (bar) {
    bar.addEventListener('click', e => { const b = e.target.closest('[data-z]'); if (!b) return;
      set(b.dataset.z === 'in' ? z * 1.5 : b.dataset.z === 'out' ? z / 1.5 : 1); });
    const hint = q('.zoomhint');
    if (hint) hint.textContent = matchMedia('(pointer: coarse)').matches
      ? 'Nyp med två fingrar för att zooma. Dra med två fingrar för att flytta kartan.'
      : 'Håll Ctrl och rulla med musen för att zooma. Rulla för att flytta kartan när du har zoomat in.';
  }
  set(1);
  return { set, get z() { return z; } };
}
