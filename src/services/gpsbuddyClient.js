const axios = require('axios');

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function parseGpsBuddyDate(value) {
  if (!value) return null;

  // /Date(1765890186000)/
  if (typeof value === 'string') {
    const m = value.match(/\/Date\((\d+)\)\//);
    if (m && m[1]) {
      const ms = Number(m[1]);
      if (!Number.isNaN(ms)) return new Date(ms).toISOString();
    }

    // ISO or other date string
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
    return null;
  }

  if (typeof value === 'number') {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }

  return null;
}

function normalizeVehicle(row) {
  const plate = (row.vehiclename || row.plate || '').toString().trim();
  const timeIndicatorIso = parseGpsBuddyDate(row.time_indicator) || null;

  const velocityRaw = row.velocity;
  const velocity = velocityRaw == null || velocityRaw === '' ? null : Math.round(Number(velocityRaw));

  return {
    vehicleid: row.vehicleid != null ? Number(row.vehicleid) : null,
    plate: plate || null,
    drivername: row.drivername != null ? String(row.drivername).trim() || null : null,
    latitude: row.latitude != null ? Number(row.latitude) : null,
    longitude: row.longitude != null ? Number(row.longitude) : null,
    velocity: Number.isFinite(velocity) ? velocity : null,
    address: row.address != null ? String(row.address).trim() || null : null,
    location: row.location != null ? String(row.location).trim() || null : null,
    direction: row.direction != null ? Number(row.direction) : null,
    time_indicator: timeIndicatorIso,
    drivetime: row.drivetime != null ? Number(row.drivetime) : null,
    worktime: row.worktime != null ? Number(row.worktime) : null,
    idletime: row.idletime != null ? Number(row.idletime) : null,
    stoptime: row.stoptime != null ? Number(row.stoptime) : null,
    totaldistance: row.totaldistance != null ? Number(row.totaldistance) : null,
    start_km: row.start_km != null ? Number(row.start_km) : null,
    flags: row.flags != null ? Number(row.flags) : null,
    communication: row.communication != null ? !!row.communication : null,
    colorcode: row.colorcode != null ? String(row.colorcode).trim() || null : null,
  };
}

function extractVehicleArray(payload) {
  if (!payload) return [];
  // Known shapes (observed in logs)
  return (
    payload.help_ws_gpsb_unitvehicle_filter ||
    payload.gpsb_unitvehicle_filter_by_group ||
    payload.gpsb_unitvehicle_filter ||
    payload.unitvehicle_filter ||
    payload.data ||
    []
  );
}

// In-memory token cache
const tokenCache = {
  token: null,
  expiresAt: 0,
};

async function httpGetJson(url, params, timeoutMs) {
  const res = await axios.get(url, {
    params,
    timeout: timeoutMs,
    // Some endpoints sometimes respond with text; axios will still try JSON if content-type is json.
    transformResponse: data => data,
    validateStatus: status => status >= 200 && status < 300,
  });

  if (typeof res.data === 'string') {
    try {
      return JSON.parse(res.data);
    } catch (_) {
      return res.data;
    }
  }
  return res.data;
}

function tryExtractToken(responseData) {
  if (!responseData) return null;

  // If JSON
  if (typeof responseData === 'object') {
    // Handle { success: "token" } or { success: { token: "..." } } patterns
    const successVal = responseData.success || responseData.Success;
    if (typeof successVal === 'string' && successVal.trim()) {
      return successVal.trim();
    }
    if (successVal && typeof successVal === 'object') {
      const nested = successVal.token || successVal.Token || successVal.sessionToken || successVal.SessionToken;
      if (typeof nested === 'string' && nested.trim()) return nested.trim();
    }

    const candidates = [
      responseData.token,
      responseData.Token,
      responseData.sessionToken,
      responseData.SessionToken,
      // Common WCF / SOAP JSON wrappers
      responseData.d,
      responseData.D,
      responseData.InitializeSessionResult,
      responseData.initializesessionresult,
      responseData.result,
      responseData.data,
      responseData.Data,
      responseData.InitializeSessionResult && responseData.InitializeSessionResult.token,
      responseData.InitializeSessionResult && responseData.InitializeSessionResult.Token,
    ];
    const t = candidates.find(v => typeof v === 'string' && v.trim());
    if (t) return t.trim();
  }

  // If XML/text
  if (typeof responseData === 'string') {
    const s = responseData;
    
    // GPSBuddy current format: <success><function>InitializeSession</function><token>TOKEN</token></success>
    const mToken = s.match(/<token>([^<]+)<\/token>/i);
    if (mToken && mToken[1]) return mToken[1].trim();
    
    // Old format: <InitializeSession>TOKEN</InitializeSession>
    const m0 = s.match(/<InitializeSession>([^<]+)<\/InitializeSession>/i);
    if (m0 && m0[1]) return m0[1].trim();
    
    const m2 = s.match(/<Token>([^<]+)<\/Token>/i);
    if (m2 && m2[1]) return m2[1].trim();
    const m3 = s.match(/<string[^>]*>([^<]+)<\/string>/i);
    if (m3 && m3[1]) return m3[1].trim();

    // Some servers just return the token as plain text (UUID-like format)
    const plain = s.trim();
    // GPSBuddy tokens are UUID format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
    if (plain && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(plain)) {
      return plain;
    }
    // Also check if it's plain text without XML/JSON markers
    if (plain && plain.length >= 12 && !plain.startsWith('<') && !plain.startsWith('{') && !plain.startsWith('[')) {
      return plain;
    }
  }

  return null;
}

function summarizeInitializeSessionResponse(data) {
  try {
    if (data == null) return 'null';
    if (typeof data === 'string') {
      const s = data.replace(/\s+/g, ' ').trim();
      return s.length > 240 ? s.slice(0, 240) + '…' : s;
    }
    if (typeof data === 'object') {
      const keys = Object.keys(data);
      const head = keys.slice(0, 12).join(', ');
      return `object keys=[${head}${keys.length > 12 ? ', …' : ''}]`;
    }
    return String(data);
  } catch (_) {
    return 'unavailable';
  }
}

async function ensureToken(env) {
  const now = Date.now();
  if (tokenCache.token && tokenCache.expiresAt > now + 60 * 1000) {
    return tokenCache.token;
  }

  // GPSBuddy API docs: http://webservice.gps-buddy.com/Service/InitializeSession
  const url = `${env.baseUrl.replace(/\/$/, '')}/Service/InitializeSession`;

  // Per API docs: isToken=0, returnType=xml for token retrieval
  const paramVariants = [
    {
      login: env.username,
      password: env.password,
      isToken: 0,
      timeout: 25,
      returnType: 'xml',
    },
    {
      login: env.username,
      password: env.password,
      isToken: 0,
      timeout: 25,
      returnType: 'json',
    },
  ];

  const maxAttempts = 3; // 1 + 2 retries
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      let data = null;
      let token = null;

      for (const params of paramVariants) {
        data = await httpGetJson(url, params, 10000);
        token = tryExtractToken(data);
        if (token) break;
      }

      if (!token) {
        const summary = summarizeInitializeSessionResponse(data);
        throw new Error(`GPSBuddy token alınamadı (InitializeSession response parse edilemedi). Response: ${summary}`);
      }

      tokenCache.token = token;
      // Token TTL isn't explicit here; keep it conservative.
      tokenCache.expiresAt = Date.now() + 20 * 60 * 1000;
      return token;
    } catch (e) {
      lastError = e;
      if (attempt < maxAttempts) {
        await sleep(250 * attempt);
      }
    }
  }

  throw lastError || new Error('GPSBuddy InitializeSession başarısız');
}

