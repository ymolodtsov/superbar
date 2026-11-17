import { defaults, normalize, cityList } from './settings.js';
import { zoneOffset } from './zones.js';
export const MINUTE = 60000,
  HOUR = 3600000;
export const pad = n => String(n).padStart(2, '0');
export function localDate(now, offset = 0) {
  return new Date(now + offset * MINUTE);
}
export function clockText(now, offset, c) {
  const d = localDate(now, offset),
    h = d.getUTCHours();
  return (c.clock_24 ? pad(h) : String(h % 12 || 12)) + ':' + pad(d.getUTCMinutes());
}
export function isoWeek(d) {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  return Math.ceil(((t - new Date(Date.UTC(t.getUTCFullYear(), 0, 1))) / 86400000 + 1) / 7);
}
export function quiet(now, offset, c) {
  if (!c.quiet_enabled) return false;
  const d = localDate(now, offset),
    m = d.getUTCHours() * 60 + d.getUTCMinutes();
  const toM = v => Number(v.slice(0, 2)) * 60 + Number(v.slice(3, 5));
  const a = toM(c.quiet_start),
    b = toM(c.quiet_end);
  return a === b ? false : a < b ? m >= a && m < b : m >= a || m < b;
}
// Timer text: m:ss under an hour, h:mm:ss above.
export function span(ms) {
  const n = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(n / 3600),
    m = Math.floor((n % 3600) / 60);
  return (h ? h + ':' + pad(m) : String(m)) + ':' + pad(n % 60);
}
export function minutesUntil(ms) {
  return Math.max(0, Math.ceil(ms / MINUTE));
}
export function fresh(data, now, age) {
  return (
    !!data &&
    Number.isFinite(data.fetchedAt) &&
    now >= data.fetchedAt - 60000 &&
    now - data.fetchedAt < age
  );
}
export function createState(config = {}) {
  return {
    config: normalize(config),
    offset: 0,
    weather: null,
    zones: null,
    manual: null,
    timer: null,
    editing: false,
    minutes: config.timer_minutes || defaults.timer_minutes,
    dismissed: {},
    observed: {},
    reminderDismissed: '',
    lastView: null,
  };
}
export function views(s) {
  const c = s.config;
  return [
    'clock',
    ...(c.timer_enabled ? ['timer'] : []),
    ...(c.weather_enabled ? ['weather'] : []),
    ...(c.world_enabled ? cityList(c.world_cities).map((_, i) => 'world:' + i) : []),
    ...(c.reminder_enabled && c.reminder ? ['reminder'] : []),
    ...(c.countdown_enabled && c.countdown_date ? ['countdown'] : []),
  ];
}
export function tick(s, now) {
  if (s.timer && s.timer.status === 'running' && now >= s.timer.end) {
    s.timer.status = 'done';
    s.timer.finishedAt = now;
  }
  if (
    s.timer &&
    s.timer.status === 'done' &&
    now - s.timer.finishedAt > s.config.alert_seconds * 1000
  )
    s.timer = null;
  if (s.manual && now >= s.manual.until) {
    s.manual = null;
    s.editing = false;
  }
  for (const k of Object.keys(s.dismissed)) if (s.dismissed[k] < now) delete s.dismissed[k];
  for (const k of Object.keys(s.observed)) if (s.observed[k] + 2 * HOUR < now) delete s.observed[k];
}
export function input(s, event, now) {
  tick(s, now);
  const c = s.config;
  if (event.key === 'encoder') {
    const delta = event.delta || 1;
    if (s.editing) {
      s.minutes = Math.max(1, Math.min(180, s.minutes + delta));
      s.manual = { id: 'timer', until: now + c.manual_seconds * 1000 };
    } else {
      const list = views(s);
      let i = list.indexOf(s.manual ? s.manual.id : 'clock');
      i = (i + (delta % list.length) + list.length) % list.length;
      s.manual = { id: list[i], until: now + c.manual_seconds * 1000 };
    }
    return 'changed';
  }
  if (event.action !== 'short' && event.action !== 'long') return 'ignored';
  if (event.key === 'back' && event.action === 'long') return 'quit';
  const view = resolve(s, now);
  if (event.key === 'back') {
    if (s.editing) {
      s.editing = false;
      s.manual = null;
      return 'changed';
    }
    if (view.key) {
      s.dismissed[view.key] = view.expiresAt || now + HOUR;
      s.manual = null;
      return 'changed';
    }
    if ((s.manual && s.manual.id !== 'clock') || view.kind !== 'clock') {
      s.manual = { id: 'clock', until: now + c.manual_seconds * 1000 };
      return 'changed';
    }
    return 'quit';
  }
  if (event.key === 'ok' && event.action === 'long') {
    if (view.kind === 'reminder') {
      s.reminderDismissed = c.reminder;
      s.manual = null;
      return 'changed';
    }
    if (view.kind === 'timer') {
      s.timer = null;
      s.editing = false;
      s.manual = null;
      return 'changed';
    }
  }
  if (event.action !== 'short') return 'ignored';
  if ((event.key === 'ok' || event.key === 'start') && view.key && view.kind !== 'timer') {
    s.dismissed[view.key] = view.expiresAt || now + HOUR;
    s.manual = null;
    return 'changed';
  }
  if (event.key === 'start' || (event.key === 'ok' && view.kind === 'timer')) {
    if (!c.timer_enabled) return 'ignored';
    if (s.editing) {
      s.timer = { status: 'running', end: now + s.minutes * MINUTE, duration: s.minutes * MINUTE };
      s.editing = false;
      s.manual = null;
    } else if (s.timer?.status === 'running') {
      s.timer.remaining = s.timer.end - now;
      s.timer.status = 'paused';
      s.manual = { id: 'timer', until: now + c.manual_seconds * 1000 };
    } else if (s.timer?.status === 'paused') {
      s.timer.end = now + s.timer.remaining;
      s.timer.status = 'running';
      s.manual = null;
    } else if (s.timer?.status === 'done') {
      s.timer = null;
      s.manual = null;
    } else {
      s.minutes = c.timer_minutes;
      s.editing = true;
      s.manual = { id: 'timer', until: now + c.manual_seconds * 1000 };
    }
    return 'changed';
  }
  if (event.key === 'ok') {
    s.manual = null;
    return 'changed';
  }
  return 'ignored';
}
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const LONG_MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
const LONG_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function temperature(s) {
  if (!s.weather) return '--°';
  const f = s.config.temperature_unit === 'fahrenheit';
  return Math.round(f ? (s.weather.temperature * 9) / 5 + 32 : s.weather.temperature) + '°';
}
function hhmm(now, offset) {
  return clockText(now, offset, { clock_24: true });
}
function duration(ms) {
  const m = Math.round(ms / MINUTE);
  return m % 60 ? m + ' MIN' : m / 60 + (m === 60 ? ' HOUR' : ' HOURS');
}
function utcOffset(minutes) {
  const sign = minutes < 0 ? '-' : '+',
    a = Math.abs(minutes);
  return sign + Math.floor(a / 60) + (a % 60 ? ':' + pad(a % 60) : 'H');
}

