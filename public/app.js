// NOAI Hybrid: route by sensitivity, not by capability.
// 1. Rules on the device hide structured identifiers and known names (NOAI redactor).
// 2. Gemini Nano on the device (Firebase AI Logic, ONLY_ON_DEVICE) reads what is left
//    and finds the names and details the rules missed. The raw text never leaves.
// 3. A leak gate checks that no hidden value is in the outgoing text.
// 4. The cloud model (Firebase AI Logic, PREFER_IN_CLOUD) does the heavy writing on
//    placeholders only. Offline, the same call falls back to Gemini Nano.
// 5. The real values are put back on the device.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/13.4.0/firebase-app.js';
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'https://www.gstatic.com/firebasejs/13.4.0/firebase-app-check.js';
import { getAI, getGenerativeModel, GoogleAIBackend, InferenceMode } from 'https://www.gstatic.com/firebasejs/13.4.0/firebase-ai.js';
import { redact } from './lib/redact.js';
import { firebaseConfig, appCheckSiteKey, cloudModelName } from './config.js';
import { SAMPLES } from './samples.js';

const $ = (s) => document.querySelector(s);
const cloudConfigured = Boolean(firebaseConfig.apiKey);

// ---------------------------------------------------------------- Firebase
const app = initializeApp(cloudConfigured ? firebaseConfig : { apiKey: 'on-device-only', projectId: 'on-device-only', appId: 'on-device-only' });
if (cloudConfigured && appCheckSiteKey) {
  if (['localhost', '127.0.0.1'].includes(location.hostname)) self.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
  initializeAppCheck(app, { provider: new ReCaptchaEnterpriseProvider(appCheckSiteKey), isTokenAutoRefreshEnabled: true });
}
const ai = getAI(app, { backend: new GoogleAIBackend() });

const LANG = { createOptions: { expectedInputs: [{ type: 'text', languages: ['en'] }], expectedOutputs: [{ type: 'text', languages: ['en'] }] } };

const FIND_SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: { text: { type: 'string' }, kind: { type: 'string', enum: ['PERSON', 'COMPANY', 'ADDRESS', 'REFERENCE'] } },
        required: ['text', 'kind'],
      },
    },
  },
  required: ['items'],
};

// The finder only ever runs on the device: it reads the private text.
const finder = getGenerativeModel(ai, {
  mode: InferenceMode.ONLY_ON_DEVICE,
  onDeviceParams: { ...LANG, promptOptions: { responseConstraint: FIND_SCHEMA } },
});

// The writer prefers the cloud and falls back to Gemini Nano when the cloud cannot be reached.
function writerModel(forceDevice) {
  return getGenerativeModel(ai, {
    mode: forceDevice || !cloudConfigured ? InferenceMode.ONLY_ON_DEVICE : InferenceMode.PREFER_IN_CLOUD,
    inCloudParams: { model: cloudModelName },
    onDeviceParams: LANG,
  });
}

// ---------------------------------------------------------------- state
let state = null; // { outgoing, entries: [{ph, value, kind, by, on}], sources: {} }

const TASKS = {
  reply: 'Draft a short, professional reply to this message on behalf of the recipient.',
  summary: 'Summarise this in at most 5 bullet points.',
  obligations: 'List every obligation, deadline and amount in this text as a short checklist: who must do what, by when.',
};

const RULES = `Placeholders in square brackets, like [PERSON_1] or [COMPANY_2], stand for private values that were hidden on the sender's device. Keep every placeholder exactly as written, brackets included, wherever you refer to that value. Never guess, invent or ask for the hidden values.`;

// ---------------------------------------------------------------- device status
async function deviceStatus() {
  if (typeof LanguageModel === 'undefined') return 'unavailable';
  try { return await LanguageModel.availability(LANG.createOptions); } catch { return 'unavailable'; }
}

async function showStatus() {
  const s = await deviceStatus();
  const el = $('#nano');
  el.dataset.state = s;
  el.textContent = { available: 'Gemini Nano ready on this device', downloadable: 'Gemini Nano: downloads on first use', downloading: 'Gemini Nano downloading', unavailable: 'Gemini Nano not available in this browser' }[s] ?? s;
  $('#cloud').dataset.state = cloudConfigured ? 'available' : 'unavailable';
  $('#cloud').textContent = cloudConfigured ? `Cloud: ${cloudModelName} via Firebase AI Logic` : 'Cloud not configured: on-device only';
  return s;
}

// ---------------------------------------------------------------- step 1 + 2: hide on the device
const TITLE = /^(dr|mr|mrs|ms|miss|prof|eng|sir|sheikh|dr\.)\.?$/i;
const REF = /(?<![\p{L}\p{N}[_-])(?=[A-Z0-9-]*\d)(?=[A-Z0-9-]*[A-Z])[A-Z0-9]{2,}(?:-[A-Z0-9]+)+(?![\p{L}\p{N}\]_-])/gu;
const STOP = new Set(['i', 'you', 'we', 'he', 'she', 'they', 'hr', 'it', 'the', 'team', 'client', 'company', 'manager', 'doctor', 'patient', 'sir', 'madam']);

