import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, input, resolve, isoWeek, quiet, MINUTE, clockText } from '../shared/model.js';
import { frame, xpm, palette, measure, fit, wrap, backElements } from '../shared/pixels.js';
import { CHARS, FONTS } from '../shared/fonts.js';
import { normalize } from '../shared/settings.js';
import { parseWeather } from '../shared/weather.js';
import { parseZoneList, zoneOffset } from '../shared/zones.js';
const N = Date.parse('2026-10-26T12:00:00Z');
const tap = key => ({ key, action: 'short' });
test('ISO week handles year boundaries', () => {
  assert.equal(isoWeek(new Date('2021-01-01Z')), 53);
  assert.equal(isoWeek(new Date('2024-12-30Z')), 1);
});
test('clock supports offsets and noon/midnight', () => {
  assert.equal(clockText(N, 330, { clock_24: true }), '17:30');
  assert.equal(clockText(N, 0, { clock_24: false }), '12:00');
  assert.equal(clockText(N - 12 * 60 * MINUTE, 0, { clock_24: false }), '12:00');
});
test('hidden fields free the full clock area', () => {
  const s = createState({ show_date: false, show_week: false, weather_enabled: false });
  const v = resolve(s, N);
  assert.equal(v.date + v.week + v.temperature + v.reminder, '');
  // The time is centered, so it crosses the middle of the display.
  const b = frame(v);
  assert.ok(b.rows.some(r => r.slice(36, 40).includes('w')));
});
test('weather failure never hides the clock', () => {
  const s = createState();
  assert.equal(resolve(s, N).kind, 'clock');
  assert.equal(resolve(s, N).temperature, '--°');
});
test('quiet hours wrap midnight and respect offset', () => {
  const c = normalize();
  assert.equal(quiet(Date.parse('2026-10-26T23:00Z'), 0, c), true);
  assert.equal(quiet(N, 0, c), false);
  assert.equal(quiet(N, 660, c), true);
  assert.equal(quiet(N, 0, { ...c, quiet_start: '12:00', quiet_end: '12:00' }), false);
});
test('timer adjusts, starts, pauses and resumes remaining time', () => {
  const s = createState();
  input(s, tap('start'), N);
  input(s, { key: 'encoder', delta: 2 }, N);
  assert.equal(s.minutes, 7);
  input(s, tap('start'), N);
  assert.equal(s.timer.end, N + 7 * MINUTE);
  input(s, tap('start'), N + MINUTE);
  assert.equal(s.timer.remaining, 6 * MINUTE);
  input(s, tap('start'), N + 3 * MINUTE);
  assert.equal(s.timer.end, N + 9 * MINUTE);
});
test('timer finishes once and returns to clock after alert expiry', () => {
  const s = createState();
  s.timer = { status: 'running', end: N, duration: MINUTE };
  assert.equal(resolve(s, N).label, 'DONE');
  assert.equal(resolve(s, N + 31000).kind, 'clock');
});
test('holding OK cancels timer', () => {
  const s = createState();
  s.timer = { status: 'running', end: N + MINUTE, duration: MINUTE };
  input(s, { key: 'ok', action: 'long' }, N);
  assert.equal(s.timer, null);
});
test('Back returns to clock and a second Back quits', () => {
  const s = createState();
  input(s, { key: 'encoder', delta: 1 }, N);
  assert.equal(resolve(s, N).kind, 'timer');
  input(s, tap('back'), N);
  assert.equal(resolve(s, N).kind, 'clock');
  assert.equal(input(s, tap('back'), N), 'quit');
});
test('press/release do not double trigger controls', () => {
  const s = createState();
  input(s, { key: 'start', action: 'press' }, N);
  input(s, { key: 'start', action: 'release' }, N);
  assert.equal(s.editing, false);
  input(s, tap('start'), N);
  assert.equal(s.editing, true);
});
const rainy = () => {
  const s = createState({ weather_interrupt: true, quiet_enabled: false });
  s.weather = { temperature: 18, fetchedAt: N, rainAt: N + 10 * MINUTE, rainProbability: 90 };
  return s;
};
test('alerts take the screen only for the alert window', () => {
  const s = rainy();
  assert.equal(resolve(s, N).label, 'RAIN');
  assert.equal(resolve(s, N + 31000).kind, 'clock');
});
test('dismissed alerts do not immediately reappear', () => {
  const s = rainy();
  resolve(s, N);
  input(s, tap('back'), N + 1000);
  assert.equal(resolve(s, N + 2000).kind, 'clock');
});
test('manual views and quiet hours suppress alerts', () => {
  const s = rainy();
  s.manual = { id: 'timer', until: N + 30000 };
  assert.equal(resolve(s, N).kind, 'timer');
  s.manual = null;
  s.config.quiet_enabled = true;
  s.config.quiet_start = '10:00';
  s.config.quiet_end = '14:00';
  assert.equal(resolve(s, N).kind, 'clock');
});
test('stale weather shows a marker and cannot interrupt', () => {
  const s = createState({ weather_interrupt: true, quiet_enabled: false });
  s.weather = {
    temperature: 18,
    fetchedAt: N - 31 * MINUTE,
    rainAt: N + MINUTE,
    rainProbability: 90,
  };
  const v = resolve(s, N);
  assert.equal(v.kind, 'clock');
  assert.equal(v.stale, true);
});
test('rain alert follows probability threshold', () => {
  const s = createState({ weather_interrupt: true, quiet_enabled: false });
  s.weather = { temperature: 18, fetchedAt: N, rainAt: N + 10 * MINUTE, rainProbability: 90 };
  assert.equal(resolve(s, N).label, 'RAIN');
});
test('reminder stays dismissed for its text and new text reappears', () => {
  const s = createState({ reminder: 'SEND PROPOSAL' });
  s.manual = { id: 'reminder', until: N + MINUTE };
  input(s, { key: 'ok', action: 'long' }, N);
  assert.equal(resolve(s, N).reminder, '');
  s.config.reminder = 'SEND INVOICE';
  assert.equal(resolve(s, N).reminder, 'SEND INVOICE');
});
test('countdown uses local calendar days', () => {
  const s = createState({ countdown_enabled: true, countdown_date: '2026-10-27' });
  s.offset = 120;
  s.manual = { id: 'countdown', until: N + 48 * 60 * MINUTE };
  assert.equal(resolve(s, Date.parse('2026-10-26T23:00Z')).value, 'TODAY');
});
const TZLIST = {
  list: [
    { name: 'New York', offset: '-04:00', abbr: 'EDT' },
    { name: 'London', offset: '+00:00', abbr: 'GMT' },
    { name: 'Tokyo', offset: '+09:00', abbr: 'JST' },
    { name: 'Katmandu', offset: '+05:45', abbr: '+0545' },
  ],
};
test('Bar zone list matches IANA names, plain names, and aliases', () => {
  const z = parseZoneList(TZLIST, N);
  assert.equal(zoneOffset(z, 'America/New_York', N), -240);
  assert.equal(zoneOffset(z, 'new york', N), -240);
  assert.equal(zoneOffset(z, 'Europe/Lisbon', N), 0);
  assert.equal(zoneOffset(z, 'Asia/Kathmandu', N), 345);
  assert.equal(zoneOffset(z, 'Mars/Olympus', N), null);
  // Offsets change only at UTC :00/:30; the list expires shortly after the next boundary.
  assert.ok(z.refreshAt > N && z.refreshAt < z.validUntil && z.validUntil <= N + 32 * MINUTE);
  assert.equal(zoneOffset(z, 'America/New_York', z.validUntil), null);
});
test('world clocks use the Bar zone list', () => {
  const s = createState();
  s.zones = parseZoneList(TZLIST, N);
  s.manual = { id: 'world:0', until: N + MINUTE };
  const v = resolve(s, N);
  assert.equal(v.value, '08:00');
  assert.equal(v.detail[1], '-4H');
  s.config.world_cities = 'MARS=Mars/Olympus';
  assert.deepEqual(resolve(s, N).detail, ['UNKNOWN ZONE', 'UNKNOWN']);
  s.zones = null;
  assert.deepEqual(resolve(s, N).detail, ['NO DATA']);
});
test('disabled modules disappear from wheel navigation', () => {
  const s = createState({
    timer_enabled: false,
    weather_enabled: false,
    world_enabled: false,
  });
  input(s, { key: 'encoder', delta: 1 }, N);
  assert.equal(resolve(s, N).kind, 'clock');
  input(s, tap('start'), N);
  assert.equal(s.editing, false);
});
test('manual timer edit expires and never changes clock wheel behavior', () => {
  const s = createState();
  input(s, tap('start'), N);
  resolve(s, N + 31000);
  assert.equal(s.editing, false);
});
test('frames fit display bounds across all settings combinations', () => {
  for (const show_date of [true, false])
    for (const show_week of [true, false])
      for (const weather_enabled of [true, false])
        for (const clock_24 of [true, false]) {
          const s = createState({ show_date, show_week, weather_enabled, clock_24 });
          s.weather = { temperature: -12, fetchedAt: N };
          const b = frame(resolve(s, N));
          assert.equal(b.rows.length, 16);
          assert.ok(b.rows.every(r => r.length === 72));
          assert.ok(xpm(b, s.config).startsWith('! XPM2\n72 16 8 1'));
        }
  assert.ok(measure('23:59', 'extra_large') < 40);
});
test('weather parser rejects malformed temperature, selects future sunset', () => {
  assert.throws(() => parseWeather({}, N));
  const w = parseWeather(
    {
      current: { temperature_2m: 18 },
      daily: { sunset: [(N - 1000) / 1000, (N + 3600000) / 1000] },
      hourly: { time: [(N + 300000) / 1000], precipitation_probability: [80] },
    },
    N,
  );
  assert.equal(w.sunset, N + 3600000);
  assert.equal(w.rainProbability, 80);
});

