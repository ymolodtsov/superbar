import { fields, groups, normalize, cityList } from '/shared/settings.js';
import { createState, input, resolve, quiet } from '/shared/model.js';
import { frame, palette, backElements, backFrame } from '/shared/pixels.js';
import { weatherURL, parseWeather } from '/shared/weather.js';
import { zoneKey } from '/shared/zones.js';
const $ = s => document.querySelector(s);
let state = createState(),
  bar = '',
  connected = false,
  dirty = false,
  activeTab = 'display',
  scenario = 'live',
  realWeather = null,
  weatherKey = '',
  stopped = false,
  toastTimer;
function toast(message) {
  $('#toast').textContent = message;
  $('#toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ($('#toast').hidden = true), 5000);
}
const APP = 'me.molodtsov.superbar';
// The Bar's HTTP API allows cross-origin requests, so the page reads and writes settings directly.
async function barSettings(method = 'GET', values) {
  const r = await fetch(bar + '/api/apps/settings?app_id=' + APP, {
    method,
    signal: AbortSignal.timeout(5000),
    ...(values ? { body: JSON.stringify({ version: 1, values }) } : {}),
  });
  if (r.status === 400 && method === 'PUT')
    throw new Error('The Bar rejected these settings. Install the current build, then send again.');
  if (!r.ok) throw new Error('Busy Bar returned HTTP ' + r.status);
  return r.json();
}
function changed() {
  dirty = true;
  $('#save').disabled = !connected;
  $('#save-state').textContent = connected ? 'Not sent' : 'Bar not connected';
  paint();
  void updateWeather();
}
const descriptions = {
  clock_24:
    'In 12-hour mode, AM/PM appears on the front only when date, week, and weather are off.',
  world_cities:
    'Up to five, as LABEL=Area/City separated by semicolons. Cities come from the Bar’s time-zone list.',
  reminder: 'Shown beside the clock in two short lines. Hold OK on its view to dismiss.',
  countdown_date: 'Counts local calendar days.',
  auto_switch:
    'Weather messages wait while you browse. A small weather icon remains after the message expires.',
  weather_interrupt:
    'Shows a full-screen message, then a small drop or thunderstorm bolt until the forecast clears or expires.',
  quiet_enabled:
    'Dims SuperBar and suppresses full-screen weather alerts. Busy’s meeting alerts are unaffected.',
  night_opacity: 'Front display only; the Bar’s global brightness is unchanged.',
  show_week: 'ISO weeks start on Monday.',
  manual_seconds: 'Return to the automatic view after this long without input.',
};
function node(tag, props = {}, children = []) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'className') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'htmlFor') el.htmlFor = v;
    else el.setAttribute(k, v);
  }
  for (const c of children) el.append(c);
  return el;
}
function renderSettings() {
  const form = $('#settings');
  form.replaceChildren();
  const group = groups.find(g => g[0] === activeTab);
  form.setAttribute('aria-label', group[1]);
  for (const key of group[2]) {
    const f = fields[key],
      v = state.config[key],
      row = node('div', { className: 'setting' + (f.type === 'boolean' ? ' toggle' : '') });
    const label = node('label', { htmlFor: key, text: f.label });
    row.append(label);
    let control;
    if (f.type === 'geolocation') {
      const name = node('input', {
        id: key,
        type: 'text',
        value: v.name,
        'aria-label': 'Location name',
      });
      row.append(name);
      const grid = node('div', { className: 'geo-grid' });
      const lat = node('input', {
        type: 'number',
        step: 'any',
        min: '-90',
        max: '90',
        value: v.lat,
        'aria-label': 'Latitude',
      });
      const lon = node('input', {
        type: 'number',
        step: 'any',
        min: '-180',
        max: '180',
        value: v.lon,
        'aria-label': 'Longitude',
      });
      grid.append(
        node('label', { text: 'Latitude' }, [lat]),
        node('label', { text: 'Longitude' }, [lon]),
      );
      row.append(grid);
      for (const el of [name, lat, lon])
        el.addEventListener('input', () => {
          state.config.location = {
            mode: 'fixed',
            name: name.value,
            lat: lat.valueAsNumber,
            lon: lon.valueAsNumber,
          };
          changed();
        });
    } else {
      if (f.type === 'enum') {
        control = node('select', { id: key });
        for (const o of f.options)
          control.append(node('option', { value: o.value, text: o.label }));
        control.value = v;
      } else if (f.type === 'boolean') {
        control = node('input', { id: key, type: 'checkbox', role: 'switch' });
        control.checked = v;
      } else if (f.type === 'integer') {
        control = node('input', { id: key, type: 'number', min: f.min, max: f.max, value: v });
      } else {
        control = node('input', {
          id: key,
          type:
            f.type === 'time'
              ? 'time'
              : f.type === 'color'
                ? 'color'
                : key === 'countdown_date'
                  ? 'date'
                  : 'text',
          value: f.type === 'color' ? v.slice(0, 7) : v,
          ...(f.max_length ? { maxlength: f.max_length } : {}),
        });
      }
      control.addEventListener('input', () => {
        state.config[key] =
          f.type === 'boolean'
            ? control.checked
            : f.type === 'integer'
              ? control.valueAsNumber
              : f.type === 'color'
                ? control.value + 'FF'
                : control.value;
        changed();
      });
      row.append(control);
    }
    form.append(row);
    if (descriptions[key]) form.append(node('p', { className: 'help', text: descriptions[key] }));
  }
}
function drawCanvas(canvas, b, colors, opacity = 1, dots = false) {
  const ctx = canvas.getContext('2d'),
    sx = canvas.width / b.w,
    sy = canvas.height / b.h;
  ctx.fillStyle = '#101014';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.globalAlpha = opacity;
  for (let y = 0; y < b.h; y++)
    for (let x = 0; x < b.w; x++) {
      const ch = b.rows[y][x];
      ctx.fillStyle = ch === '.' ? (dots ? '#18181e' : '#101014') : colors[ch] || '#fff';
      const gap = dots ? 1.6 : 0;
      ctx.fillRect(x * sx + gap / 2, y * sy + gap / 2, sx - gap, sy - gap);
    }
  ctx.globalAlpha = 1;
}
// World-clock preview: the browser's time-zone data stands in for the Bar's zone list.
function offsetAt(zone, time) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: zone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
    })
      .formatToParts(time)
      .map(x => [x.type, x.value]),
  );
  const local = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute);
  return Math.round((local - Math.floor(time / 60000) * 60000) / 60000);
}
function previewZones(now) {
  const offsets = {};
  for (const c of cityList(state.config.world_cities))
    try {
      offsets[zoneKey(c.zone)] = offsetAt(c.zone, now);
    } catch {}
  return { fetchedAt: now, validUntil: now + 60000, offsets };
}
function demo(now) {
  state.weather = realWeather;
  state.zones = previewZones(now);
  if (['rain', 'rain-icon', 'storm-icon'].includes(scenario))
    state.weather = {
      temperature: 18,
      rainAt: Math.floor(now / 3600000) * 3600000 + 3600000,
      rainProbability: 85,
      rainKind: scenario === 'storm-icon' ? 'storm' : 'rain',
      sunset: now + 2 * 3600000,
      fetchedAt: now,
    };
  if (scenario.endsWith('-icon'))
    state.observed['rain:' + state.weather.rainAt] = now - state.config.alert_seconds * 1000;
  if (scenario === 'offline')
    state.weather = { temperature: 18, ...realWeather, fetchedAt: now - 3600000 };
}
// The quiet-hours scenario runs at 23:00 today; inputs use the same clock as the display.
function simNow() {
  if (scenario !== 'night') return Date.now();
  const d = new Date();
  d.setHours(23, 0, 0, 0);
  return d.getTime() + (Date.now() % 60000);
}
function paint() {
  if (stopped) return;
  const now = simNow();
  state.offset = -new Date().getTimezoneOffset();
  demo(now);
  const savedConfig = state.config;
  if (['rain', 'rain-icon', 'storm-icon'].includes(scenario))
    state.config = {
      ...state.config,
      auto_switch: true,
      quiet_enabled: false,
      weather_interrupt: true,
    };
  const view = resolve(state, now),
    c = state.config;
  const opacity = quiet(now, state.offset, c) ? c.night_opacity / 100 : 1;
  drawCanvas($('#front'), frame(view), palette(c), opacity, true);
  const back = backElements(view);
  $('#front').setAttribute(
    'aria-label',
    back
      .map(e => e.text || '')
      .join(' ')
      .trim(),
  );
  drawCanvas($('#back-display'), backFrame(back), { '.': '#101014', w: '#e6e7de', m: '#85867f' });
  state.config = savedConfig;
}
function action(event) {
  if (stopped) {
    stopped = false;
  }
  $('#sim-message').textContent = '';
  const result = input(state, event, simNow());
  if (result === 'quit') {
    stopped = true;
    $('#front').getContext('2d').clearRect(0, 0, 864, 192);
    $('#back-display').getContext('2d').clearRect(0, 0, 480, 240);
    $('#sim-message').textContent = 'SuperBar quit. Press any control to restart.';
  } else paint();
}
$('#prev').onclick = () => action({ key: 'encoder', delta: -1 });
$('#next').onclick = () => action({ key: 'encoder', delta: 1 });
$('#ok').onclick = () => action({ key: 'ok', action: 'short' });
$('#start').onclick = () => action({ key: 'start', action: 'short' });
$('#back').onclick = () => action({ key: 'back', action: 'short' });
$('#hold').onclick = () => action({ key: 'ok', action: 'long' });
window.addEventListener('keydown', e => {
  if (['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].includes(e.target.tagName)) return;
  const mappings = {
    ArrowLeft: { key: 'encoder', delta: -1 },
    ArrowRight: { key: 'encoder', delta: 1 },
    Enter: { key: 'ok', action: 'short' },
    ' ': { key: 'start', action: 'short' },
    Escape: { key: 'back', action: 'short' },
  };
  if (mappings[e.key]) {
    e.preventDefault();
    action(mappings[e.key]);
  }
});
for (const btn of document.querySelectorAll('[data-tab]'))
  btn.onclick = () => {
    activeTab = btn.dataset.tab;
    for (const other of document.querySelectorAll('[data-tab]')) {
      other.classList.toggle('selected', other === btn);
      other.setAttribute('aria-selected', String(other === btn));
      other.tabIndex = other === btn ? 0 : -1;
    }
    renderSettings();
  };
$('#scenario').onchange = () => {
  scenario = $('#scenario').value;
  state.manual = null;
  state.observed = {};
  state.dismissed = {};
  if (scenario === 'done')
    state.timer = { status: 'done', finishedAt: Date.now(), end: Date.now(), duration: 5 * 60000 };
  else if (state.timer?.status === 'done') state.timer = null;
  paint();
};
$('#settings').onsubmit = e => e.preventDefault();
async function save() {
  if (!$('#settings').reportValidity()) throw new Error('Check the highlighted setting.');
  await barSettings('PUT', normalize(state.config));
  dirty = false;
  $('#save').disabled = true;
  $('#save-state').textContent = '';
}
$('#save').onclick = async () => {
  try {
    await save();
    toast('Sent. SuperBar reloads settings within a minute.');
  } catch (e) {
    toast(e.message);
  }
};
window.addEventListener('beforeunload', e => {
  if (dirty) {
    e.preventDefault();
    e.returnValue = '';
  }
});
async function updateWeather() {
  const c = state.config,
    key = JSON.stringify(c.location);
  if (!c.weather_enabled || (key === weatherKey && realWeather)) return;
  try {
    const r = await fetch(weatherURL(c), { signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error();
    realWeather = parseWeather(await r.json(), Date.now(), c.rain_threshold);
    weatherKey = key;
  } catch {
    realWeather = null;
  }
  paint();
}
// Start from the Bar's saved settings when it is connected; otherwise preview the defaults.
async function load() {
  try {
    bar = (await (await fetch('/bar.json')).json()).url;
    state = createState((await barSettings()).values);
    connected = true;
  } catch {
    connected = false;
    $('#save-state').textContent = 'Bar not connected';
  }
  renderSettings();
  paint();
  void updateWeather();
}
await load();
setInterval(paint, 1000);
setInterval(() => updateWeather(), 600000);