async function hide() {
  const raw = $('#raw').value.trim();
  if (!raw) return;
  setBusy('#hide', true);
  const t0 = performance.now();
  try {
    // Step 1: rules (structured identifiers, known names, companies with a legal suffix).
    const r = redact(raw);
    let entries = [...r.map.entries()].map(([ph, value]) => ({ ph, value, kind: ph.slice(1).split('_')[0], by: 'rules', on: true }));
    let text = r.text;
    // A title on its own ("Dr") is not a person: put it back.
    for (const e of entries.filter((x) => TITLE.test(x.value))) text = text.split(e.ph).join(e.value);
    entries = entries.filter((x) => !TITLE.test(x.value));
    // File, case and contract references such as HR-2291-K or RFC-008812.
    let nRef = 0;
    text = text.replace(REF, (m) => {
      const known = entries.find((e) => e.value === m);
      if (known) return known.ph;
      const ph = `[REF_${++nRef}]`;
      entries.push({ ph, value: m, kind: 'REF', by: 'rules', on: true });
      return ph;
    });
    const tRules = performance.now() - t0;

    // Step 2: Gemini Nano on the device reads what is left.
    let nanoNote = '';
    const status = await deviceStatus();
    if (status === 'unavailable') {
      nanoNote = 'Gemini Nano is not available here, so only the rules ran. Check the outgoing text before sending.';
    } else {
      $('#working').textContent = 'Gemini Nano is reading the text on this device…';
      if (status !== 'available') await finder.initializeDeviceModel((p) => { $('#nano').textContent = `Downloading Gemini Nano ${Math.round(p * 100)}%`; });
      const prompt = `You protect privacy. In the text below some private values are already replaced by placeholders such as [PERSON_1]. Find every remaining piece of text that identifies a real person or organisation: personal names (also a first name on its own, like "Grace" or "Lina"), company, hospital, bank or organisation names, street addresses, and account, case, file, policy or contract reference numbers. Copy each exactly as it is written in the text. Do not list placeholders, job titles, cities, countries, dates, amounts or common words. If there are none, return an empty list.\n\nTEXT:\n${text}`;
      const res = await finder.generateContent(prompt);
      let found = [];
      try { found = JSON.parse(res.response.text()).items ?? []; } catch { found = []; }
      const counts = {};
      for (const e of entries) counts[e.kind] = Math.max(counts[e.kind] ?? 0, Number(e.ph.match(/_(\d+)\]/)[1]));
      // Longest first, so "Grace Mendes" is hidden before "Grace".
      found.sort((a, b) => (b.text?.length ?? 0) - (a.text?.length ?? 0));
      for (const f of found) {
        const v = String(f.text ?? '').trim();
        if (v.length < 2 || /\[[A-Z]+_\d+\]/.test(v) || STOP.has(v.toLowerCase()) || TITLE.test(v)) continue;
        // A one-word "address" is a city or a country: public, and the answer needs it.
        if (f.kind === 'ADDRESS' && !/\s/.test(v)) continue;
        const re = new RegExp(`(?<![\\p{L}\\p{N}])${v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\p{N}])`, 'gu');
        if (!re.test(text)) continue; // the model must quote the text, not invent
        const kind = f.kind === 'ADDRESS' ? 'ADDRESS' : f.kind === 'REFERENCE' ? 'REF' : f.kind === 'COMPANY' ? 'COMPANY' : 'PERSON';
        counts[kind] = (counts[kind] ?? 0) + 1;
        const ph = `[${kind}_${counts[kind]}]`;
        text = text.replace(re, ph);
        entries.push({ ph, value: v, kind, by: 'Gemini Nano', on: true });
      }
      nanoNote = `Gemini Nano (${res.response.inferenceSource === 'on_device' ? 'on device' : res.response.inferenceSource}) found ${entries.filter((e) => e.by === 'Gemini Nano').length} more.`;
    }
    $('#working').textContent = '';
    state = { raw, base: text, entries, timings: { rules: tRules, total: performance.now() - t0 }, nanoNote };
    render();
  } catch (e) {
    showError(e);
  } finally {
    setBusy('#hide', false);
  }
}

// The outgoing text, built from the raw text with the values the owner kept hidden.
function outgoing() {
  // Start from the fully hidden text and put back only what the owner chose to send.
  const on = state.entries.filter((e) => e.on);
  let text = state.base;
  for (const e of state.entries.filter((x) => !x.on)) text = text.split(e.ph).join(e.value);
  return { text, on };
}

function leaks(text, on) {
  const low = text.toLowerCase();
  return on.filter((e) => low.includes(e.value.toLowerCase()));
}