const used = (b, y) => b.rows[y].some(c => c !== '.');
test('every glyph record decodes inside its font box', () => {
  for (const [name, f] of Object.entries(FONTS)) {
    assert.equal(f.data.length, CHARS.length * (2 + 3 * f.height), name);
    for (const ch of CHARS) assert.ok(measure(ch, name) <= 12, name + ' ' + ch);
  }
});
test('timer progress bar stays below the digits', () => {
  for (const left of [0, 1, 30, 59, 60, 299]) {
    const s = createState();
    s.timer = { status: 'running', end: N + left * 1000, duration: 5 * MINUTE };
    const b = frame(resolve(s, N));
    assert.ok(!used(b, 13) && !used(b, 14), 'rows 13-14 separate value and bar');
    assert.ok(b.rows[15].every(c => c === '.' || c === 'a'));
  }
});
test('long text shortens at a word boundary with an ellipsis', () => {
  assert.equal(fit('Review ready for SuperBar', 'condensed', 68), 'Review ready…');
  assert.ok(measure(fit('Supercalifragilistic', 'normal', 40), 'normal') <= 40);
  const lines = wrap('CALL MOM ABOUT TRIP', 'small', 29, 2);
  assert.equal(lines.length, 2);
  assert.ok(lines.every(l => measure(l, 'small') <= 29));
  assert.ok(lines[1].endsWith('…'));
  assert.deepEqual(wrap('PAY RENT', 'small', 29, 2), ['PAY', 'RENT']);
  assert.deepEqual(wrap('CALL', 'small', 29, 2), ['CALL']);
});
test('clock digits align with the date top and lower-line baseline', () => {
  const s = createState();
  s.weather = { temperature: 18, fetchedAt: N };
  const b = frame(resolve(s, N));
  const bottom = x0 =>
    Math.max(...b.rows.map((r, y) => (r.slice(x0).some(c => c !== '.') ? y : -1)));
  assert.equal(bottom(43), 12);
  assert.equal(
    b.rows.findIndex(r => r.slice(0, 38).includes('w')),
    2,
  );
  assert.equal(
    b.rows.findIndex(r => r.slice(43).includes('a')),
    2,
  );
  assert.equal(Math.max(...b.rows.map((r, y) => (r.slice(0, 40).includes('w') ? y : -1))), 12);
});
test('clock side column uses the top accent above and the bottom accent below', () => {
  const s = createState();
  s.weather = { temperature: 18, fetchedAt: N };
  const b = frame(resolve(s, N));
  const colors = rows => new Set(rows.flatMap(r => r.slice(43).filter(c => c !== '.')));
  assert.deepEqual([...colors(b.rows.slice(2, 7))], ['a']);
  assert.deepEqual([...colors(b.rows.slice(8, 13))], ['c']);
  assert.notEqual(palette(s.config).a, palette(s.config).c);
});
test('side column keeps temperature when week and temperature do not fit together', () => {
  const s = createState({ temperature_unit: 'fahrenheit' });
  s.weather = { temperature: 40, fetchedAt: N };
  const v = resolve(s, N);
  assert.equal(v.temperature, '104°');
  assert.ok(frame(v).rows.every(r => r.length === 72));
});
test('back display uses only valid firmware fonts and scrolls long notes', () => {
  const s = createState({ reminder: 'Call mom about the Lisbon trip before Friday evening' });
  s.manual = { id: 'reminder', until: N + MINUTE };
  const back = backElements(resolve(s, N));
  for (const e of back)
    if (e.type === 'text') assert.ok(['small', 'normal', 'extra_large'].includes(e.font));
  assert.ok(back.find(e => e.id === 'back_note').scroll_rate > 0);
});

