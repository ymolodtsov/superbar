import { CHARS, FONTS } from './fonts.js';

// Front display: 72×16. Everything is drawn into one XPM bitmap with the firmware's own fonts
// (shared/fonts.js), so the simulator matches the device pixel for pixel.
export const WIDTH = 72;
export const HEIGHT = 16;
const MARGIN = 3; // left edge shared by the clock, hero values, and text views
const SIDE_X = 43; // clock side column
const BIG_TOP = 3; // extra_large cap rows 3–12, baseline on row 12
const LINE1_TOP = 2; // small cap rows 2–6
const LINE2_TOP = 8; // small cap rows 8–12, baseline aligned with the big digits

const COLORS = { accent: 'a', amber: 'y', green: 'g', blue: 'b', dim: 'm' };
const glyphs = {};

function glyph(font, ch) {
  const key = font + ch;
  if (glyphs[key]) return glyphs[key];
  const f = FONTS[font];
  let i = CHARS.indexOf(ch);
  if (i < 0) i = CHARS.indexOf('?');
  const size = 2 + 3 * f.height;
  const record = f.data.slice(i * size, (i + 1) * size);
  const g = { advance: parseInt(record[0], 16), width: parseInt(record[1], 16), rows: [] };
  for (let y = 0; y < f.height; y++) g.rows.push(parseInt(record.slice(2 + 3 * y, 5 + 3 * y), 16));
  glyphs[key] = g;
  return g;
}

// The Bar's CPU is roughly 600× slower than a laptop, and the same strings are cleaned and
// measured every tick, so both are memoized in a small cache that resets when full.
let memo = {},
  memoSize = 0;
function cached(key, compute) {
  if (key in memo) return memo[key];
  if (++memoSize > 256) {
    memo = {};
    memoSize = 1;
  }
  return (memo[key] = compute());
}

// Keep text within the extracted glyph set; strip accents where the runtime supports it.
export function clean(value) {
  return cached('c' + value, () => {
    let s = String(value || '');
    if (typeof s.normalize === 'function') s = s.normalize('NFD').replace(/[̀-ͯ]/g, '');
    s = s.replace(/\s+/g, ' ').trim();
    let out = '';
    for (let i = 0; i < s.length; i++) out += CHARS.indexOf(s[i]) < 0 ? '?' : s[i];
    return out;
  });
}

export function measure(text, font) {
  return cached('m' + font + text, () => {
    const s = clean(text);
    let x = 0,
      right = 0;
    for (let i = 0; i < s.length; i++) {
      const g = glyph(font, s[i]);
      if (g.width) right = x + g.width;
      x += g.advance;
    }
    return right;
  });
}

// Shorten to the last whole word that fits, then to characters, ending in an ellipsis.
export function fit(text, font, max) {
  const s = clean(text);
  if (measure(s, font) <= max) return s;
  const words = s.split(' ');
  for (let k = words.length - 1; k > 0; k--) {
    const candidate = words.slice(0, k).join(' ') + '…';
    if (measure(candidate, font) <= max) return candidate;
  }
  for (let n = s.length - 1; n > 0; n--) {
    const candidate = s.slice(0, n).trim() + '…';
    if (measure(candidate, font) <= max) return candidate;
  }
  return '';
}

// First candidate that fits whole; otherwise the last one shortened.
function pick(candidates, font, max) {
  const list = (Array.isArray(candidates) ? candidates : [candidates]).filter(Boolean);
  for (const c of list) if (measure(c, font) <= max) return clean(c);
  return list.length ? fit(list[list.length - 1], font, max) : '';
}

// Word-wrap into at most `lines` lines; the last line carries the ellipsis.
export function wrap(text, font, max, lines) {
  const words = clean(text).split(' ');
  const out = [];
  while (words.length && out.length < lines) {
    let line = words.shift();
    while (words.length && measure(line + ' ' + words[0], font) <= max) line += ' ' + words.shift();
    out.push(line);
  }
  const last = out.length - 1;
  if (words.length) out[last] = fit(out[last] + ' ' + words.join(' '), font, max);
  return out.map(line => fit(line, font, max));
}

export function bitmap(w = WIDTH, h = HEIGHT) {
  return { w, h, rows: Array.from({ length: h }, () => Array(w).fill('.')) };
}

