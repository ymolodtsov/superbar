// World-clock offsets from the Bar's own time-zone database (GET /api/time/tzlist, firmware
// 1.3.1). The list is keyed by city name ("New York") and gives each zone's current offset.
const HALF_HOUR = 1800000;

// IANA cities missing from the Bar's list, mapped to a listed city with identical rules.
const ALIASES = {
  lisbon: 'london',
  dublin: 'london',
  paris: 'berlin',
  vienna: 'berlin',
  zurich: 'berlin',
  stockholm: 'berlin',
  oslo: 'berlin',
  copenhagen: 'berlin',
  prague: 'berlin',
  warsaw: 'berlin',
  budapest: 'berlin',
  kiev: 'kyiv',
  'tel aviv': 'jerusalem',
  riyadh: 'kuwait',
  qatar: 'kuwait',
  doha: 'kuwait',
  johannesburg: 'harare',
  lagos: 'brazzaville',
  kolkata: 'delhi',
  calcutta: 'delhi',
  mumbai: 'delhi',
  kathmandu: 'katmandu',
  yangon: 'rangoon',
  'ho chi minh': 'bangkok',
  saigon: 'bangkok',
  singapore: 'kuala lumpur',
  shanghai: 'beijing',
  manila: 'taipei',
  melbourne: 'sydney',
  canberra: 'sydney',
  wellington: 'auckland',
  toronto: 'new york',
  montreal: 'new york',
  detroit: 'new york',
  dallas: 'chicago',
  austin: 'chicago',
  calgary: 'denver',
  edmonton: 'denver',
  vancouver: 'los angeles',
  seattle: 'los angeles',
  'las vegas': 'los angeles',
  lima: 'bogota',
};

// "America/New_York", "New York", and "new_york" all become "new york".
export function zoneKey(name) {
  return String(name || '')
    .split('/')
    .pop()
    .replace(/_/g, ' ')
    .trim()
    .toLowerCase();
}

function minutes(offset) {
  const m = /^([+-])(\d{2}):(\d{2})$/.exec(String(offset));
  return m ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) : null;
}

// Offsets change only at UTC :00 or :30, so a list stays valid until the next boundary. A short
// grace period covers the refresh that runs just after it.
export function parseZoneList(data, now) {
  const offsets = {};
  for (const z of (data && data.list) || []) {
    const m = minutes(z && z.offset);
    if (z && z.name && m !== null) offsets[zoneKey(z.name)] = m;
  }
  const boundary = Math.floor(now / HALF_HOUR) * HALF_HOUR + HALF_HOUR;
  return { fetchedAt: now, validUntil: boundary + 120000, refreshAt: boundary + 10000, offsets };
}

export function zoneOffset(zones, zone, now) {
  if (!zones || now >= zones.validUntil) return null;
  const key = zoneKey(zone);
  const offset = key in zones.offsets ? zones.offsets[key] : zones.offsets[ALIASES[key]];
  return Number.isFinite(offset) ? offset : null;
}
