const axios = require('axios');
const env = require('../config/env');
const { haversineKm } = require('../utils/geo');

async function drivingDistanceKm(a, b) {
  // a,b: [lng,lat]
  if (!env.googleMaps.apiKey || !env.googleMaps.useDistanceMatrix) {
    return haversineKm(a, b);
  }
  const origins = `${a[1]},${a[0]}`;
  const destinations = `${b[1]},${b[0]}`;
  const url = 'https://maps.googleapis.com/maps/api/distancematrix/json';
  const { data } = await axios.get(url, {
    params: {
      origins,
      destinations,
      key: env.googleMaps.apiKey,
      mode: 'driving'
    },
    timeout: 8000
  });
  const el = data?.rows?.[0]?.elements?.[0];
  if (el && el.status === 'OK' && el.distance?.value) {
    return el.distance.value / 1000;
  }
  return haversineKm(a, b);
}

module.exports = { drivingDistanceKm };
