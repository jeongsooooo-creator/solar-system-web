/* Astronomy calculations run off the UI thread. */
'use strict';
importScripts('vendor/astronomy.browser.min.js');
const cache = new Map();
const A = Astronomy;
const AU_KM = 149597870.7;
function dayStartKST(ms) {
  const day = new Date(ms + 9 * 3600000).toISOString().slice(0, 10);
  return new Date(day + 'T00:00:00+09:00');
}
function events(date, observer) {
  const start = dayStartKST(date.getTime());
  const key = [start.getTime(), observer.latitude, observer.longitude].join(':');
  if (cache.has(key)) return cache.get(key);
  const result = {};
  for (const body of ['Sun', 'Moon']) {
    result[body] = {};
    for (const [name, dir] of [['rise', 1], ['set', -1]]) {
      const event = A.SearchRiseSet(body, observer, dir, start, 1);
      result[body][name] = event && event.date.getTime() < start.getTime() + 86400000 ? event.date.getTime() : null;
    }
  }
  if (cache.size >= 64) cache.delete(cache.keys().next().value);
  cache.set(key, result);
  return result;
}
function calculate(ms, lat, lon) {
  const date = new Date(ms), observer = new A.Observer(lat, lon, 0);
  const data = {};
  for (const body of ['Sun', 'Moon']) {
    const eq = A.Equator(body, date, observer, true, true);
    const horizon = A.Horizon(date, observer, eq.ra, eq.dec, 'normal');
    data[body] = {az: horizon.azimuth, alt: horizon.altitude, dec: eq.dec, ra: eq.ra};
  }
  const earth = A.Ecliptic(A.HelioVector('Earth', date));
  const moonVector = A.GeoVector('Moon', date, true);
  const moon = A.Ecliptic(moonVector);
  const moonEq = A.Equator('Moon', date, observer, false, true);
  const sunEq = A.Equator('Sun', date, observer, false, true);
  const earthVector = A.HelioVector('Earth', date);
  data.earth = {lon: earth.elon, lat: earth.elat, distance: earthVector.Length(), dec: sunEq.dec};
  data.moon = {lon: moon.elon, lat: moon.elat, distance: moonVector.Length() * AU_KM, dec: moonEq.dec};
  data.phase = A.MoonPhase(date);
  data.fraction = A.Illumination('Moon', date).phase_fraction;
  return data;
}
self.onmessage = ({data: request}) => {
  try {
    const {id, ms, lat, lon, lead = 0} = request;
    const current = calculate(ms, lat, lon);
    const future = lead ? calculate(ms + lead, lat, lon) : current;
    const times = events(new Date(ms), new A.Observer(lat, lon, 0));
    self.postMessage({id, ms, current, future, times});
  } catch (error) {
    self.postMessage({id: request.id, error: String(error.message || error)});
  }
};