/**
 * Call a GPSBuddy function.
 * GPSBuddy supports two auth modes:
 *   1. Token-based: first call InitializeSession, then pass token param
 *   2. Direct login/password on each call (simpler, works for most endpoints)
 *
 * We try direct login/password first (as it works reliably), then fall back to token if needed.
 */
async function callFunction(env, functionName, params, options = {}) {
  const url = `${env.baseUrl.replace(/\/$/, '')}/${functionName}`;

  const maxAttempts = 3;
  let lastError = null;

  // Strategy 1: Direct login/password (preferred - works for most endpoints)
  const directParams = {
    login: env.username,
    password: env.password,
    returnType: 'json',
    timeout: 25,
    ...params,
  };

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const result = await httpGetJson(url, directParams, 15000);
      // Check if this auth method failed
      if (result && result.error && (result.error.code === 'MI001' || result.error.message?.includes('login'))) {
        // Auth failed with direct login, try token method
        break;
      }
      return result;
    } catch (e) {
      lastError = e;
      if (attempt < maxAttempts) {
        await sleep(250 * attempt);
      }
    }
  }

  // Strategy 2: Token-based auth (fallback)
  if (!options.skipTokenFallback) {
    try {
      const token = await ensureToken(env);
      const tokenParams = {
        token,
        returnType: 'json',
        timeout: 10,
        ...params,
      };

      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
          return await httpGetJson(url, tokenParams, 10000);
        } catch (e) {
          lastError = e;
          if (attempt < maxAttempts) {
            await sleep(250 * attempt);
          }
        }
      }
    } catch (tokenErr) {
      // Token fetch failed, use last error from direct method
      if (!lastError) lastError = tokenErr;
    }
  }

  throw lastError || new Error(`GPSBuddy request failed: ${functionName}`);
}