// Views use one of two front layouts (see shared/pixels.js):
// hero: large value on the left, label and detail stacked on the right.
// text: small label on top, one line of text below.
function timerView(s, now) {
  const t = s.timer;
  const base = { kind: 'timer', layout: 'hero', color: 'accent' };
  if (s.editing)
    return {
      ...base,
      label: 'SET TIMER',
      value: s.minutes + ':00',
      hint: 'Wheel: adjust   Start: begin',
    };
  if (!t)
    return {
      ...base,
      label: 'TIMER',
      value: s.config.timer_minutes + ':00',
      hint: 'Start: set timer',
    };
  if (t.status === 'done')
    return {
      ...base,
      label: 'DONE',
      value: '0:00',
      detail: duration(t.duration),
      color: 'green',
      key: 'timer:' + t.end,
      expiresAt: now + MINUTE,
      hint: 'OK: dismiss',
    };
  const left = t.status === 'paused' ? t.remaining : t.end - now;
  return {
    ...base,
    label: t.status === 'paused' ? 'PAUSED' : 'TIMER',
    value: span(left),
    detail: duration(t.duration),
    color: t.status === 'paused' ? 'amber' : 'accent',
    progress: 1 - left / t.duration,
    hint: 'Start: ' + (t.status === 'paused' ? 'resume' : 'pause') + '   Hold OK: cancel',
  };
}

function weatherRisk(s, now) {
  const c = s.config,
    w = s.weather;
  return c.weather_enabled &&
    c.weather_interrupt &&
    fresh(w, now, 30 * MINUTE) &&
    w.rainAt >= now &&
    w.rainAt - now <= HOUR &&
    (w.rainProbability || 0) >= c.rain_threshold
    ? w
    : null;
}

export function resolve(s, now) {
  const view = resolveView(s, now);
  const risk = weatherRisk(s, now);
  if (risk && !view.key) view.weatherIcon = risk.rainKind === 'storm' ? 'storm' : 'rain';
  return view;
}

