import { fetchIncidents, ack } from './api.js';

const REFRESH_MS = 2000; // R4

const list = document.querySelector('[data-testid="incident-list"]');
const loader = document.querySelector('[data-testid="loader"]');
const empty = document.querySelector('[data-testid="empty"]');
const errorBox = document.getElementById('error');
const updated = document.getElementById('updated');

// R5: the viewer's own zone and locale order (en-GB, de-DE, en-NZ → day first; en-US → month first).
const timeFmt = new Intl.DateTimeFormat(undefined, {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZoneName: 'short',
});
const clockFmt = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });

const acked = new Map(); // incident id → ackedAt; survives every refresh
const rows = new Map(); // incident id → <li>; rows are kept, not rebuilt, so a click never lands on a moved row
let firstLoad = true;

function cell(cls, text) {
  const span = document.createElement('span');
  span.className = cls;
  span.textContent = text; // API text goes in as text, never as HTML
  return span;
}

function markAcked(li, ackedAt) {
  li.querySelector('[data-testid="ack"]')?.remove();
  if (li.querySelector('[data-testid="acked"]')) return;
  const mark = cell('acked', `acked ${clockFmt.format(new Date(ackedAt))}`);
  mark.dataset.testid = 'acked';
  li.querySelector('.action').append(mark);
  li.classList.add('is-acked');
}

function buildRow(i) {
  const li = document.createElement('li');
  li.dataset.testid = 'incident-row';
  li.dataset.id = i.id;
  li.className = `row ${i.severity}`;
  const action = document.createElement('span');
  action.className = 'action';
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.dataset.testid = 'ack';
  btn.textContent = 'Ack';
  action.append(btn);
  li.append(cell('id', i.id), cell('sev', ''), cell('what', ''), document.createElement('time'), action);
  if (acked.has(i.id)) markAcked(li, acked.get(i.id));
  return li;
}

// The API can change an incident between answers (openedAt, severity, summary), so every refresh rewrites the cells.
function updateRow(li, i) {
  li.className = `row ${i.severity}${acked.has(i.id) ? ' is-acked' : ''}${li.classList.contains('is-new') ? ' is-new' : ''}`;
  li.querySelector('.sev').textContent = i.severity;
  li.querySelector('.what').textContent = `${i.service} · ${i.region} · ${i.summary}`;
  const time = li.querySelector('time');
  if (time.dateTime !== i.openedAt) {
    time.dateTime = i.openedAt; // full UTC value stays in the attribute
    time.title = i.openedAt;
    time.textContent = timeFmt.format(new Date(i.openedAt));
  }
}

function render(incidents) {
  // R1: newest first, whatever order the API sends.
  const sorted = [...incidents].sort((a, b) => Date.parse(b.openedAt) - Date.parse(a.openedAt));
  const seen = new Set();
  let prev = null;
  for (const i of sorted) {
    seen.add(i.id);
    let li = rows.get(i.id);
    if (!li) {
      li = buildRow(i);
      rows.set(i.id, li);
      if (!firstLoad) li.classList.add('is-new');
    }
    updateRow(li, i);
    const wanted = prev ? prev.nextSibling : list.firstChild;
    if (li !== wanted) list.insertBefore(li, wanted);
    prev = li;
  }
  for (const [id, li] of rows) {
    if (!seen.has(id)) {
      li.remove();
      rows.delete(id);
    }
  }
  empty.hidden = sorted.length > 0;
}

// R2: the Ack belongs to the row it was clicked in, read from that row's data-id.
list.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-testid="ack"]');
  if (!btn) return;
  const li = btn.closest('[data-testid="incident-row"]');
  const id = li.dataset.id;
  btn.disabled = true;
  btn.textContent = 'Acking…';
  try {
    const reply = await ack(id);
    acked.set(id, reply.ackedAt);
    markAcked(li, reply.ackedAt);
    errorBox.hidden = true;
  } catch (err) {
    btn.disabled = false;
    btn.textContent = 'Ack';
    showError(`Ack ${id} failed: ${err.message}`, 'ack');
  }
});

function showError(msg, kind = 'load') {
  errorBox.dataset.kind = kind;
  errorBox.textContent = msg;
  errorBox.hidden = false;
}

// R3 + R4: loader until the first answer, then refresh every 2 s; never two requests at once.
async function tick() {
  try {
    const page = await fetchIncidents();
    render(page.incidents);
    updated.textContent = `updated ${clockFmt.format(new Date(page.updatedAt))}`;
    if (firstLoad) {
      loader.remove();
      firstLoad = false;
    }
    if (errorBox.dataset.kind === 'load') errorBox.hidden = true; // an ack error stays until the next ack
  } catch (err) {
    showError(`Could not load incidents: ${err.message}. Retrying…`);
  } finally {
    setTimeout(tick, REFRESH_MS);
  }
}

tick();