// ---------------------------------------------------------------- render
function esc(s) { return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
const PH = /\[([A-Z]+)_(\d+)\]/g;

function render() {
  const { text, on } = outgoing();
  $('#out').innerHTML = esc(text).replace(PH, '<mark class="ph">$&</mark>');
  $('#chips').innerHTML = state.entries.map((e, i) => `<button class="chip ${e.on ? 'on' : 'off'} by-${e.by === 'rules' ? 'rules' : 'nano'}" data-i="${i}" title="${e.on ? 'Hidden. Click to send this one as is.' : 'Will be sent. Click to hide again.'}"><b>${esc(e.ph)}</b> ${esc(e.value)} <i>${e.by}</i></button>`).join('') || '<p class="muted">Nothing private found.</p>';
  const bytes = new TextEncoder().encode(text).length;
  const nRules = state.entries.filter((e) => e.by === 'rules' && e.on).length;
  const nNano = state.entries.filter((e) => e.by !== 'rules' && e.on).length;
  $('#stats').innerHTML = `<span>${on.length} values stay on this device</span><span>${nRules} by rules</span><span>${nNano} by Gemini Nano</span><span>${bytes} bytes would leave</span>`;
  $('#nanonote').textContent = state.nanoNote;
  const bad = leaks(text, on);
  $('#gate').dataset.ok = String(bad.length === 0);
  $('#gate').textContent = bad.length === 0 ? 'Leak check passed: no hidden value is in the outgoing text.' : `Blocked: ${bad.length} hidden value(s) still in the text.`;
  $('#ask').disabled = bad.length > 0;
  $('#step2').hidden = false;
}

$('#chips').addEventListener('click', (ev) => {
  const b = ev.target.closest('.chip');
  if (!b) return;
  state.entries[Number(b.dataset.i)].on = !state.entries[Number(b.dataset.i)].on;
  render();
});

// ---------------------------------------------------------------- step 3 + 4: cloud on placeholders, values back on the device
async function sha256(s) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function ask() {
  const { text, on } = outgoing();
  if (leaks(text, on).length) return;
  const task = $('#task').value === 'custom' ? $('#custom').value.trim() : TASKS[$('#task').value];
  if (!task) return;
  const prompt = `${RULES}\n\nTask: ${task}\n\nText:\n${text}`;
  const forceDevice = $('#offline').checked;
  setBusy('#ask', true);
  $('#answer').innerHTML = '';
  $('#where').textContent = '';
  $('#step3').hidden = false;
  const t0 = performance.now();
  try {
    const result = await writerModel(forceDevice).generateContentStream(prompt);
    let acc = '';
    let source = '';
    for await (const chunk of result.stream) {
      acc += chunk.text();
      source = chunk.inferenceSource ?? source;
      $('#answer').innerHTML = restore(acc, on);
    }
    const final = await result.response;
    source = final.inferenceSource ?? source;
    const hash = await sha256(prompt);
    const ms = Math.round(performance.now() - t0);
    $('#where').dataset.src = source;
    $('#where').textContent = source === 'in_cloud' ? `Written in the cloud (${cloudModelName}) on placeholders` : 'Written on this device by Gemini Nano';
    $('#receipt').innerHTML = `<div><b>Sent</b> ${new TextEncoder().encode(prompt).length} bytes, SHA-256 <code>${hash.slice(0, 16)}…</code></div><div><b>Hidden values in it</b> 0 of ${on.length}</div><div><b>Placeholders put back on this device</b> ${(acc.match(PH) ?? []).length}</div><div><b>Time</b> ${ms} ms</div>`;
    $('#sent').textContent = prompt;
  } catch (e) {
    showError(e);
  } finally {
    setBusy('#ask', false);
  }
}

function restore(answer, on) {
  const map = new Map(on.map((e) => [e.ph, e.value]));
  return esc(answer).replace(PH, (m) => (map.has(m) ? `<mark class="real" title="${esc(m)} put back on this device">${esc(map.get(m))}</mark>` : m)).replace(/\n/g, '<br>');
}

// ---------------------------------------------------------------- wiring
function setBusy(sel, on) { const b = $(sel); b.disabled = on; b.classList.toggle('busy', on); }
function showError(e) { console.error(e); $('#error').hidden = false; $('#error').textContent = String(e?.message ?? e); setTimeout(() => { $('#error').hidden = true; }, 12000); }

$('#samples').innerHTML = SAMPLES.map((s, i) => `<button class="ghost" data-i="${i}">${esc(s.label)}</button>`).join('');
$('#samples').addEventListener('click', (ev) => {
  const b = ev.target.closest('button');
  if (!b) return;
  const s = SAMPLES[Number(b.dataset.i)];
  $('#raw').value = s.text;
  $('#task').value = s.task;
  $('#custom').hidden = s.task !== 'custom';
  $('#step2').hidden = true;
  $('#step3').hidden = true;
});
$('#task').addEventListener('change', () => { $('#custom').hidden = $('#task').value !== 'custom'; });
$('#hide').addEventListener('click', hide);
$('#ask').addEventListener('click', ask);
$('#offline').disabled = !cloudConfigured;
showStatus();
window.addEventListener('online', showStatus);
window.addEventListener('offline', showStatus);