export function rect(b, x, y, w, h, color) {
  for (let yy = Math.max(0, y); yy < Math.min(b.h, y + h); yy++)
    for (let xx = Math.max(0, x); xx < Math.min(b.w, x + w); xx++) b.rows[yy][xx] = color;
}

// `top` is the top of the font's line box, as in a native top_left text element.
export function textBox(b, value, x, top, font, color) {
  const s = clean(value);
  let left = x;
  for (let i = 0; i < s.length; i++) {
    const g = glyph(font, s[i]);
    for (let gy = 0; gy < g.rows.length; gy++) {
      const y = top + gy,
        row = g.rows[gy];
      if (!row || y < 0 || y >= b.h) continue;
      const line = b.rows[y];
      for (let gx = 0; gx < g.width; gx++) {
        const xx = left + gx;
        if (xx >= 0 && xx < b.w && (row >> (g.width - 1 - gx)) & 1) line[xx] = color;
      }
    }
    left += g.advance;
  }
}

// `capTop` is the first row of capital letters and digits.
export function text(b, value, x, capTop, font, color) {
  const f = FONTS[font];
  textBox(b, value, x, capTop - (f.ascent - f.cap), font, color);
}

function textRight(b, value, right, capTop, font, color) {
  text(b, value, right - measure(value, font), capTop, font, color);
}

function weatherIcon(b, kind, x) {
  const rows =
    kind === 'storm'
      ? ['..yy', '.yy.', '.yy.', 'yyyy', '..y.', '.y..', 'y...']
      : ['.b..', '.b..', 'bbb.', 'bbbb', 'bbbb', 'bbbb', '.bb.'];
  rows.forEach((row, y) => {
    for (let i = 0; i < row.length; i++) if (row[i] !== '.') rect(b, x + i, y + 4, 1, 1, row[i]);
  });
}

// Extend only the clock's center row by one pixel. Widths and the bottom baseline stay fixed;
// the BUSY glyphs remain unchanged for timers, other views, and native back-display text.
function clockTime(b, value, x) {
  text(b, value, x, BIG_TOP, 'extra_large', 'w');
  const end = x + measure(value, 'extra_large');
  for (let y = LINE1_TOP; y < BIG_TOP + 5; y++)
    for (let xx = x; xx < end; xx++) b.rows[y][xx] = b.rows[y + 1][xx];
}

function clockFrame(b, view) {
  const time = view.value;
  const tw = measure(time, 'extra_large');
  const sideW = WIDTH - SIDE_X;
  const reminder = view.reminder ? wrap(view.reminder.toUpperCase(), 'small', sideW, 2) : null;
  const line1 = reminder ? reminder[0] : view.date;
  if (!line1 && !view.week && !view.temperature) {
    // No side column: center the time, with AM/PM set small at cap height.
    const aw = view.ampm ? 2 + measure(view.ampm, 'small') : 0;
    const x = Math.floor((WIDTH - tw - aw) / 2);
    clockTime(b, time, x);
    if (view.ampm) text(b, view.ampm, x + tw + 2, BIG_TOP, 'small', 'm');
  } else {
    // AM/PM does not fit beside a two-digit hour and the side column; the back display shows it.
    clockTime(b, time, MARGIN);
    if (line1) text(b, line1, SIDE_X, LINE1_TOP, 'small', reminder ? 'y' : 'a');
    if (reminder) {
      if (reminder[1]) text(b, reminder[1], SIDE_X, LINE2_TOP, 'small', 'y');
    } else {
      const temp = view.temperature;
      const tempColor = view.stale ? 'm' : 'c';
      const week =
        view.week && (!temp || measure(view.week + ' ' + temp, 'small') <= sideW) ? view.week : '';
      if (week) text(b, week, SIDE_X, LINE2_TOP, 'small', 'c');
      if (temp && week) textRight(b, temp, WIDTH - 1, LINE2_TOP, 'small', tempColor);
      else if (temp) text(b, temp, SIDE_X, LINE2_TOP, 'small', tempColor);
    }
  }
}

function heroFrame(b, view, color) {
  const value = clean(view.value);
  const vw = measure(value, 'extra_large');
  const valueColor = view.dim ? 'm' : view.color === 'green' ? 'g' : 'w';
  text(b, value, MARGIN, BIG_TOP, 'extra_large', valueColor);
  const x = MARGIN + vw + 5;
  const max = WIDTH - x - (view.weatherIcon ? 6 : 0);
  text(b, pick(view.label, 'small', max), x, LINE1_TOP, 'small', color);
  text(b, pick(view.detail, 'small', max), x, LINE2_TOP, 'small', view.dim ? 'm' : 'c');
  // Row 15 stays clear of the digits (cap rows 3–12), so the bar never touches the value.
  if (Number.isFinite(view.progress)) {
    const p = Math.max(0, Math.min(1, view.progress));
    rect(b, 0, HEIGHT - 1, Math.round(WIDTH * p), 1, color);
  }
}

