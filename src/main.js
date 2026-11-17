import { normalize } from '../shared/settings.js';
import { createState, input, resolve, quiet } from '../shared/model.js';
import { frame, xpm, backElements } from '../shared/pixels.js';
import { weatherURL, parseWeather } from '../shared/weather.js';
import { parseZoneList } from '../shared/zones.js';
import manifest from './appmeta/manifest.json';
const APP = manifest.id,
  BASE = 'http://localhost/api';
const s = createState();
let stopped = false,
  drawing = false,
  requesting = false,
  tickId,
  unbind;
let sent = {},
  nextWeather = 0,
  nextSettings = 0,
  nextZones = 0,
  nextTime = 0,
  weatherBackoff = 60000,
  clockSkew = 0,
  nextDraw = 0,
  nextRefresh = 0,
  drawBackoff = 2000,
  built = [],
  builtKey = '';
const now = () => Date.now() + clockSkew;
// Do not require newer writable Settings/localStorage APIs on firmware 1.3.1.
async function json(url, options = {}) {
  const r = await fetch(url, options);
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}
function report(where, e) {
  console.error('SuperBar ' + where + ': ' + (e && e.message ? e.message : String(e)));
}
async function poll() {
  if (stopped || requesting) return;
  requesting = true;
  const n = now();
  try {
    if (n >= nextTime) {
      nextTime = n + 300000;
      try {
        const d = await json(BASE + '/time');
        const t = Date.parse(d.timestamp);
        if (Number.isFinite(t)) {
          clockSkew = t - Date.now();
          const m = /([+-])(\d{2}):?(\d{2})$/.exec(d.timestamp);
          s.offset = m ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) : 0;
        }
      } catch (e) {
        report('time', e);
      }
    }
    if (stopped) return;
    if (n >= nextSettings) {
      nextSettings = n + 60000;
      try {
        const d = await json(BASE + '/apps/settings?app_id=' + APP);
        const prev = s.config;
        s.config = normalize(d.values || {});
        if (JSON.stringify(prev.location) !== JSON.stringify(s.config.location)) {
          s.weather = null;
          nextWeather = 0;
        }
      } catch (e) {
        report('settings', e);
      }
    }
    if (stopped) return;
    if (s.config.weather_enabled && n >= nextWeather) {
      nextWeather = n + weatherBackoff;
      try {
        s.weather = parseWeather(await json(weatherURL(s.config)), now(), s.config.rain_threshold);
        nextWeather = now() + 600000;
        weatherBackoff = 60000;
      } catch (e) {
        weatherBackoff = Math.min(weatherBackoff * 2, 600000);
        report('weather', e);
      }
    }
    if (stopped) return;
    if (s.config.world_enabled && n >= nextZones) {
      nextZones = n + 30000;
      try {
        s.zones = parseZoneList(await json(BASE + '/time/tzlist'), now());
        nextZones = s.zones.refreshAt;
      } catch (e) {
        report('zones', e);
      }
    }
  } finally {
    requesting = false;
  }
}
async function draw() {
  if (stopped || drawing || now() < nextDraw) return;
  drawing = true;
  try {
    const n = now(),
      view = resolve(s, n),
      c = s.config;
    const opacity = quiet(n, s.offset, c) ? c.night_opacity : 100;
    // Rendering costs hundreds of milliseconds on the Bar; rebuild only when the view changes.
    const key = JSON.stringify(view) + opacity + c.accent + c.accent_bottom;
    if (key !== builtKey) {
      built = [
        {
          id: 'front',
          type: 'xpmbitmap',
          display: 'front',
          x: 0,
          y: 0,
          align: 'top_left',
          opacity,
          data: xpm(frame(view), c),
        },
        ...backElements(view),
      ].map(e => ({ e, json: JSON.stringify(e) }));
      builtKey = key;
    }
    // The firmware clears an app's elements on short Back and when a higher-priority screen takes
    // over, without telling the app. Resend everything periodically so the display recovers.
    if (n >= nextRefresh) {
      sent = {};
      nextRefresh = n + 30000;
    }
    const target = sent;
    const pending = built.filter(b => b.json !== target[b.e.id]);
    const changed = pending.map(b => b.e);
    if (changed.length) {
      const r = await fetch(BASE + '/display/draw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ application_name: APP, priority: 50, elements: changed }),
      });
      if (!r.ok) throw new Error('Draw failed');
      for (const b of pending) target[b.e.id] = b.json;
      drawBackoff = 2000;
    }
  } catch (e) {
    sent = {};
    nextDraw = now() + drawBackoff;
    drawBackoff = Math.min(drawBackoff * 2, 60000);
    report('draw', e);
  } finally {
    drawing = false;
  }
}
async function quit() {
  if (stopped) return;
  stopped = true;
  clearInterval(tickId);
  // Wait for active requests before clearing so a late response cannot redraw.
  while (drawing || requesting) await new Promise(r => setTimeout(r, 100));
  try {
    await fetch(BASE + '/display/draw?application_name=' + APP, { method: 'DELETE' });
  } catch (e) {
    report('quit', e);
  }
  setTimeout(unbind, 0);
}
function persist() {
  try {
    if (typeof localStorage !== 'undefined')
      localStorage.setItem(
        'state',
        JSON.stringify({
          timer: s.timer,
          reminderDismissed: s.reminderDismissed,
          dismissed: s.dismissed,
        }),
      );
  } catch {}
}
function main() {
  try {
    if (typeof localStorage !== 'undefined') {
      const saved = JSON.parse(localStorage.getItem('state') || '{}');
      if (
        saved.timer &&
        ['running', 'paused'].includes(saved.timer.status) &&
        Number.isFinite(saved.timer.duration) &&
        saved.timer.duration > 0 &&
        saved.timer.duration <= 10800000
      )
        s.timer = saved.timer;
      s.reminderDismissed = String(saved.reminderDismissed || '').slice(0, 64);
      if (saved.dismissed && typeof saved.dismissed === 'object') s.dismissed = saved.dismissed;
    }
  } catch {}
  unbind = listen('input', event => {
    if (stopped) return;
    const result = input(s, event, now());
    if (result === 'changed' && event.key !== 'encoder') persist();
    if (result === 'quit') {
      void quit().catch(e => report('quit', e));
      return;
    }
    if (event.key === 'back' && event.action === 'short') {
      // Short Back has just cleared the canvas; redraw now and again after the clear lands.
      sent = {};
      setTimeout(() => {
        sent = {};
        void draw().catch(e => report('draw', e));
      }, 300);
    }
    void draw().catch(e => report('draw', e));
  });
  tickId = setInterval(() => {
    void draw().catch(e => report('draw', e));
    void poll().catch(e => report('poll', e));
  }, 1000);
  void poll()
    .then(() => draw())
    .catch(e => report('start', e));
}
main();
