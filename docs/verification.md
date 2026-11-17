# Verification

## Weather icon horizontal placement — November 10, 2026

- Centered the bolt and drop in the gap between the proportional clock digits and the side column. At 16:22, the icon moves from x=38 to x=36. Original seven-pixel shapes and rows 4–10 are preserved.
- Formatting, build, all 43 tests, and syntax/schema checks pass. Full-day pixel checks cover 12/24-hour clocks with and without reminders; regression checks verify balanced horizontal gaps and unchanged vertical bounds.
- Inspected front bitmaps for clock, timer, weather, reminder, and countdown, plus narrow and wide clock values. Setup-page code is unchanged; no browser checks were run for this renderer-only change.
- Not installed or hardware-verified: the Bar did not respond at 10.0.4.20.

## Installed clock and weather update — November 4, 2026

- Rebuilt the current source; all 42 tests and syntax/schema checks pass. Formatting unchanged.
- Installed and launched SuperBar over USB at `10.0.4.20` (API 27.14.0).
- Set the saved alert duration to 30 seconds; confirmed weather alerts and automatic alerts are enabled.
- Increased front clock height from 10 to 11 pixels without changing its width or bottom baseline. A hardware display capture confirms clock pixels occupy rows 2–12, aligned with the date's top row.
- Clock display and live temperature verified on the Bar. A real weather alert transition and native calendar overlay still need hardware checks.

## Weather alerts — November 2, 2026

- Weather alerts enabled by default; alert duration defaults to 30 seconds.
- Full-screen messages use hourly forecast probability, then leave a small drop or thunderstorm bolt. Dismissal leaves the icon; stale, cleared, expired, or disabled forecasts remove it.
- Removed the SuperBar sound setting and all audio API calls. Busy’s native calendar settings remain separate.
- Build, syntax/schema checks, formatting, and all 42 tests pass, including the packaged device bundle. Tests check the 30-second boundary, dismissal, quiet hours, stale/disabled/expired forecasts, thunderstorm codes, no audio requests, clock/reminder pixel preservation across a full day, and timer value/progress preservation.
- Actual front renderer inspected for the message, rain icon, and storm icon. Simulator source bundled for isolated browser checks with synthetic data at 1440 px and 390 px; no horizontal overflow or JavaScript errors. Live simulator controls also checked at desktop width. Collaborative browser screenshots and resizing failed, so the isolated renderer was used for visual checks.
- Not installed or verified on hardware: the Bar did not answer at `10.0.4.20`. Existing saved settings are preserved; an installation with previously saved alerts-off or 20-second settings must be changed to alerts-on and 30 seconds.

## Hardware — October 27, 2026

BUSY Bar BB.1, firmware 1.3.1 (API 27.14.0), over USB at `10.0.4.20`.

- Install and launch: passed with `npm run app:install`. `busy-cli app install` fails because Node’s fetch rejects the Bar’s responses; see `scripts/bar.mjs`.
- First run froze on the firmware’s “Loading…” screen: JerryScript is built without Annex B, so `String.prototype.substr` is undefined and every draw threw. Fixed; `npm run check` now rejects Annex B methods in device code.
- Front and back rendering match the simulator, including text placement (cap top = `y + ascent − cap`). Live weather appears on both displays.
- Render cost on the device: about 450 ms for the first frame, 150 ms per view change, and 30 ms for an idle tick (was 450 ms per tick before caching).
- Start (setup, start, pause, resume), Back (to clock, quit), and the wheel (`up`/`down` in the input API) work.
- Short Back clears the app’s canvas in firmware. The app now redraws everything after Back and every 30 seconds.
- The back display’s status column covers x 149–158; back text now ends at x 145.
- Default 128 KiB heap: no errors over several runs with weather active.
- World clocks from the Bar’s `tzlist`: NYC, London, and Tokyo correct on both displays.
- The simulator page loads settings from the Bar and sends them back (CORS allowed by the Bar).
- The agent-status companion was removed and archived in `archive/companion/`.
- Not yet verified: long OK and long Back (the input API sends only clicks), calendar overlays, and Wi-Fi loss. Audio support was removed on November 2.

## Software — October 26, 2026

- Front display redrawn with BUSY firmware 1.3.1 fonts (`small`, `normal`, `condensed`, `extra_large`), extracted from the firmware TTFs. The fonts and the API font-name mapping are identical on the `1.3.1` tag and `dev`.
- `npm run build`: passed. Package about 13 KB; bundled `main.js` about 35 KB, of which about 14 KB is glyph data.
- `npm test`: 38 tests passed, including the packaged bundle with only documented device globals mocked.
- `npm run check` and `npm run format:check`: passed.
- Every front view rendered as ASCII and in the browser simulator. Setup page checked at 1440 px and 390 px with no horizontal overflow.
