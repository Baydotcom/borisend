import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { secrets } from 'base44:runtime';

/**
 * RC20.1 — searchLocations
 *
 * Secure, server-side Geoapify proxy for Location Smart Message configuration.
 *
 * The Geoapify API key NEVER reaches the browser — it lives only in the
 * Base44 app secret GEOAPIFY_API_KEY and is read here via secrets.get().
 *
 * Geoapify is used ONLY for configuration/discovery (search → select). Once a
 * place is selected, its canonical coordinates + radius are stored on the
 * SmartMessage trigger_config, and native OS geofencing operates on those
 * stored values. processGeofenceEvent never calls Geoapify.
 *
 * Cost control:
 *   - autocomplete: min 3 chars enforced (frontend debounce + threshold)
 *   - results bounded to MAX_RESULTS (5)
 *   - Place Details requests only the fields BoriSend needs
 *     (name, formatted address, lat, lon) — no photos, ratings, reviews,
 *     opening hours, or phone numbers.
 *   - no Geoapify SDK installed — bare fetch only.
 *
 * Normalised (provider-neutral) output so Geoapify can be replaced later
 * without changing consumers:
 *   autocomplete → results: [{ place_id, primary_text, secondary_text }]
 *   details      → result: { place_id, name, formatted_address, latitude, longitude }
 *
 * If GEOAPIFY_API_KEY is not configured, returns { requiresConfiguration: true }
 * with a clear message — does NOT throw, so the rest of the app keeps working.
 */
const AUTOCOMPLETE_ENDPOINT = 'https://api.geoapify.com/v1/geocode/autocomplete';
const DETAILS_ENDPOINT = 'https://api.geoapify.com/v1/geocode/details';
const MAX_RESULTS = 5;
const MIN_QUERY_LEN = 3;

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const apiKey = secrets.get('GEOAPIFY_API_KEY');
    if (!apiKey) {
      return Response.json({
        results: [],
        requiresConfiguration: true,
        message: 'Location search is not configured yet. The Product Owner must set the GEOAPIFY_API_KEY app secret.',
      });
    }

    const body = await req.json();
    const { action } = body;

    if (action === 'autocomplete') {
      const query = (body.query || '').trim();
      if (query.length < MIN_QUERY_LEN) {
        return Response.json({ results: [], provider: 'geoapify' });
      }

      const url = `${AUTOCOMPLETE_ENDPOINT}?text=${encodeURIComponent(query)}&limit=${MAX_RESULTS}&apiKey=${encodeURIComponent(apiKey)}`;
      const res = await fetch(url);
      const data: any = await res.json();
      if (!res.ok) {
        console.error('[searchLocations] autocomplete failed:', data?.error || res.status);
        return Response.json({ error: 'Location search is temporarily unavailable. Try again or use your current location.' }, { status: 502 });
      }

      const features = (data.features || []).slice(0, MAX_RESULTS);
      const results = features.map((f: any) => {
        const p = f.properties || {};
        const name = p.name || '';
        const formatted = p.formatted || '';
        // RC20.1.1: Geoapify autocomplete already returns lat/lon in properties.
        // Retain them so selection resolves coordinates immediately — no second
        // Place Details request is needed (and none fires per geofence event).
        return {
          place_id: p.place_id || f.properties?.osm_id?.toString() || formatted,
          primary_text: name || formatted,
          secondary_text: name && formatted && formatted !== name ? formatted : '',
          latitude: typeof p.lat === 'number' ? p.lat : null,
          longitude: typeof p.lon === 'number' ? p.lon : null,
        };
      }).filter((r: any) => r.place_id);

      return Response.json({ results, provider: 'geoapify' });
    }

    if (action === 'details') {
      const placeId = body.place_id;
      if (!placeId) return Response.json({ error: 'place_id is required' }, { status: 400 });

      const url = `${DETAILS_ENDPOINT}?id=${encodeURIComponent(placeId)}&apiKey=${encodeURIComponent(apiKey)}`;
      const res = await fetch(url);
      const data: any = await res.json();
      if (!res.ok) {
        console.error('[searchLocations] details failed:', data?.error || res.status);
        return Response.json({ error: 'Could not load this location. Try another place or use your current location.' }, { status: 502 });
      }

      const feature = (data.features || [])[0];
      const p = feature?.properties || {};
      if (p.lat == null || p.lon == null) {
        return Response.json({ error: 'Could not resolve coordinates for this place.' }, { status: 502 });
      }

      return Response.json({
        result: {
          place_id: placeId,
          name: p.name || '',
          formatted_address: p.formatted || '',
          latitude: p.lat,
          longitude: p.lon,
        },
        provider: 'geoapify',
      });
    }

    return Response.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (error) {
    console.error('[searchLocations] error:', error.message);
    return Response.json({ error: 'Location search is temporarily unavailable.' }, { status: 500 });
  }
}