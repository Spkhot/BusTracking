// Stop Detection Service — v2
//
// Called on every GPS update. Determines which stop the bus is currently at
// or approaching, using:
//   1. REACH_RADIUS_M threshold: a stop is "reached" only when bus is within
//      this distance (default 150m). This prevents premature stop switching
//      when the bus is still 2km away from the next stop.
//   2. Monotonic forward-only progression: stop index can only increase.
//      Bus cannot "go back" to a previous stop.
//   3. Stops without coordinates are skipped in distance calculation.
//
// Returns:
//   { currentStopIdx, nearestStopName, nearestDistanceM, reachedNewStop }

const Stop = require('../models/Stop');

const REACH_RADIUS_M = parseInt(process.env.STOP_REACH_RADIUS_M || '150', 10);

function distanceMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Cache of variant stops to avoid hitting MongoDB on every GPS ping.
 * Format: variantId(string) → { stops: Stop[], loadedAt: timestamp }
 * TTL: 5 minutes (stops rarely change during an active trip)
 */
const stopCache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000;

async function getStopsForVariant(variantId) {
  const vid = variantId.toString();
  const cached = stopCache.get(vid);
  if (cached && (Date.now() - cached.loadedAt) < CACHE_TTL_MS) {
    return cached.stops;
  }
  const stops = await Stop.find({ variantId: vid }).sort({ order: 1 }).lean();
  stopCache.set(vid, { stops, loadedAt: Date.now() });
  return stops;
}

// Invalidate cache when stops change (called from admin routes)
function invalidateStopCache(variantId) {
  if (variantId) stopCache.delete(variantId.toString());
}

async function detectCurrentStop(variantId, busLat, busLng, lastKnownStopIdx = 0) {
  const stops = await getStopsForVariant(variantId);

  if (!stops.length) {
    return { currentStopIdx: 0, nearestStopName: null, nearestDistanceM: null, reachedNewStop: false, stops };
  }

  // Only consider stops from lastKnownStopIdx onwards (monotonic rule)
  // We also check one stop behind to handle GPS jitter near stop boundaries
  const fromIdx = Math.max(0, lastKnownStopIdx - 1);

  let newStopIdx = lastKnownStopIdx;
  let nearestDistanceM = Infinity;
  let nearestStopName = stops[lastKnownStopIdx]?.name || null;
  let reachedNewStop = false;

  for (let i = fromIdx; i < stops.length; i++) {
    const s = stops[i];
    if (s.latitude === null || s.longitude === null) continue; // no coords yet

    const d = distanceMeters(busLat, busLng, s.latitude, s.longitude);

    // Only advance to a new stop if bus is within REACH_RADIUS_M of it
    if (d <= REACH_RADIUS_M && i >= lastKnownStopIdx) {
      if (i > lastKnownStopIdx) reachedNewStop = true;
      newStopIdx = i;
      nearestDistanceM = Math.round(d);
      nearestStopName  = s.name;
      // Don't break — in case bus is even closer to a further stop (shouldn't happen often)
    }

    // Track overall nearest for reporting (even if outside radius)
    if (d < nearestDistanceM && i === lastKnownStopIdx) {
      nearestDistanceM = Math.round(d);
      nearestStopName  = s.name;
    }
  }

  // If no stop was within radius, stay at lastKnownStopIdx
  // but report the nearest stop distance for the status display
  if (newStopIdx === lastKnownStopIdx && nearestDistanceM === Infinity) {
    // Find nearest among geocoded stops for display purposes only
    let minD = Infinity;
    for (let i = lastKnownStopIdx; i < stops.length; i++) {
      const s = stops[i];
      if (s.latitude === null || s.longitude === null) continue;
      const d = distanceMeters(busLat, busLng, s.latitude, s.longitude);
      if (d < minD) { minD = d; nearestStopName = s.name; }
    }
    nearestDistanceM = minD < Infinity ? Math.round(minD) : null;
  }

  return {
    currentStopIdx: newStopIdx,
    nearestStopName,
    nearestDistanceM,
    reachedNewStop,
    stops
  };
}

module.exports = { detectCurrentStop, distanceMeters, invalidateStopCache };