function resolveView(s, now) {
  tick(s, now);
  const c = s.config;
  const weatherFresh = fresh(s.weather, now, 30 * MINUTE);
  const rain = weatherFresh ? s.weather.rainAt : null;
  const rainKey = rain ? 'rain:' + rain : null;
  const alerts = [];
  if (weatherRisk(s, now)) {
    if (!s.observed[rainKey]) s.observed[rainKey] = now;
    alerts.push({
      kind: 'weather',
      layout: 'hero',
      label: s.weather.rainKind === 'storm' ? 'STORM' : 'RAIN',
      value: s.weather.rainProbability + '%',
      detail: ['NEXT HOUR', 'SOON'],
      note: c.location.name + ' · ' + s.weather.rainProbability + '% chance',
      color: 'blue',
      key: rainKey,
      expiresAt: rain + HOUR,
      seen: s.observed[rainKey],
      hint: 'OK: dismiss',
    });
  }
  if (c.timer_enabled && s.timer?.status === 'done' && !s.dismissed['timer:' + s.timer.end])
    return timerView(s, now);
  if (!s.manual && c.auto_switch && !quiet(now, s.offset, c)) {
    const alert = alerts.find(a => !s.dismissed[a.key] && now - a.seen < c.alert_seconds * 1000);
    if (alert) return alert;
  }
  let id = s.manual?.id || (c.timer_enabled && s.timer?.status === 'running' ? 'timer' : 'clock');
  if (!views(s).includes(id)) id = 'clock';
  if (id === 'timer') return timerView(s, now);
  if (id === 'weather') {
    const sunset = c.show_sunset && s.weather?.sunset ? hhmm(s.weather.sunset, s.offset) : '';
    return {
      kind: 'weather',
      layout: 'hero',
      label: c.location.name.toUpperCase(),
      value: temperature(s),
      // Candidates are tried in order until one fits beside the value.
      detail: !s.weather
        ? []
        : !weatherFresh
          ? ['OFFLINE']
          : sunset
            ? ['SUNSET ' + sunset, sunset]
            : [],
      note: !s.weather
        ? 'Waiting for weather'
        : (weatherFresh ? '' : 'Not updated recently · ') +
          (sunset ? 'Sunset ' + sunset : c.location.name),
      color: 'blue',
      dim: !weatherFresh,
      stale: !weatherFresh,
    };
  }
  if (id.startsWith('world:')) {
    const city = cityList(c.world_cities)[Number(id.split(':')[1])];
    // Offsets come from the Bar's own zone list, refreshed every half hour.
    const offset = zoneOffset(s.zones, city.zone, now);
    const valid = offset !== null;
    const unknown = !valid && !!s.zones && now < s.zones.validUntil;
    const day =
      valid && localDate(now, offset).getUTCDay() !== localDate(now, s.offset).getUTCDay();
    return {
      kind: 'world',
      layout: 'hero',
      label: city.label.toUpperCase(),
      value: valid ? clockText(now, offset, c) : '--:--',
      detail: valid
        ? [
            utcOffset(offset - s.offset) +
              (day ? ' ' + DAYS[localDate(now, offset).getUTCDay()] : ''),
            utcOffset(offset - s.offset),
          ]
        : unknown
          ? ['UNKNOWN ZONE', 'UNKNOWN']
          : ['NO DATA'],
      note: valid
        ? city.zone
        : unknown
          ? 'Unknown time zone: ' + city.zone
          : 'Waiting for time zones',
      color: 'accent',
      dim: !valid,
    };
  }
  if (id === 'reminder') {
    const dismissed = s.reminderDismissed === c.reminder;
    return {
      kind: 'reminder',
      layout: 'text',
      label: dismissed ? 'DISMISSED' : 'REMINDER',
      value: c.reminder,
      note: c.reminder,
      color: dismissed ? 'dim' : 'amber',
      hint: dismissed ? '' : 'Hold OK: dismiss',
    };
  }
  if (id === 'countdown') {
    const end = Date.parse(c.countdown_date + 'T00:00:00Z'),
      d = localDate(now, s.offset),
      today = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    const days = Math.round((end - today) / 86400000);
    const unit = Math.abs(days) === 1 ? 'DAY' : 'DAYS';
    return {
      kind: 'countdown',
      layout: 'hero',
      label: c.countdown_label.toUpperCase(),
      value: !Number.isFinite(days) ? '--' : days === 0 ? 'TODAY' : String(Math.abs(days)),
      detail: days === 0 ? [] : days > 0 ? [unit] : [unit + ' AGO', 'AGO'],
      note: c.countdown_date,
      color: 'accent',
    };
  }
  const d = localDate(now, s.offset);
  const day = d.getUTCDate(),
    month = MONTHS[d.getUTCMonth()];
  const date =
    c.date_format === 'weekday'
      ? DAYS[d.getUTCDay()] + ' ' + day
      : c.date_format === 'month_day'
        ? month + ' ' + day
        : day + ' ' + month;
  const reminder =
    c.reminder_enabled && c.reminder && s.reminderDismissed !== c.reminder ? c.reminder : '';
  return {
    kind: 'clock',
    layout: 'clock',
    value: clockText(now, s.offset, c),
    ampm: c.clock_24 ? '' : d.getUTCHours() < 12 ? 'AM' : 'PM',
    date: c.show_date ? date : '',
    week: c.show_week ? 'W' + pad(isoWeek(d)) : '',
    temperature: c.weather_enabled ? temperature(s) : '',
    reminder,
    title: LONG_DAYS[d.getUTCDay()] + ', ' + day + ' ' + LONG_MONTHS[d.getUTCMonth()],
    note:
      reminder ||
      (c.weather_enabled && s.weather
        ? temperature(s) + ' ' + c.location.name + (weatherFresh ? '' : ' · not updated recently')
        : ''),
    color: 'accent',
    stale: c.weather_enabled && !weatherFresh,
  };
}
