const fs = require('fs');
const path = require('path');

function requireEnv(name) {
  const v = process.env[name];
  if (v == null || String(v).trim() === '') return null;
  return String(v);
}

function parseBooleanEnv(name, defaultValue = false) {
  const v = process.env[name];
  if (v == null || String(v).trim() === '') return defaultValue;
  const s = String(v).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(s)) return true;
  if (['0', 'false', 'no', 'off'].includes(s)) return false;
  return defaultValue;
}

function warnIfMissingAssets() {
  // One-time helper: surface missing PDF assets early on Linux/EC2.
  try {
    const cmrTemplatePath = path.join(__dirname, '..', '..', 'pdf', 'getPrintCmrPdf.pdf');
    if (!fs.existsSync(cmrTemplatePath)) {
      // eslint-disable-next-line no-console
      console.warn('[startup] WARNING: Missing CMR template:', cmrTemplatePath);
    }
  } catch (_) {
    // ignore
  }
}

function validateEnv(options = {}) {
  const { requireGps = false } = options;

  const hasGpsCreds = !!(requireEnv('GPSBUDDY_COMPANY_ID') && requireEnv('GPSBUDDY_USERNAME') && requireEnv('GPSBUDDY_PASSWORD'));
  // If GPS_REFRESH_CRON_ENABLED is not set, auto-enable the refresh cron when credentials exist.
  // This prevents "GPS updates only when GPS page is opened" in setups where creds are configured
  // but the flag is forgotten.
  const cronEnabled = (process.env.GPS_REFRESH_CRON_ENABLED == null || String(process.env.GPS_REFRESH_CRON_ENABLED).trim() === '')
    ? hasGpsCreds
    : parseBooleanEnv('GPS_REFRESH_CRON_ENABLED', false);
  const shouldRequireGps = !!(requireGps || cronEnabled);

  if (shouldRequireGps) {
    const required = ['GPSBUDDY_COMPANY_ID', 'GPSBUDDY_USERNAME', 'GPSBUDDY_PASSWORD'];
    const missing = required.filter(k => !requireEnv(k));

    if (missing.length) {
      const hint = [
        'GPS modülü için eksik environment variable var.',
        'Eksikler: ' + missing.join(', '),
        'Dev için proje rootunda `.env` içine ekleyebilirsiniz (repo\'ya commit etmeyin).',
        'Prod için sunucu environment variable olarak set edin.',
      ].join('\n');

      const err = new Error(hint);
      err.code = 'ENV_MISSING';
      throw err;
    }
  }

  const companyIdRaw = requireEnv('GPSBUDDY_COMPANY_ID');
  const usernameRaw = requireEnv('GPSBUDDY_USERNAME');
  const passwordRaw = requireEnv('GPSBUDDY_PASSWORD');

  return {
    gpsbuddy: {
      baseUrl: process.env.GPSBUDDY_BASE_URL || 'http://webservice.gps-buddy.com',
      companyId: companyIdRaw ? Number(companyIdRaw) : null,
      username: usernameRaw,
      password: passwordRaw,
      groupId: process.env.GPSBUDDY_GROUP_ID != null ? Number(process.env.GPSBUDDY_GROUP_ID) : 0,
      liveEndpoint: process.env.GPSBUDDY_LIVE_ENDPOINT || 'gpsb_unitvehicle_filter_by_group',
    },
    cron: {
      gpsRefreshEnabled: cronEnabled,
    },
  };
}

module.exports = { validateEnv, warnIfMissingAssets, requireEnv, parseBooleanEnv };
