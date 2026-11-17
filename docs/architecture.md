# Architecture and decisions

Verified against official Busy documentation on October 26, 2026.

## Device

One installed JS app, `me.molodtsov.superbar`, owns a shared state machine. It draws the front screen as a single 72×16 XPM bitmap and the rear screen as native text elements. Both use BUSY's own fonts: the firmware maps API font names to TTFs in `api_display.c` (`small` → `busy_regular_5`, `normal` → `busy_regular_7`, `condensed` → `busy_condensed_7`, `extra_large` → `busy_bold_10`). Those TTFs use 16 units per em and are converted at size 16, so `scripts/extract-fonts.py` can extract exact 1-bit glyphs for the front bitmap and the simulator. Stable IDs allow only changed elements to be sent. There is at most one display request and one poll sequence in flight; failures back off. Device requests use `http://localhost/api`.

A one-second tick handles timers and input grace periods. Ordinary clock frames change only on the minute. Settings and time are refreshed once a minute and every five minutes respectively; weather every ten minutes; world-clock offsets every half hour. The app never accesses Node, the DOM, or Intl; time-zone offsets come from the Bar’s own database.

The front uses three layouts on one grid. Large values use `extra_large` with cap rows 3–12. Small text sits on rows 2–6 and 8–12, so the lower line shares the large digits' baseline, and row 15 is reserved for the timer bar. The clock has a side column at x=43: date on top, week left and temperature right below; week drops out when both do not fit. A pinned reminder replaces that column. Hero views (timer, weather, world, rain, countdown) put the value at x=3 and a label/detail pair to its right. Text views (reminder) put a small label above one line of `normal` or `condensed` text. Overlong text is shortened at a word boundary with an ellipsis. The back display scrolls long notes natively. There is no rotating carousel or generative content.

Display priority stays at 50. Native BUSY/CUSTOM sessions have priority 90. Calendar coexistence relies on Busy’s documented always-on-top event behavior and still needs a real-device smoke test.

## Calendar decision

Busy already supports multiple Google accounts and calendars through its cloud integration, with event reminders and meeting countdowns. Its published account OpenAPI schema at `https://api.busy.app/openapi.json` listed only `/timer/v1/snapshot` and `/timer/v1/profiles`; the embedded JS API allowlist did not expose calendar event enumeration.

The user explicitly rejected adding Google OAuth setup. Therefore SuperBar uses existing Busy overlays and does not implement a separate Google or iCloud connection, an ICS feed, or a custom free-time calculation. Do not reintroduce these without a new request. Never scrape Busy account cookies or tokens.

## World clocks and settings

The Bar reads current offsets from its own `GET /api/time/tzlist` (firmware 1.3.1) just after every UTC :00 and :30, the only times offsets change; a list expires two minutes after the next boundary. The simulator page reads and writes SuperBar’s settings directly through the Bar’s `GET`/`PUT /api/apps/settings`, which allow cross-origin requests; the device itself needs only read access.

An agent-status companion existed until October 27, 2026 and is archived in `archive/companion/`.

## Remaining hardware verification

Verified on firmware 1.3.1: installation, default heap, render cost, front/back rendering, wheel, Start, and Back. Still open:

- Exercise long OK and firmware-controlled long Back on the device; the input API sends only short clicks.
- Check native BUSY and Google Calendar overlay entry, exit, and app resumption.
- Disconnect Wi-Fi, then restore it; verify cached data, backoff, and recovery.
- If localStorage exists, restart during a running/paused timer and after dismissing an alert.
