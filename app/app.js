import { fetchIncidents, ack } from './api.js';

const REFRESH_MS = 2000; // R4

const list = document.querySelector('[data-testid="incident-list"]');
const loader = document.querySelector('[data-testid="loader"]');
const empty = document.querySelector('[data-testid="empty"]');
const errorBox = document.getElementById('error');
const updated = document.getElementById('updated');
const panel = document.querySelector('[data-testid="incident-panel"]');
const panelAck = document.querySelector('[data-testid="panel-ack"]');

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

const incidents = new Map(); // incident id → latest data from the API
const acked = new Map(); // incident id → ackedAt; survives every refresh
const rows = new Map(); // incident id → <li>; rows are kept, never rebuilt or removed
let openId = null; // the incident the panel shows; the panel's Ack acks exactly this id
let firstLoad = true;

function cell(cls, text) {
  const span = document.createElement('span');
  span.className = cls;
  span.textContent = text; // API text goes in as text, never as HTML
  return span;
}

function buildRow(i) {
  const li = document.createElement('li');
  li.dataset.testid = 'incident-row';
  li.dataset.id = i.id;
  li.tabIndex = 0;
  li.setAttribute('role', 'button');
  const state = document.createElement('span');
  state.className = 'state';
  li.append(cell('id', i.id), cell('sev', ''), cell('what', ''), document.createElement('time'), state);
  return li;
}

// The API can change an incident between answers (openedAt, severity, summary), so every refresh rewrites the cells.
function updateRow(li, i) {
  li.classList.add('row');
  li.classList.remove('sev1', 'sev2', 'sev3', 'sev4');
  li.classList.add(i.severity);
  li.classList.toggle('is-acked', acked.has(i.id));
  li.classList.toggle('is-open', openId === i.id);
  li.setAttribute('aria-label', `Open incident ${i.id}`);
  li.querySelector('.sev').textContent = i.severity;
  li.querySelector('.what').textContent = `${i.service} · ${i.region} · ${i.summary}`;
  const time = li.querySelector('time');
  if (time.dateTime !== i.openedAt) {
    time.dateTime = i.openedAt; // full UTC value stays in the attribute
    time.title = i.openedAt;
    time.textContent = timeFmt.format(new Date(i.openedAt));
  }
  const state = li.querySelector('.state');
  if (acked.has(i.id) && !state.querySelector('[data-testid="acked"]')) {
    const mark = cell('acked', `acked ${clockFmt.format(new Date(acked.get(i.id)))}`);
    mark.dataset.testid = 'acked';
    state.replaceChildren(mark);
  }
}

function render(answer) {
  for (const i of answer) incidents.set(i.id, i);
  // R1: newest first, whatever order the API sends. An incident missing from one answer stays on the board.
  const sorted = [...incidents.values()].sort((a, b) => Date.parse(b.openedAt) - Date.parse(a.openedAt));
  let prev = null;
  for (const i of sorted) {
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
  empty.hidden = sorted.length > 0;
  renderPanel();
}

// R2 (product, after step 1): a row opens its incident panel; Ack lives in the panel, which names the incident.
function openPanel(id) {
  openId = id;
  for (const [rid, li] of rows) li.classList.toggle('is-open', rid === id);
  renderPanel();
}

function renderPanel() {
  const i = incidents.get(openId);
  panel.hidden = !i;
  if (!i) return;
  panel.dataset.id = i.id;
  panel.querySelector('.p-id').textContent = i.id;
  panel.querySelector('.p-sev').textContent = i.severity;
  panel.querySelector('.p-what').textContent = `${i.service} · ${i.region}`;
  panel.querySelector('.p-summary').textContent = i.summary;
  const t = panel.querySelector('time');
  t.dateTime = i.openedAt;
  t.textContent = `opened ${timeFmt.format(new Date(i.openedAt))}`;
  const done = panel.querySelector('.p-acked');
  if (acked.has(i.id)) {
    panelAck.hidden = true;
    done.hidden = false;
    done.textContent = `${i.id} acked ${clockFmt.format(new Date(acked.get(i.id)))}`;
  } else if (panelAck.dataset.busy !== i.id) {
    panelAck.hidden = false;
    panelAck.disabled = false;
    panelAck.textContent = `Ack ${i.id}`;
    done.hidden = true;
  }
}

list.addEventListener('click', (e) => {
  const li = e.target.closest('[data-testid="incident-row"]');
  if (li) openPanel(li.dataset.id);
});
list.addEventListener('keydown', (e) => {
  const li = e.target.closest('[data-testid="incident-row"]');
  if (li && (e.key === 'Enter' || e.key === ' ')) {
    e.preventDefault();
    openPanel(li.dataset.id);
  }
});
panel.querySelector('.p-close').addEventListener('click', () => openPanel(null));

panelAck.addEventListener('click', async () => {
  const id = panel.dataset.id; // the incident the panel names, never a position in the list
  if (!id || acked.has(id)) return;
  panelAck.disabled = true;
  panelAck.dataset.busy = id;
  panelAck.textContent = `Acking ${id}…`;
  try {
    const reply = await ack(id);
    acked.set(reply.id, reply.ackedAt);
    if (errorBox.dataset.kind === 'ack') errorBox.hidden = true;
  } catch (err) {
    showError(`Ack ${id} failed: ${err.message}`, 'ack');
  } finally {
    delete panelAck.dataset.busy;
    const li = rows.get(id);
    if (li) updateRow(li, incidents.get(id));
    renderPanel();
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
