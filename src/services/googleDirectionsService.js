const axios = require('axios');
const env = require('../config/env');

function coordToStr(coord) {
  // coord: [lng, lat]
  return `${coord[1]},${coord[0]}`;
}

/**
 * ✅ Google Maps Real-Time Routing (Directions API waypoint optimization)
 *
 * Returns optimized waypoint order indexes for the provided points.
 * To optimize all points, we keep the first point as origin and request destination=origin.
 */
async function optimizeWaypointOrder({ points }) {
  // points: array of [lng, lat]
  if (!env.googleMaps.apiKey) throw new Error('GOOGLE_MAPS_API_KEY is not set');
  if (!Array.isArray(points) || points.length < 2) return { waypointOrder: [], totalKm: 0 };

  const origin = coordToStr(points[0]);
  const destination = origin;
  const waypoints = points.slice(1).map(coordToStr).join('|');

  const url = 'https://maps.googleapis.com/maps/api/directions/json';
  const params = {
    origin,
    destination,
    waypoints: `optimize:true|${waypoints}`,
    key: env.googleMaps.apiKey
  };

  const { data } = await axios.get(url, { params, timeout: 10000 });
  const route = data?.routes?.[0];
  const waypointOrder = route?.waypoint_order || [];

  // Total distance (meters) across legs
  let meters = 0;
  for (const leg of route?.legs || []) {
    if (leg?.distance?.value) meters += Number(leg.distance.value);
  }

  return { waypointOrder, totalKm: meters / 1000 };
}

module.exports = { optimizeWaypointOrder };
