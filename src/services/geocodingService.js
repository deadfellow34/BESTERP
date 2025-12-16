/**
 * Geocoding Service
 * Converts coordinates to country/city using Nominatim (OpenStreetMap)
 * Includes caching to avoid rate limiting
 */

const axios = require('axios');

// Simple in-memory cache for geocoding results
// Key: "lat,lng" rounded to 2 decimal places, Value: { country, city, timestamp }
const geocodeCache = {};
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

/**
 * Round coordinates for caching (reduces cache entries while maintaining accuracy)
 */
function roundCoord(coord, decimals = 2) {
  return Number(Number(coord).toFixed(decimals));
}

/**
 * Get cached result if available and not expired
 */
function getCached(lat, lng) {
  const key = `${roundCoord(lat)},${roundCoord(lng)}`;
  const cached = geocodeCache[key];
  
  if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
    return cached;
  }
  
  return null;
}

/**
 * Store result in cache
 */
function setCache(lat, lng, country, city) {
  const key = `${roundCoord(lat)},${roundCoord(lng)}`;
  geocodeCache[key] = {
    country,
    city,
    timestamp: Date.now()
  };
}

/**
 * Reverse geocode a single coordinate
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @returns {Promise<{country: string, city: string}>}
 */
async function reverseGeocode(lat, lng) {
  // Check cache first
  const cached = getCached(lat, lng);
  if (cached) {
    return { country: cached.country, city: cached.city };
  }
  
  try {
    // Use Nominatim API (free, but rate limited - 1 request per second)
    // accept-language=tr,en forces Turkish or English results
    const response = await axios.get('https://nominatim.openstreetmap.org/reverse', {
      params: {
        format: 'json',
        lat: lat,
        lon: lng,
        zoom: 10, // city level
        addressdetails: 1,
        'accept-language': 'tr,en'  // Prefer Turkish, fallback to English
      },
      headers: {
        'User-Agent': 'BestFreight-ERP/1.0', // Required by Nominatim ToS
        'Accept-Language': 'tr,en'  // Also set in header
      },
      timeout: 5000
    });
    
    if (response.data && response.data.address) {
      const addr = response.data.address;
      const country = addr.country || '';
      const city = addr.city || addr.town || addr.village || addr.municipality || addr.county || '';
      
      // Cache the result
      setCache(lat, lng, country, city);
      
      return { country, city };
    }
    
    return { country: '', city: '' };
  } catch (err) {
    console.error('[Geocoding] Error:', err.message);
    return { country: '', city: '' };
  }
}

/**
 * Batch reverse geocode multiple coordinates
 * @param {Array<{truckPlate: string, latitude: number, longitude: number}>} locations
 * @returns {Promise<Object>} - { truckPlate: { country, city } }
 */
async function batchReverseGeocode(locations) {
  const results = {};
  
  // Process sequentially to respect rate limits (1 req/sec for Nominatim)
  for (const loc of locations) {
    if (loc.latitude && loc.longitude) {
      // Check cache first (instant)
      const cached = getCached(loc.latitude, loc.longitude);
      if (cached) {
        results[loc.truckPlate] = { country: cached.country, city: cached.city };
        continue;
      }
      
      // Make API request (with delay for rate limiting)
      const result = await reverseGeocode(loc.latitude, loc.longitude);
      results[loc.truckPlate] = result;
      
      // Wait 1 second between requests to respect Nominatim rate limit
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  return results;
}

/**
 * Get location info for truck plates (coordinates + geocoded location)
 * @param {Object} locationsMap - { truckPlate: { latitude, longitude, recorded_at } }
 * @returns {Promise<Object>} - { truckPlate: { latitude, longitude, country, city, recorded_at } }
 */
async function enrichLocationsWithGeocode(locationsMap) {
  const enriched = {};
  
  for (const [truckPlate, loc] of Object.entries(locationsMap)) {
    if (loc.latitude && loc.longitude) {
      const cached = getCached(loc.latitude, loc.longitude);
      
      if (cached) {
        enriched[truckPlate] = {
          ...loc,
          country: cached.country,
          city: cached.city
        };
      } else {
        // Make API request
        const geo = await reverseGeocode(loc.latitude, loc.longitude);
        enriched[truckPlate] = {
          ...loc,
          country: geo.country,
          city: geo.city
        };
        // Rate limit
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }
  
  return enriched;
}

module.exports = {
  reverseGeocode,
  batchReverseGeocode,
  enrichLocationsWithGeocode
};
