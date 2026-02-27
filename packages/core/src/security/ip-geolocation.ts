/**
 * IP Geolocation — dual strategy:
 *   1. Vercel headers (free, zero-latency, production)
 *   2. ip-api.com fallback (local dev, 3s timeout)
 */

export interface GeoInfo {
  city: string | null;
  region: string | null;
  country: string | null;
  latitude: string | null;
  longitude: string | null;
}

const EMPTY_GEO: GeoInfo = { city: null, region: null, country: null, latitude: null, longitude: null };

/** Extract geo from Vercel-injected headers (free, zero-latency). */
function extractVercelGeo(headers: Headers): GeoInfo | null {
  const country = headers.get('x-vercel-ip-country');
  if (!country) return null;
  return {
    city: headers.get('x-vercel-ip-city'),
    region: headers.get('x-vercel-ip-country-region'),
    country,
    latitude: headers.get('x-vercel-ip-latitude'),
    longitude: headers.get('x-vercel-ip-longitude'),
  };
}

/** Fallback: ip-api.com (free tier, 45 req/min, local dev only). */
async function lookupGeoFromApi(ip: string): Promise<GeoInfo | null> {
  if (!ip || ip === '127.0.0.1' || ip === '::1' || ip.startsWith('192.168.') || ip.startsWith('10.')) {
    return null;
  }
  try {
    const res = await fetch(
      `http://ip-api.com/json/${encodeURIComponent(ip)}?fields=city,regionName,countryCode,lat,lon`,
      { signal: AbortSignal.timeout(3000) },
    );
    if (!res.ok) return null;
    const data = await res.json() as Record<string, unknown>;
    if (data.status === 'fail') return null;
    return {
      city: (data.city as string) ?? null,
      region: (data.regionName as string) ?? null,
      country: (data.countryCode as string) ?? null,
      latitude: data.lat != null ? String(data.lat) : null,
      longitude: data.lon != null ? String(data.lon) : null,
    };
  } catch {
    return null;
  }
}

/**
 * Resolve IP geolocation: Vercel headers first, then ip-api.com fallback.
 * Never throws — returns empty geo on failure.
 */
export async function resolveGeo(headers: Headers, ip: string | undefined): Promise<GeoInfo> {
  try {
    const vercelGeo = extractVercelGeo(headers);
    if (vercelGeo) return vercelGeo;
    if (ip) {
      const firstIp = ip.split(',')[0]!.trim();
      const apiGeo = await lookupGeoFromApi(firstIp);
      if (apiGeo) return apiGeo;
    }
  } catch {
    // never throw
  }
  return EMPTY_GEO;
}
