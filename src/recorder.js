/* ---------- recording: live film and timelapse of the map next to the 3D figure ---------- */
/* The film is drawn on its own 1280x720 canvas: the name on top, the map on the left and the 3D figure on the right.
   Every change to the picture is kept as a snapshot, so a timelapse can replay the painting from the start. */
function setupRecorder(h) {
  const W = 1280, H = 720, MAX_SNAPS = 900;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const c = cv.getContext('2d');
  const FD = '"Pixelify Sans", ui-monospace, monospace', FB = '"Atkinson Hyperlegible", "Segoe UI", system-ui, sans-serif';
  const snaps = []; let key = null, lastSnap = 0, trail = 0, playing = false;
  let rec = null, chunks = [], micStream = null, t0 = 0, raf = 0, kind = 'live', progress = null, pill = null, lock = null;
  const btn = $('#recBtn'), lapseBtn = $('#lapseBtn'), mic = $('#recMic'), clock = $('#recTime');

  const same = (a, b) => { if (a.length !== b.length) return false; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false; return true; };
  function snap() {
    const k = h.key(); if (k !== key) { snaps.length = 0; key = k; }
    const p = h.getPix(), last = snaps[snaps.length - 1];
    if (last && same(last, p)) return;
    snaps.push(new Uint8ClampedArray(p));
    if (snaps.length > MAX_SNAPS) { const keep = snaps.filter((s, i) => i % 2 === 0 || i === snaps.length - 1); snaps.length = 0; snaps.push(...keep); }
  }
  function changed() {
    if (playing) return;
    const now = performance.now(); clearTimeout(trail);
    if (now - lastSnap > 110) { lastSnap = now; snap(); }
    trail = setTimeout(() => { lastSnap = performance.now(); snap(); }, 160);
  }

  function rrect(x, y, w, hh, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + hh, r); c.arcTo(x + w, y + hh, x, y + hh, r); c.arcTo(x, y + hh, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
  let checker = null;
  function checkerPattern() {
    if (checker) return checker;
    const t = document.createElement('canvas'); t.width = t.height = 36; const x = t.getContext('2d');
    x.fillStyle = '#2C2835'; x.fillRect(0, 0, 36, 36); x.fillStyle = '#23202B'; x.fillRect(0, 0, 18, 18); x.fillRect(18, 18, 18, 18);
    return (checker = c.createPattern(t, 'repeat'));
  }
  function draw() {
    c.fillStyle = '#15121D'; c.fillRect(0, 0, W, H);
    c.textBaseline = 'alphabetic'; c.textAlign = 'left';
    c.fillStyle = '#F2EFF8'; c.font = `600 38px ${FD}`; c.fillText(h.name(), 48, 66, 760);
    c.fillStyle = '#A9A3B6'; c.font = `500 20px ${FB}`; c.fillText(h.title, 48, 96);
    c.textAlign = 'right'; c.fillStyle = '#B49DFF'; c.font = `600 22px ${FD}`; c.fillText('Verkstan', W - 48, 66);
    c.textAlign = 'left';
    const S = 568, mx = 48, my = 124;
    c.save(); rrect(mx, my, S, S, 10); c.clip(); c.fillStyle = checkerPattern(); c.fillRect(mx, my, S, S);
    c.imageSmoothingEnabled = false; c.drawImage(h.paint, mx, my, S, S);
    c.imageSmoothingEnabled = true; if (h.ov.width) c.drawImage(h.ov, mx, my, S, S);
    c.restore();
    const gx = 648, gy = 124, gw = 584, gh = 568;
    c.fillStyle = '#221E2B'; rrect(gx, gy, gw, gh, 10); c.fill();
    const g = h.gl();
    if (g && g.width && g.height) { const r = Math.min(gw / g.width, gh / g.height), w = g.width * r, hh = g.height * r; c.drawImage(g, gx + (gw - w) / 2, gy + (gh - hh) / 2, w, hh); }
    if (progress != null) { c.fillStyle = '#2E2647'; c.fillRect(48, H - 14, W - 96, 4); c.fillStyle = '#B49DFF'; c.fillRect(48, H - 14, (W - 96) * progress, 4); }
  }
  function loop() { raf = requestAnimationFrame(loop); draw(); tick(); }
  const fmt = ms => { const s = Math.floor(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
  function tick() {
    const tx = '● ' + fmt(performance.now() - t0);
    if (clock) { clock.hidden = kind !== 'live'; clock.textContent = tx; }
    if (pill) pill.querySelector('span').textContent = tx;
  }
  function mime() {
    if (!window.MediaRecorder) return null;
    for (const m of ['video/mp4;codecs=avc1.42E01E', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']) if (MediaRecorder.isTypeSupported(m)) return m;
    return '';
  }
  function ui() {
    const on = !!rec;
    btn.textContent = on && kind === 'live' ? 'Stoppa och spara' : 'Spela in';
    btn.classList.toggle('on', on && kind === 'live');
    btn.disabled = on && kind !== 'live'; lapseBtn.disabled = on; mic.disabled = on;
    if (clock) clock.hidden = !(on && kind === 'live');
    if (on && kind === 'live' && !pill) {
      pill = document.createElement('button'); pill.type = 'button'; pill.className = 'recpill';
      pill.innerHTML = '<span>● 0:00</span><b>Stoppa</b>'; pill.addEventListener('click', stop); document.body.append(pill);
    } else if (!(on && kind === 'live') && pill) { pill.remove(); pill = null; }
  }
  async function start(k) {
    const type = mime();
    if (type === null || !cv.captureStream) { h.msg('Den här webbläsaren kan inte spela in film. Prova Chrome, Edge eller Safari.'); return false; }
    kind = k; const stream = cv.captureStream(30);
    if (k === 'live' && mic.checked) {
      try { micStream = await navigator.mediaDevices.getUserMedia({ audio:true }); micStream.getAudioTracks().forEach(t => stream.addTrack(t)); }
      catch (e) { micStream = null; h.msg('Mikrofonen fick inte användas, så filmen spelas in utan ljud.'); }
    }
    try { rec = new MediaRecorder(stream, type ? { mimeType:type, videoBitsPerSecond:6000000 } : { videoBitsPerSecond:6000000 }); }
    catch (e) { rec = null; h.msg('Det gick inte att starta inspelningen i den här webbläsaren.'); return false; }
    chunks = [];
    const name = h.name(), lapse = k === 'lapse', used = rec.mimeType || type || 'video/webm';
    rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
    rec.onstop = () => {
      const ext = /mp4/.test(used) ? 'mp4' : 'webm';
      const blob = new Blob(chunks, { type:used.split(';')[0] }); chunks = []; rec = null; progress = null; ui();
      const base = (name.replace(/[^\p{L}\p{N}_-]+/gu, '-').replace(/^-+|-+$/g, '') || 'film') + (lapse ? '-timelapse' : '');
      if (blob.size) h.save(blob, `${base}.${ext}`); else h.msg('Filmen blev tom. Försök igen.');
    };
    draw(); rec.start(1000); t0 = performance.now(); cancelAnimationFrame(raf); loop(); ui();
    return true;
  }
  function stop() {
    if (!rec) return;
    cancelAnimationFrame(raf); raf = 0; draw();
    try { rec.requestData(); } catch (e) {}
    rec.stop();
    if (micStream) { micStream.getTracks().forEach(t => t.stop()); micStream = null; }
  }
  const frames = n => new Promise(r => { let i = 0; const f = () => (++i >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); });
  async function timelapse() {
    clearTimeout(trail); snap();
    if (h.key() !== key || snaps.length < 2) { h.msg('Måla lite först. Timelapsen visar allt som har målats sedan ni öppnade det här.'); return; }
    const list = snaps.slice(), original = new Uint8ClampedArray(h.getPix());
    lock = document.createElement('div'); lock.className = 'reclock';
    lock.innerHTML = '<div role="status"><span>Gör timelapse …</span><progress max="1" value="0"></progress><small>Vänta tills filmen är sparad.</small></div>';
    document.body.append(lock);
    playing = true;
    h.setPix(list[0]); h.refresh(); await frames(2);
    if (!(await start('lapse'))) { h.setPix(original); h.refresh(); playing = false; lock.remove(); return; }
    const total = Math.max(4, Math.min(20, list.length / 12)) * 1000, bar = lock.querySelector('progress');
    const wait = ms => new Promise(r => setTimeout(r, ms));
    await wait(400);
    let shown = 0; const s0 = performance.now();
    while (shown < list.length - 1) {
      await frames(1);
      const i = Math.min(list.length - 1, Math.floor((performance.now() - s0) / total * list.length));
      if (i > shown) { shown = i; h.setPix(list[i]); h.refresh(); progress = i / (list.length - 1); bar.value = progress * .85; }
    }
    const s1 = performance.now(); let last = s1;
    while (performance.now() - s1 < 2600) { await frames(1); const now = performance.now(); h.spin((now - last) / 16.7); last = now; bar.value = .85 + .15 * (now - s1) / 2600; }
    stop();
    h.setPix(original); h.refresh(); playing = false;
    lock.remove(); lock = null;
  }
  btn.addEventListener('click', () => { if (rec && kind === 'live') stop(); else if (!rec) start('live').then(ok => { if (ok) h.msg('Inspelningen är igång. Tryck på Stoppa när ni är klara, så sparas filmen.'); }); });
  lapseBtn.addEventListener('click', () => { if (!rec) timelapse(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && rec && kind === 'live') stop(); });
  snap();
  return { changed, get playing() { return playing; } };
}
