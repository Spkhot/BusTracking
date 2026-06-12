// Geocoding Service — OpenStreetMap Nominatim
// Rules:
//   - Max 1 request/second (rate limiter enforced)
//   - User-Agent header required by Nominatim policy
//   - Coordinates cached in StopMaster (never geocoded twice for same name)
//
// Strategy for Karnataka village names:
//   1. "Kurli, Belgaum, Karnataka, India"   ← most specific
//   2. "Kurli, Karnataka, India"
//   3. "Kurli, India"
//   4. Nominatim viewbox restricted to Karnataka bounding box

const StopMaster = require('../models/StopMaster');
const NOMINATIM = 'https://nominatim.openstreetmap.org/search';

// Karnataka bounding box for viewbox filter (helps avoid wrong-state results)
const KA_BBOX = 'viewbox=74.0,11.5,78.6,18.5&bounded=0';

let lastRequestMs = 0;
async function waitRateLimit() {
  const elapsed = Date.now() - lastRequestMs;
  if (elapsed < 1300) await new Promise(r => setTimeout(r, 1300 - elapsed));
  lastRequestMs = Date.now();
}

async function nominatimFetch(query, extra = '') {
  await waitRateLimit();
  const url = `${NOMINATIM}?q=${encodeURIComponent(query)}&format=json&limit=3&countrycodes=in${extra ? '&' + extra : ''}`;
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'KSRTC-NippaniDepot-Tracker/2.0 (bus.tracking@nippanidepot.ksrtc.in)',
        'Accept': 'application/json'
      }
    });
    if (!res.ok) return [];
    return await res.json();
  } catch (err) {
    console.error(`Nominatim fetch error:`, err.message);
    return [];
  }
}

// Geocode a stop name with Karnataka-specific strategies
async function geocodeStop(name, districtHint = '', stateHint = 'Karnataka') {
  const attempts = [
    districtHint
      ? `${name}, ${districtHint}, ${stateHint}, India`
      : `${name}, Belagavi, ${stateHint}, India`,   // Nippani depot is in Belagavi district
    `${name}, ${stateHint}, India`,
    `${name}, India`
  ];

  for (const q of attempts) {
    // Try with Karnataka bounding box first, then without
    for (const extra of [KA_BBOX, '']) {
      const results = await nominatimFetch(q, extra);
      if (results.length > 0) {
        // Prefer results that mention India in display_name
        const best = results.find(r => r.display_name.includes('India')) || results[0];
        console.log(`✅ "${name}" → ${parseFloat(best.lat).toFixed(5)}, ${parseFloat(best.lon).toFixed(5)} [${best.display_name.slice(0, 60)}]`);
        return { latitude: parseFloat(best.lat), longitude: parseFloat(best.lon) };
      }
    }
  }

  console.warn(`❌ Geocode failed for: "${name}"`);
  return null;
}

// Main entry point — called from API when admin adds a stop
// Returns { master, latitude, longitude }
async function resolveStopCoords(name, districtHint = '', stateHint = 'Karnataka') {
  const nameKey = name.toLowerCase().trim();

  let master = await StopMaster.findOne({ nameKey });

  // Cache hit — already geocoded
  if (master?.geocodeStatus === 'found' && master.latitude !== null) {
    return { master, latitude: master.latitude, longitude: master.longitude };
  }

  // Too many failures — don't keep hammering Nominatim
  if (master?.geocodeAttempts >= 3 && master?.geocodeStatus === 'failed') {
    console.warn(`Skipping geocode for "${name}" — too many prior failures`);
    return { master, latitude: null, longitude: null };
  }

  // Create StopMaster record if new
  if (!master) {
    master = await StopMaster.create({
      name: name.trim(),
      nameKey,
      stateHint,
      geocodeStatus: 'pending',
      geocodeAttempts: 0
    });
  }

  console.log(`🌐 Geocoding: "${name}"...`);
  await StopMaster.findByIdAndUpdate(master._id, { $inc: { geocodeAttempts: 1 } });

  const coords = await geocodeStop(name, districtHint, stateHint);

  if (coords) {
    await StopMaster.findByIdAndUpdate(master._id, {
      latitude: coords.latitude,
      longitude: coords.longitude,
      geocodeStatus: 'found'
    });
    master.latitude  = coords.latitude;
    master.longitude = coords.longitude;
    master.geocodeStatus = 'found';
    return { master, latitude: coords.latitude, longitude: coords.longitude };
  } else {
    await StopMaster.findByIdAndUpdate(master._id, { geocodeStatus: 'failed' });
    return { master, latitude: null, longitude: null };
  }
}

// Retry geocoding — resets failure count first
async function retryGeocode(name, districtHint = '') {
  const nameKey = name.toLowerCase().trim();
  await StopMaster.findOneAndUpdate(
    { nameKey },
    { geocodeStatus: 'pending', geocodeAttempts: 0 },
    { upsert: false }
  );
  return resolveStopCoords(name, districtHint);
}

module.exports = { resolveStopCoords, retryGeocode, geocodeStop };