/**
 * Build XML request body for GPSBuddy ExecuteReturnSet endpoint
 */
function buildRoutineXml(functionName, args = {}) {
  const argElements = Object.entries(args)
    .map(([key, val]) => `<${key}>${val}</${key}>`)
    .join('');

  return `<_routines><_routine><_name>${functionName}</_name><_arguments>${argElements}</_arguments></_routine><_returnType>json</_returnType><_parallelExecution>0</_parallelExecution><_compression>0</_compression><_jsonDateFormat>0</_jsonDateFormat></_routines>`;
}

/**
 * Call GPSBuddy via ExecuteReturnSet endpoint (the correct way per API docs)
 * This sends XML in a 'value' query parameter along with token
 * Per docs: http://webservice.gps-buddy.com/Service/ExecuteReturnSet?value=[URL-encoded-XML]&token=[token]
 */
async function executeReturnSet(env, functionName, args = {}) {
  const token = await ensureToken(env);
  const xml = buildRoutineXml(functionName, args);
  // GPSBuddy API docs: endpoint is /Service/ExecuteReturnSet
  const url = `${env.baseUrl.replace(/\/$/, '')}/Service/ExecuteReturnSet`;

  const maxAttempts = 3;
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const result = await httpGetJson(url, { value: xml, token }, 20000);
      return result;
    } catch (e) {
      lastError = e;
      if (attempt < maxAttempts) {
        await sleep(250 * attempt);
      }
    }
  }

  throw lastError || new Error(`GPSBuddy ExecuteReturnSet failed: ${functionName}`);
}

async function fetchLiveVehicles(env) {
  // Function names to try - per API docs, gpsb_unitvehicle_filter_2 is used with compression
  // gpsb_unitvehicle_filter is the basic version
  const candidates = [
    env.liveEndpoint,
    'gpsb_unitvehicle_filter',
    'gpsb_unitvehicle_filter_2',
    'gpsb_unitvehicle_filter_by_group',
  ].filter((v, idx, arr) => v && arr.indexOf(v) === idx);

  let lastError = null;

  for (const fn of candidates) {
    try {
      // Use ExecuteReturnSet with XML body (the correct API method per docs)
      const payload = await executeReturnSet(env, fn, { p_companyid: env.companyId });

      // Check for API-level error
      if (payload && payload.error) {
        const errMsg = payload.error.message || payload.error.code || JSON.stringify(payload.error);
        lastError = new Error(`GPSBuddy ${fn}: ${errMsg}`);
        continue;
      }

      const arr = extractVehicleArray(payload);
      const normalized = (Array.isArray(arr) ? arr : []).map(normalizeVehicle).filter(v => v.vehicleid);

      // Log success for debugging
      console.log(`[GPSBuddy] Success with function: ${fn}, vehicles: ${normalized.length}`);

      return {
        vehicles: normalized,
        meta: {
          functionName: fn,
          fetchedAt: new Date().toISOString(),
        },
      };
    } catch (e) {
      console.log(`[GPSBuddy] Function ${fn} failed:`, e.message);
      lastError = e;
    }
  }

  throw lastError || new Error('GPSBuddy live data alınamadı');
}

module.exports = {
  parseGpsBuddyDate,
  normalizeVehicle,
  fetchLiveVehicles,
};