test('weather alerts default to 30 seconds, then keep an icon without repeating', () => {
  const s = createState({ quiet_enabled: false });
  assert.equal(s.config.weather_interrupt, true);
  assert.equal(s.config.auto_switch, true);
  assert.equal(s.config.alert_seconds, 30);
  assert.equal('sounds' in s.config, false);
  s.weather = { temperature: 18, fetchedAt: N, rainAt: N + 10 * MINUTE, rainProbability: 90 };
  assert.equal(resolve(s, N).label, 'RAIN');
  assert.equal(resolve(s, N + 29999).label, 'RAIN');
  const icon = resolve(s, N + 30000);
  assert.equal(icon.kind, 'clock');
  assert.equal(icon.weatherIcon, 'rain');
  s.weather = { ...s.weather, fetchedAt: N + MINUTE };
  assert.equal(resolve(s, N + MINUTE).weatherIcon, 'rain');
  assert.equal(resolve(s, N + MINUTE).key, undefined);
});
test('dismissal, manual browsing, and quiet hours retain only the weather icon', () => {
  const s = rainy();
  resolve(s, N);
  input(s, tap('ok'), N + 1000);
  assert.equal(resolve(s, N + 2000).weatherIcon, 'rain');
  s.manual = { id: 'timer', until: N + MINUTE };
  assert.equal(resolve(s, N + 3000).kind, 'timer');
  assert.equal(resolve(s, N + 3000).weatherIcon, 'rain');
  const q = rainy();
  q.config.quiet_enabled = true;
  q.config.quiet_start = '10:00';
  q.config.quiet_end = '14:00';
  assert.equal(resolve(q, N).kind, 'clock');
  assert.equal(resolve(q, N).weatherIcon, 'rain');
});
test('icons clear when disabled, stale, below threshold, or outside the forecast window', () => {
  for (const change of [
    s => {
      s.config.weather_enabled = false;
    },
    s => {
      s.config.weather_interrupt = false;
    },
    s => {
      s.weather.fetchedAt = N - 31 * MINUTE;
    },
    s => {
      s.weather.rainProbability = 10;
    },
    s => {
      s.weather.rainAt = N - 1;
    },
    s => {
      s.weather.rainAt = N + 61 * MINUTE;
    },
    s => {
      s.weather = null;
    },
  ]) {
    const s = rainy();
    resolve(s, N);
    change(s);
    const v = resolve(s, N + 30000);
    assert.equal(v.kind, 'clock');
    assert.equal(v.weatherIcon, undefined);
  }
});
test('forecast thunderstorm codes select a bolt; ordinary rain selects a drop', () => {
  for (const code of [61, 95, 96, 97, 99]) {
    const s = rainy();
    s.weather = parseWeather(
      {
        current: { temperature_2m: 18 },
        hourly: {
          time: [(N + 10 * MINUTE) / 1000],
          precipitation_probability: [85],
          weather_code: [code],
        },
      },
      N,
    );
    assert.equal(resolve(s, N).label, code === 61 ? 'RAIN' : 'STORM');
    assert.equal(resolve(s, N + 30000).weatherIcon, code === 61 ? 'rain' : 'storm');
  }
});
test('weather icons preserve every clock and reminder pixel across a full day', () => {
  for (const clock_24 of [true, false])
    for (const reminder of ['', 'SEND PROPOSAL'])
      for (let minute = 0; minute < 1440; minute++) {
        const s = createState({ clock_24, reminder, weather_interrupt: false });
        const v = resolve(s, N + minute * MINUTE);
        const baseline = frame(v);
        const iconX = Math.floor((3 + measure(v.value, 'extra_large') + 43 - 4) / 2);
        for (const weatherIcon of ['rain', 'storm']) {
          const actual = frame({ ...v, weatherIcon });
          for (let y = 0; y < 16; y++)
            for (let x = 0; x < 72; x++) {
              if (x >= iconX && x < iconX + 4 && y >= 4 && y <= 10) {
                assert.equal(baseline.rows[y][x], '.');
              } else assert.equal(actual.rows[y][x], baseline.rows[y][x]);
            }
        }
      }
});
test('weather icon stays clear of running timer values and the progress bar', () => {
  for (const duration of [MINUTE, 59 * MINUTE, 180 * MINUTE]) {
    const s = rainy();
    s.config.auto_switch = false;
    s.timer = { status: 'running', end: N + duration, duration };
    const v = resolve(s, N);
    const b = frame(v);
    const baseline = frame({ ...v, weatherIcon: undefined });
    assert.deepEqual(b.rows[15], baseline.rows[15]);
    const valueEnd = 3 + measure(v.value, 'extra_large');
    for (let y = 0; y < 16; y++)
      assert.deepEqual(b.rows[y].slice(0, valueEnd), baseline.rows[y].slice(0, valueEnd));
  }
});

test('weather icons are horizontally centered between proportional clock digits and the side column', () => {
  for (const value of ['16:22', '11:11', '20:00', '8:08'])
    for (const weatherIcon of ['rain', 'storm']) {
      const rows = frame({
        layout: 'clock',
        value,
        date: '3 NOV',
        week: 'W45',
        temperature: '13°',
        weatherIcon,
      }).rows;
      const iconColor = weatherIcon === 'rain' ? 'b' : 'y';
      const pixels = rows.flatMap((row, y) =>
        row.flatMap((color, x) => (color === iconColor ? [{ x, y }] : [])),
      );
      const left = Math.min(...pixels.map(p => p.x));
      const right = Math.max(...pixels.map(p => p.x));
      const leftGap = left - (3 + measure(value, 'extra_large'));
      const rightGap = 43 - right - 1;
      assert.ok(leftGap >= 1 && rightGap >= 1);
      assert.ok(Math.abs(leftGap - rightGap) <= 1);
      assert.equal(Math.min(...pixels.map(p => p.y)), 4);
      assert.equal(Math.max(...pixels.map(p => p.y)), 10);
      if (value === '16:22') assert.equal(left, 36);
    }
});
