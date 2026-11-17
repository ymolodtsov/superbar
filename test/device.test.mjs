import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { normalize } from '../shared/settings.js';
// Executes the exact shipped bundle with only the device's documented globals.
const code = execFileSync(
  'tar',
  ['-xOzf', 'dist/me.molodtsov.superbar.tgz', 'me.molodtsov.superbar/scripts/main.js'],
  { encoding: 'utf8' },
);
async function runtime(overrides = {}) {
  let handler,
    unbound = false;
  const intervals = new Map(),
    timeouts = [],
    calls = [];
  let next = 1;
  const context = vm.createContext({
    console: { error() {} },
    Date,
    JSON,
    Promise,
    Math,
    String,
    Number,
    Object,
    Array,
    Error,
    RegExp,
    Map,
    Set,
    setInterval(fn) {
      const id = next++;
      intervals.set(id, fn);
      return id;
    },
    clearInterval(id) {
      intervals.delete(id);
    },
    setTimeout(fn) {
      timeouts.push(fn);
      return next++;
    },
    clearTimeout() {},
    listen(type, fn) {
      assert.equal(type, 'input');
      handler = fn;
      return () => {
        unbound = true;
      };
    },
    fetch: async (url, opts = {}) => {
      calls.push({ url, opts });
      if (overrides.fetch) {
        const result = overrides.fetch(url, opts);
        if (result) return result;
      }
      let data = {};
      if (url.includes('/time')) data = { timestamp: new Date().toISOString() };
      if (url.includes('/apps/settings'))
        data = { values: normalize({ weather_enabled: false, ...overrides.config }) };
      return { ok: true, status: 200, json: async () => data };
    },
  });
  vm.runInContext(code, context, { timeout: 1000 });
  async function flush() {
    for (let i = 0; i < 40; i++) await Promise.resolve();
  }
  await flush();
  return {
    calls,
    intervals,
    timeouts,
    flush,
    input: e => handler(e),
    get unbound() {
      return unbound;
    },
    tick: async () => {
      for (const fn of intervals.values()) fn();
      await flush();
    },
  };
}
test('shipped bundle boots without browser, Node, Intl, Settings or storage globals', async () => {
  const r = await runtime();
  const draw = r.calls.find(c => c.url.endsWith('/display/draw') && c.opts.method === 'POST');
  assert.ok(draw);
  const payload = JSON.parse(draw.opts.body);
  assert.equal(payload.application_name, 'me.molodtsov.superbar');
  assert.equal(payload.priority, 50);
  assert.ok(payload.elements.find(e => e.type === 'xpmbitmap' && e.display === 'front'));
});
test('unchanged frames are not resent every second', async () => {
  const r = await runtime();
  const before = r.calls.length;
  await r.tick();
  assert.equal(r.calls.length, before);
});
test('draw requests never overlap during rapid input', async () => {
  let release,
    pending = 0,
    peak = 0;
  const r = await runtime({
    fetch: (url, opts) => {
      if (url.endsWith('/display/draw') && opts.method === 'POST') {
        pending++;
        peak = Math.max(peak, pending);
        return new Promise(resolve => {
          release = () => {
            pending--;
            resolve({ ok: true, status: 200 });
          };
        });
      }
    },
  });
  r.input({ key: 'encoder', delta: 1 });
  r.input({ key: 'start', action: 'short' });
  await r.tick();
  assert.equal(peak, 1);
  release();
  await r.flush();
});
test('short Back on home cleans timers, display, and input without audio requests', async () => {
  const r = await runtime();
  r.input({ key: 'back', action: 'short' });
  await r.flush();
  for (const fn of r.timeouts.splice(0)) fn();
  await r.flush();
  assert.equal(r.intervals.size, 0);
  assert.equal(r.unbound, true);
  assert.ok(r.calls.some(c => c.url.includes('/display/draw?') && c.opts.method === 'DELETE'));
  assert.ok(r.calls.every(c => !c.url.includes('/audio/')));
});
test('failed draw is backed off rather than retried every tick', async () => {
  const r = await runtime({
    fetch: (url, opts) =>
      url.endsWith('/display/draw') && opts.method === 'POST' ? { ok: false, status: 503 } : null,
  });
  const before = r.calls.filter(c => c.opts.method === 'POST').length;
  await r.tick();
  await r.tick();
  assert.equal(r.calls.filter(c => c.opts.method === 'POST').length, before);
});

test('weather alert draws with legacy sound settings without making audio requests', async () => {
  const r = await runtime({
    config: { weather_enabled: true, quiet_enabled: false, sounds: true },
    fetch: url =>
      url.includes('open-meteo.com')
        ? {
            ok: true,
            status: 200,
            json: async () => ({
              current: { temperature_2m: 18 },
              hourly: {
                time: [(Date.now() + 600000) / 1000],
                precipitation_probability: [85],
                weather_code: [95],
              },
            }),
          }
        : null,
  });
  const draws = r.calls.filter(c => c.url.endsWith('/display/draw') && c.opts.method === 'POST');
  assert.ok(draws.some(c => JSON.parse(c.opts.body).elements.some(e => e.text === 'STORM')));
  await r.tick();
  assert.ok(r.calls.every(c => !c.url.includes('/audio/')));
});