function textFrame(b, view, color) {
  const max = WIDTH - MARGIN - 1 - (view.weatherIcon ? 6 : 0);
  text(b, fit(view.label, 'small', max), MARGIN, 1, 'small', color);
  // normal: cap rows 7–13, descenders 14–15.
  const font = measure(view.value, 'normal') <= max ? 'normal' : 'condensed';
  text(b, fit(view.value, font, max), MARGIN, 7, font, 'w');
}

export function frame(view) {
  const b = bitmap();
  const color = COLORS[view.color] || 'a';
  if (view.layout === 'clock') clockFrame(b, view);
  else if (view.layout === 'text') textFrame(b, view, color);
  else heroFrame(b, view, color);
  if (view.weatherIcon) {
    // Clock digits are proportional: center the four-pixel icon in the actual gap.
    // A fixed x=38 crowds the side column whenever the clock is narrower.
    const x =
      view.layout === 'clock'
        ? Math.floor((MARGIN + measure(view.value, 'extra_large') + SIDE_X - 4) / 2)
        : 67;
    weatherIcon(b, view.weatherIcon, x);
  }
  return b;
}

export function palette(config) {
  return {
    '.': '#000000',
    w: '#F1F0EA',
    m: '#8E8C96',
    a: config.accent.slice(0, 7),
    c: config.accent_bottom.slice(0, 7),
    y: '#E8B467',
    g: '#89C8A1',
    b: '#87BFE8',
  };
}

export function xpm(b, config) {
  const p = palette(config);
  const colors = Object.keys(p).map(k => k + ' c ' + p[k]);
  const header = b.w + ' ' + b.h + ' ' + colors.length + ' 1';
  return ['! XPM2', header, ...colors, ...b.rows.map(r => r.join(''))].join('\n');
}

// Back display: 160×80, drawn with native text elements in the same firmware fonts.
const BACK_WIDTH = 160;
const BACK_TEXT = 140; // ends at x=145; the firmware status column starts at x=149
const WHITE = '#FFFFFFFF';
const MUTED = '#8E8C96FF';

export function backElements(view) {
  const clock = view.layout === 'clock';
  const title = clock ? view.title : view.label;
  const value = clock ? view.value + (view.ampm ? ' ' + view.ampm : '') : view.value;
  const note = clean(view.note);
  const line = (id, y, value, font, color, scroll) => ({
    id,
    type: 'text',
    display: 'back',
    x: 6,
    y,
    align: 'top_left',
    text: clean(value) || ' ',
    font,
    color,
    width: BACK_TEXT,
    scroll_rate: scroll ? 240 : 0,
  });
  return [
    {
      id: 'back_bg',
      type: 'rectangle',
      display: 'back',
      x: 0,
      y: 0,
      width: BACK_WIDTH,
      height: 80,
      fill: 'solid',
      fill_colors: ['#000000FF'],
      border_width: 0,
      radius: 0,
    },
    line('back_title', 6, fit(title, 'normal', BACK_TEXT), 'normal', MUTED),
    line('back_value', 22, fit(value, 'extra_large', BACK_TEXT), 'extra_large', WHITE),
    line('back_note', 44, note, 'normal', WHITE, measure(note, 'normal') > BACK_TEXT),
    line('back_hint', 64, view.hint || '', 'small', MUTED),
  ];
}

// Simulator rendering of backElements; scrolling text is shown clipped at its start.
export function backFrame(elements) {
  const b = bitmap(BACK_WIDTH, 80);
  for (const e of elements) {
    if (e.type !== 'text') continue;
    const clip = bitmap(e.width, FONTS[e.font].height);
    textBox(clip, e.text, 0, 0, e.font, e.color === WHITE ? 'w' : 'm');
    clip.rows.forEach((row, y) =>
      row.forEach((c, x) => {
        if (c !== '.') rect(b, e.x + x, e.y + y, 1, 1, c);
      }),
    );
  }
  return b;
}
