const bool = (label, value) => ({ type: 'boolean', label, default: value });
const int = (label, value, min, max) => ({ type: 'integer', label, default: value, min, max });
const str = (label, value, max = 128) => ({
  type: 'string',
  label,
  default: value,
  max_length: max,
});
const choice = (label, value, options) => ({
  type: 'enum',
  label,
  default: value,
  options: options.map(([value, label]) => ({ value, label })),
});
export const groups = [
  [
    'display',
    'Clock & display',
    [
      'clock_24',
      'show_date',
      'date_format',
      'show_week',
      'accent',
      'accent_bottom',
      'quiet_enabled',
      'quiet_start',
      'quiet_end',
      'night_opacity',
    ],
  ],
  [
    'weather',
    'Weather',
    [
      'weather_enabled',
      'location',
      'temperature_unit',
      'show_sunset',
      'weather_interrupt',
      'rain_threshold',
    ],
  ],
  [
    'tools',
    'Tools',
    [
      'timer_enabled',
      'timer_minutes',
      'world_enabled',
      'world_cities',
      'reminder_enabled',
      'reminder',
      'countdown_enabled',
      'countdown_label',
      'countdown_date',
    ],
  ],
  ['behavior', 'Attention', ['auto_switch', 'manual_seconds', 'alert_seconds']],
];
export const fields = {
  clock_24: bool('24-hour clock', true),
  show_date: bool('Show date', true),
  date_format: choice('Date format', 'day_month', [
    ['day_month', '26 OCT'],
    ['month_day', 'OCT 26'],
    ['weekday', 'MON 26'],
  ]),
  show_week: bool('Show ISO week', true),
  accent: { type: 'color', label: 'Top accent', default: '#B9A7FFFF' },
  accent_bottom: { type: 'color', label: 'Bottom accent', default: '#87BFE8FF' },
  quiet_enabled: bool('Quiet hours', true),
  quiet_start: { type: 'time', label: 'Quiet hours start', default: '22:00' },
  quiet_end: { type: 'time', label: 'Quiet hours end', default: '08:00' },
  night_opacity: int('Night brightness (%)', 25, 5, 100),
  weather_enabled: bool('Show weather', true),
  location: {
    type: 'geolocation',
    label: 'Weather location',
    default: { mode: 'fixed', name: 'Estoril', lat: 38.7057, lon: -9.3977 },
  },
  temperature_unit: choice('Temperature', 'celsius', [
    ['celsius', 'Celsius'],
    ['fahrenheit', 'Fahrenheit'],
  ]),
  show_sunset: bool('Show sunset', true),
  weather_interrupt: bool('Weather alerts', true),
  rain_threshold: int('Rain probability (%)', 60, 10, 100),
  timer_enabled: bool('Quick timer', true),
  timer_minutes: int('Default timer (minutes)', 5, 1, 180),
  world_enabled: bool('World clocks', true),
  world_cities: str(
    'Cities (label=timezone; ...)',
    'NYC=America/New_York;LONDON=Europe/London;TOKYO=Asia/Tokyo',
    255,
  ),
  reminder_enabled: bool('Pinned reminder', true),
  reminder: str('Reminder', '', 64),
  countdown_enabled: bool('Date countdown', false),
  countdown_label: str('Countdown name', 'TRIP', 24),
  countdown_date: str('Countdown date (YYYY-MM-DD)', '', 10),
  auto_switch: bool('Allow automatic alerts', true),
  manual_seconds: int('Manual view timeout (seconds)', 30, 10, 120),
  alert_seconds: int('Alert duration (seconds)', 30, 5, 60),
};
export const defaults = Object.keys(fields).reduce((o, k) => {
  o[k] = fields[k].default;
  return o;
}, {});
export function normalize(input = {}) {
  const out = {};
  for (const k of Object.keys(fields)) {
    const f = fields[k],
      v = input[k];
    out[k] = f.default;
    if (f.type === 'boolean' && typeof v === 'boolean') out[k] = v;
    if (f.type === 'integer' && Number.isInteger(v)) out[k] = Math.max(f.min, Math.min(f.max, v));
    if (f.type === 'string' && typeof v === 'string') out[k] = v.slice(0, f.max_length);
    if (f.type === 'enum' && f.options.some(o => o.value === v)) out[k] = v;
    if (f.type === 'color' && /^#[a-f0-9]{6}([a-f0-9]{2})?$/i.test(v || ''))
      out[k] = v.length === 7 ? v + 'FF' : v;
    if (f.type === 'time' && /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(v || '')) out[k] = v;
    if (
      f.type === 'geolocation' &&
      v &&
      Number.isFinite(v.lat) &&
      Number.isFinite(v.lon) &&
      Math.abs(v.lat) <= 90 &&
      Math.abs(v.lon) <= 180
    )
      out[k] = {
        mode: 'fixed',
        name: String(v.name || 'Location').slice(0, 64),
        lat: v.lat,
        lon: v.lon,
      };
  }
  return out;
}
export function cityList(value) {
  return String(value)
    .split(';')
    .slice(0, 5)
    .map(s => {
      const p = s.trim().split('=');
      return { label: (p[0] || '').trim().slice(0, 12), zone: (p[1] || '').trim() };
    })
    .filter(c => c.label && c.zone);
}
