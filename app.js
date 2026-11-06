(() => {
'use strict';
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const CFG = Object.assign({ SHEET_CSV_URL: '', EDITABLE: false }, window.APP_CONFIG || {});
const lsGet = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } };
function toast(t) { const d = document.createElement('div'); d.className = 'toast'; d.textContent = t; document.body.appendChild(d); setTimeout(() => d.remove(), 2600); }

/* ---------- data: Google Sheet (live, shared) -> cached copy -> built-in seed ---------- */
let base = window.ASSETS_SEED.slice();
let edits = {}; try { edits = JSON.parse(lsGet('asset-tracker-edits-v1') || '{}'); } catch (e) {}
const saveEdits = () => { if (!lsSet('asset-tracker-edits-v1', JSON.stringify(edits))) toast('Storage full – edit not saved'); };
const assets = () => base.map(a => ({ ...a, ...(CFG.EDITABLE ? edits[a.id] || {} : {}) }));
const byId = id => assets().find(a => a.id === String(id).trim());
const patch = (id, o) => { edits[id] = { ...(edits[id] || {}), ...o }; saveEdits(); };

function parseCSV(t) {
  const rows = []; let r = [], f = '', q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) { if (c === '"') { if (t[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true;
    else if (c === ',') { r.push(f); f = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && t[i + 1] === '\n') i++; r.push(f); rows.push(r); r = []; f = ''; }
    else f += c;
  }
  if (f || r.length) { r.push(f); rows.push(r); }
  return rows;
}
const normStatus = s => { s = String(s || '').trim(); return s ? s[0].toUpperCase() + s.slice(1).toLowerCase() : 'Unknown'; };
function fixPicture(u) {
  u = String(u || '').trim(); if (!/^https?:\/\//i.test(u)) return '';
  const m = u.match(/drive\.google\.com\/file\/d\/([^/]+)/) || u.match(/drive\.google\.com\/(?:open|uc)\?(?:.*&)?id=([^&]+)/);
  return m ? `https://drive.google.com/thumbnail?id=${m[1]}&sz=w800` : u;
}
function fromCSV(text) {
  const rows = parseCSV(text).filter(r => r.some(c => c.trim()));
  const h = rows.shift().map(x => x.trim().toLowerCase());
  const col = (...names) => h.findIndex(x => names.some(n => x.startsWith(n)));
  const ix = { id: col('asset number', 'asset no', 'id'), name: col('item name', 'name'), desc: col('description'), cat: col('category'), st: col('status'), own: col('designated owner', 'owner'), pic: col('picture', 'photo', 'image') };
  if (ix.id < 0 || ix.name < 0) throw new Error('Sheet needs "Asset Number" and "Item Name" columns');
  const get = (r, i) => (i >= 0 ? (r[i] || '').trim() : '');
  return rows.filter(r => get(r, ix.id)).map(r => ({
    id: get(r, ix.id).replace(/\.0+$/, ''),
    name: get(r, ix.name), description: get(r, ix.desc), category: get(r, ix.cat) || 'Uncategorised',
    status: normStatus(get(r, ix.st)), owner: get(r, ix.own) || 'Unassigned', photo: fixPicture(get(r, ix.pic))
  }));
}
async function loadData(manual) {
  const btn = $('#btn-refresh'); btn.classList.add('spin');
  if (CFG.SHEET_CSV_URL) {
    try {
      const res = await fetch(CFG.SHEET_CSV_URL, { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const list = fromCSV(await res.text());
      if (!list.length) throw new Error('empty sheet');
      base = list; lsSet('asset-tracker-sheet-cache', JSON.stringify(list));
      if (manual) toast('Updated – ' + list.length + ' assets');
    } catch (e) {
      try { const c = JSON.parse(lsGet('asset-tracker-sheet-cache') || 'null'); if (c && c.length) base = c; } catch (_) {}
      toast(navigator.onLine ? 'Could not read the sheet – showing last saved data' : 'Offline – showing last saved data');
    }
  } else if (manual) toast('Using built-in data');
  btn.classList.remove('spin'); rerenderAll();
}
function rerenderAll() {
  if (!$('#view-assets').hidden) renderList();
  if (!$('#view-dash').hidden) renderDash();
  const open = $('#result .asset'); if (open) showResult(open.dataset.id, true);
}

/* ---------- placeholder pictures ---------- */
const ICONS = {
  chair: '<path d="M30 20h40v34H30zM26 54h48v10H26zM34 64v22M66 64v22" />',
  table: '<path d="M14 36h72v8H14zM24 44v38M76 44v38" />',
  computer: '<path d="M18 22h64v42H18zM42 82h16M50 64v18" />',
  box: '<path d="M20 34l30-14 30 14v34L50 82 20 68zM20 34l30 14 30-14M50 48v34" />'
};
function placeholder(a) {
  const n = a.name.toLowerCase();
  const k = n.includes('chair') ? 'chair' : n.includes('table') || n.includes('desk') ? 'table' : /comput|laptop|monitor|pc\b/.test(n) ? 'computer' : 'box';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 100"><rect width="160" height="100" fill="#d9ece9"/><g transform="translate(30 0)" fill="none" stroke="#0f766e" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round">${ICONS[k]}</g></svg>`;
  return 'data:image/svg+xml,' + encodeURIComponent(svg);
}
const pic = a => a.photo || placeholder(a);
// if a real photo URL fails to load, fall back to the placeholder
document.addEventListener('error', e => {
  const t = e.target; if (t.tagName === 'IMG' && t.dataset.id && !t.dataset.fb) { t.dataset.fb = 1; const a = byId(t.dataset.id); if (a) t.src = placeholder(a); }
}, true);
const imgTag = (a, cls, extra = '') => `<img ${cls ? `class="${cls}"` : ''} data-id="${esc(a.id)}" src="${esc(pic(a))}" alt="Picture of ${esc(a.name)}" loading="lazy" ${extra}>`;
const sCls = s => (s === 'Good' || s === 'Bad') ? s.toLowerCase() : 'other';
const pill = s => `<span class="pill ${sCls(s)}">${esc(s)}</span>`;
const SCOL = s => s === 'Good' ? 'var(--good)' : s === 'Bad' ? 'var(--bad)' : s === 'Unknown' ? 'var(--mute)' : 'var(--c2)';

/* ---------- navigation ---------- */
const TITLES = { scan: 'Scan', assets: 'Assets', dash: 'Dashboard' };
let filter = { status: null, owner: null, category: null, q: '' };
function show(tab) {
  document.querySelectorAll('.view').forEach(v => v.hidden = v.id !== 'view-' + tab);
  document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
  $('#title').textContent = TITLES[tab];
  if (tab !== 'scan') stopCam();
  if (tab === 'assets') renderList();
  if (tab === 'dash') renderDash();
  scrollTo(0, 0);
}
document.querySelectorAll('.tabs button').forEach(b => b.onclick = () => show(b.dataset.tab));
$('#btn-refresh').onclick = () => loadData(true);

/* ---------- asset card ---------- */
function cardHTML(a) {
  return `<article class="asset" data-id="${esc(a.id)}">
    ${imgTag(a, 'pic')}
    <div class="body">
      <h2>${esc(a.name)}</h2>
      <dl class="kv">
        <dt>Status</dt><dd>${pill(a.status)}</dd>
        <dt>Owner</dt><dd>${esc(a.owner)}</dd>
        <dt>Item name</dt><dd>${esc(a.name)}</dd>
        <dt>Asset no.</dt><dd>#${esc(a.id)}</dd>
        <dt>Category</dt><dd>${esc(a.category)}</dd>
        ${a.description ? `<dt>Notes</dt><dd>${esc(a.description)}</dd>` : ''}
      </dl>
      ${CFG.EDITABLE ? `<div class="actions">
        <button class="btn" data-act="status">Mark as ${a.status === 'Good' ? 'Bad' : 'Good'}</button>
        <button class="btn" data-act="owner">Change owner</button>
        <label class="btn">Add photo<input type="file" accept="image/*" capture="environment" hidden data-act="photo"></label>
      </div><p class="note">Edits are saved on this phone only.</p>` : ''}
    </div>
  </article>`;
}
function bindCard(root, rerender) {
  root.querySelectorAll('[data-act]').forEach(el => {
    const id = el.closest('.asset').dataset.id;
    if (el.dataset.act === 'photo') el.onchange = async () => { if (el.files[0]) { patch(id, { photo: await shrink(el.files[0]) }); rerender(id); } };
    else el.onclick = () => {
      const a = byId(id);
      if (el.dataset.act === 'status') { patch(id, { status: a.status === 'Good' ? 'Bad' : 'Good' }); rerender(id); }
      if (el.dataset.act === 'owner') {
        const v = prompt('New owner for ' + a.name, a.owner);
        if (v && v.trim()) { patch(id, { owner: v.trim() }); rerender(id); }
      }
    };
  });
}
function shrink(file) {
  return new Promise((res, rej) => {
    const img = new Image(); img.onload = () => {
      const s = Math.min(1, 640 / Math.max(img.width, img.height)), c = document.createElement('canvas');
      c.width = img.width * s; c.height = img.height * s; c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src); res(c.toDataURL('image/jpeg', .72));
    }; img.onerror = rej; img.src = URL.createObjectURL(file);
  });
}

/* ---------- scan result ---------- */
function findAsset(raw) {
  const text = String(raw).trim();
  const safe = s => { try { return decodeURIComponent(s); } catch (e) { return s; } };
  const cands = [text, (text.match(/[?&#](?:id|text|asset)=([^&]+)/i) || [])[1], (text.match(/(\d+)\s*$/) || [])[1]].filter(Boolean).map(safe);
  for (const c of cands) { const a = byId(c) || assets().find(x => x.name.toLowerCase() === c.toLowerCase()); if (a) return a; }
  return null;
}
function showResult(raw, quiet) {
  const box = $('#result'), a = findAsset(raw);
  if (!a) { box.innerHTML = `<div class="notfound">No asset found for “${esc(String(raw).trim())}”.</div>`; return; }
  box.innerHTML = cardHTML(a); bindCard(box, id => showResult(id, true));
  if (!quiet) { if (navigator.vibrate) navigator.vibrate(60); box.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
}

/* ---------- camera + QR decoding ---------- */
const video = $('#video'), msg = $('#scanmsg');
let stream = null, running = false, decode = null, lastText = '', lastAt = 0;
function loadJsQR() {
  return new Promise((res, rej) => {
    if (window.jsQR) return res(window.jsQR);
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js';
    s.onload = () => res(window.jsQR); s.onerror = () => rej(new Error('offline')); document.head.appendChild(s);
  });
}
async function makeDecoder() {
  if ('BarcodeDetector' in window) {
    try { const d = new BarcodeDetector({ formats: ['qr_code'] }); return async src => { const r = await d.detect(src); return r[0] && r[0].rawValue; }; } catch (e) {}
  }
  const jsQR = await loadJsQR();
  const c = document.createElement('canvas'), x = c.getContext('2d', { willReadFrequently: true });
  return async src => {
    const w = src.videoWidth || src.naturalWidth || src.width, h = src.videoHeight || src.naturalHeight || src.height;
    if (!w) return null; const k = Math.min(1, 800 / Math.max(w, h)); c.width = w * k; c.height = h * k;
    x.drawImage(src, 0, 0, c.width, c.height);
    const d = x.getImageData(0, 0, c.width, c.height), r = jsQR(d.data, d.width, d.height);
    return r && r.data;
  };
}
async function startCam() {
  try {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('nocam');
    msg.textContent = 'Starting camera…';
    decode = decode || await makeDecoder();
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
    video.srcObject = stream; await video.play(); running = true;
    $('#btn-cam').textContent = 'Stop scanning'; msg.textContent = 'Point at an asset QR code';
    loop();
  } catch (e) {
    msg.textContent = e.message === 'offline' ? 'Scanner needs internet once – use “Scan from photo” or type the number.'
      : e.name === 'NotAllowedError' ? 'Camera permission denied – allow it in your browser settings.'
      : 'Camera unavailable. You can type the asset number instead.';
    stopCam(true);
  }
}
function stopCam(keepMsg) {
  running = false; if (stream) stream.getTracks().forEach(t => t.stop()); stream = null; video.srcObject = null;
  $('#btn-cam').textContent = 'Start scanning'; if (!keepMsg) msg.textContent = 'Camera is off';
}
async function loop() {
  if (!running) return;
  try {
    const t = await decode(video);
    if (t && (t !== lastText || Date.now() - lastAt > 3000)) { lastText = t; lastAt = Date.now(); showResult(t); msg.textContent = findAsset(t) ? 'Scanned ✓' : 'Unknown code'; }
  } catch (e) {}
  setTimeout(() => requestAnimationFrame(loop), 150);
}
document.addEventListener('visibilitychange', () => { if (document.hidden) stopCam(); });
$('#btn-cam').onclick = () => running ? stopCam() : startCam();
$('#file-qr').onchange = async e => {
  const f = e.target.files[0]; if (!f) return;
  try {
    decode = decode || await makeDecoder();
    const img = new Image(); img.src = URL.createObjectURL(f); await img.decode();
    const t = await decode(img); t ? showResult(t) : ($('#result').innerHTML = '<div class="notfound">No QR code found in that photo.</div>');
  } catch (err) { $('#result').innerHTML = '<div class="notfound">Could not read that photo (the scanner may need internet once).</div>'; }
  e.target.value = '';
};
$('#manual').onsubmit = e => { e.preventDefault(); const v = $('#manual-id').value; if (v.trim()) showResult(v); };

/* ---------- asset list ---------- */
const uniq = k => [...new Set(assets().map(x => x[k]))].sort();
function renderChips() {
  const opts = [['All', null, null]].concat(...['status', 'owner', 'category'].map(k => uniq(k).map(v => [v, k, v])));
  $('#chips').innerHTML = opts.map(([l, k, v]) => {
    const on = k ? filter[k] === v : !filter.status && !filter.owner && !filter.category;
    return `<button class="chip ${on ? 'on' : ''}" data-k="${k || ''}" data-v="${esc(v || '')}">${esc(l)}</button>`;
  }).join('');
  $('#chips').querySelectorAll('.chip').forEach(c => c.onclick = () => {
    const k = c.dataset.k;
    if (!k) filter = { status: null, owner: null, category: null, q: filter.q };
    else filter[k] = filter[k] === c.dataset.v ? null : c.dataset.v;
    renderList();
  });
}
function renderList() {
  renderChips(); if ($('#q').value !== filter.q) $('#q').value = filter.q;
  const q = filter.q.toLowerCase();
  const rows = assets().filter(a => (!filter.status || a.status === filter.status) && (!filter.owner || a.owner === filter.owner) && (!filter.category || a.category === filter.category)
    && (!q || [a.id, a.name, a.owner, a.status, a.category].join(' ').toLowerCase().includes(q)));
  $('#list').innerHTML = rows.length ? rows.map(a => `<button class="item" data-id="${esc(a.id)}">${imgTag(a, '', 'width="56" height="56"')}<div class="t"><b>${esc(a.name)}</b><span>#${esc(a.id)} · ${esc(a.owner)}</span></div>${pill(a.status)}</button>`).join('') : '<div class="empty">No assets match.</div>';
  $('#list').querySelectorAll('.item').forEach(i => i.onclick = () => openSheet(i.dataset.id));
}
$('#q').oninput = e => { filter.q = e.target.value; renderList(); };

function openSheet(id) {
  const a = byId(id); if (!a) return;
  $('#sheet-content').innerHTML = cardHTML(a); bindCard($('#sheet-content'), id => { openSheet(id); rerenderAll(); });
  $('#sheet').hidden = false;
}
$('#sheet-close').onclick = $('.sheet-bg').onclick = () => $('#sheet').hidden = true;

/* ---------- dashboard ---------- */
function go(k, v) { filter = { status: null, owner: null, category: null, q: '' }; if (k) filter[k] = v; show('assets'); }
function renderDash() {
  const a = assets(), n = a.length, statuses = uniq('status').sort((x, y) => (x === 'Good' ? -1 : y === 'Good' ? 1 : x.localeCompare(y)));
  const cnt = s => a.filter(x => x.status === s).length;
  const group = k => uniq(k).map(v => { const rows = a.filter(x => x[k] === v); return { v, total: rows.length, by: statuses.map(s => rows.filter(x => x.status === s).length) }; });
  const bars = k => { const g = group(k), max = Math.max(1, ...g.map(x => x.total));
    return g.map(x => `<button class="bar" data-k="${k}" data-v="${esc(x.v)}"><span>${esc(x.v)}</span><div class="track" style="width:${x.total / max * 100}%">${x.by.map((c, i) => c ? `<span style="width:${c / x.total * 100}%;background:${SCOL(statuses[i])}"></span>` : '').join('')}</div><em>${x.total}</em></button>`).join(''); };
  const R = 46, C = 2 * Math.PI * R; let off = 0;
  const segs = statuses.map(s => { const len = n ? cnt(s) / n * C : 0, el = `<circle cx="62" cy="62" r="${R}" stroke="${SCOL(s)}" stroke-dasharray="${len} ${C - len}" stroke-dashoffset="${-off}"/>`; off += len; return el; }).join('');
  const good = cnt('Good');
  const donut = `<svg width="124" height="124" viewBox="0 0 124 124" role="img" aria-label="${statuses.map(s => cnt(s) + ' ' + s).join(', ')}"><g transform="rotate(-90 62 62)" fill="none" stroke-width="16"><circle cx="62" cy="62" r="${R}" stroke="var(--line)"/>${segs}</g><text x="62" y="60" text-anchor="middle" font-size="26" font-weight="700" fill="currentColor">${n ? Math.round(good / n * 100) : 0}%</text><text x="62" y="78" text-anchor="middle" font-size="11" fill="var(--mute)">good</text></svg>`;
  const attn = a.filter(x => x.status !== 'Good');
  $('#view-dash').innerHTML = `
    <div class="kpis">
      <button class="kpi" data-k=""><small>Total assets</small><b>${n}</b></button>
      <button class="kpi good" data-k="status" data-v="Good"><small>Good</small><b>${good}</b></button>
      <button class="kpi bad" data-k="status" data-v="Bad"><small>Bad / needs repair</small><b>${cnt('Bad')}</b></button>
      <button class="kpi" data-k=""><small>Owners</small><b>${uniq('owner').length}</b></button>
    </div>
    <div class="panel"><h3>Status</h3><div class="donutwrap">${donut}<div class="legend">${statuses.map(s => `<div><i style="background:${SCOL(s)}"></i>${esc(s)} · ${cnt(s)}</div>`).join('')}</div></div></div>
    <div class="panel"><h3>By owner</h3>${bars('owner')}</div>
    <div class="panel"><h3>By category</h3>${bars('category')}</div>
    <div class="panel"><h3>Needs attention (${attn.length})</h3>${attn.length ? attn.map(x => `<button class="attn" data-id="${esc(x.id)}">${imgTag(x, '', 'style="width:44px;height:44px;border-radius:10px;object-fit:cover"')}<span style="flex:1"><b>${esc(x.name)}</b><br><small style="color:var(--mute)">${esc(x.owner)}</small></span>${pill(x.status)}</button>`).join('') : '<div class="empty">Everything is in good shape 🎉</div>'}</div>`;
  const v = $('#view-dash');
  v.querySelectorAll('.kpi').forEach(b => b.onclick = () => go(b.dataset.k || null, b.dataset.v));
  v.querySelectorAll('.bar').forEach(b => b.onclick = () => go(b.dataset.k, b.dataset.v));
  v.querySelectorAll('.attn').forEach(b => b.onclick = () => openSheet(b.dataset.id));
}

/* ---------- install prompt + PWA plumbing ---------- */
let deferred = null;
const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
const dismissed = () => lsGet('install-dismissed') === '1';
addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e; if (!standalone && !dismissed()) $('#install').hidden = false; });
addEventListener('appinstalled', () => { $('#install').hidden = true; });
$('#install-btn').onclick = async () => { if (deferred) { deferred.prompt(); await deferred.userChoice; deferred = null; $('#install').hidden = true; } else $('#install').hidden = true; };
$('#install-x').onclick = () => { lsSet('install-dismissed', '1'); $('#install').hidden = true; };
if (!standalone && /iphone|ipad|ipod/i.test(navigator.userAgent) && !dismissed()) { // iOS has no install prompt
  $('#install-text').innerHTML = 'To install: tap <b>Share</b> then <b>Add to Home Screen</b>'; $('#install-btn').hidden = true; $('#install').hidden = false;
}
const net = () => $('#net').hidden = navigator.onLine; addEventListener('online', () => { net(); loadData(); }); addEventListener('offline', net); net();
if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
show('scan');
loadData();
})();
