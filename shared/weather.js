export function weatherURL(c) {
  const { lat, lon } = c.location;
  return (
    'https://api.open-meteo.com/v1/forecast?latitude=' +
    lat +
    '&longitude=' +
    lon +
    '&current=temperature_2m&hourly=precipitation_probability,weather_code&daily=sunrise,sunset&forecast_days=2&timeformat=unixtime&timezone=auto'
  );
}
export function parseWeather(data, now, threshold = 60) {
  const temp = data.current?.temperature_2m;
  if (!Number.isFinite(temp)) throw new Error('Invalid weather');
  const times = data.hourly?.time || [],
    probs = data.hourly?.precipitation_probability || [];
  let rainAt = null,
    rainProbability = 0,
    rainKind = 'rain';
  for (let i = 0; i < Math.min(times.length, 48); i++) {
    const t = times[i] * 1000;
    if (t >= now && t - now <= 3600000 && probs[i] >= threshold) {
      rainAt = t;
      rainProbability = probs[i];
      const code = (data.hourly.weather_code || [])[i];
      rainKind = [95, 96, 97, 99].includes(code) ? 'storm' : 'rain';
      break;
    }
  }
  const sunset = (data.daily?.sunset || []).find(t => t * 1000 > now);
  return {
    temperature: temp,
    rainAt,
    rainProbability,
    rainKind,
    sunset: sunset ? sunset * 1000 : null,
    fetchedAt: now,
  };
}
