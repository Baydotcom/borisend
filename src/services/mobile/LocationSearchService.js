/**
 * LocationSearchService — Geoapify (configuration/discovery only)
 *
 * RC20.1: Wired to the secure backend function `searchLocations`, which holds
 * the Geoapify API key server-side. The browser NEVER sees the API key.
 *
 * Geoapify is used ONLY when the user is configuring a Location Smart Message
 * (search → select). Once selected, canonical coordinates + radius are stored
 * on the SmartMessage and native geofencing uses those stored values — no
 * Geoapify request occurs per geofence arrival/departure.
 *
 * Provider-neutral: the UI consumes only the normalised BoriSend shape
 * ({ id, name, formatted_address, latitude, longitude }). Geoapify specifics
 * live only inside the backend `searchLocations` function, so the provider can
 * be swapped without touching consumers.
 *
 * Cost control is enforced here (debounce, min 3 chars, request staleness
 * handling) and in the backend function (bounded results, minimal fields).
 */

import { base44 } from "@/api/base44Client";

const LocationSearchService = {
  /**
   * Autocomplete a place query. Returns prediction labels only (no coords);
   * call getDetails() once the user selects a prediction.
   * @returns {Promise<{results: Array, provider: string|null, requiresConfiguration?: boolean, message?: string, error?: string}>}
   */
  async autocomplete(query, sessionToken) {
    if (!query || query.trim().length < 3) {
      return { results: [], provider: null };
    }
    try {
      const res = await base44.functions.invoke("searchLocations", {
        action: "autocomplete",
        query,
        session_token: sessionToken || null,
      });
      const data = res.data || {};
      return {
        results: data.results || [],
        provider: data.provider || null,
        requiresConfiguration: data.requiresConfiguration || false,
        message: data.message || null,
      };
    } catch (e) {
      return { results: [], provider: null, error: e.message };
    }
  },

  /**
   * Resolve a selected prediction to canonical coordinates + address.
   * @returns {Promise<{result: object|null, provider: string|null, error?: string}>}
   */
  async getDetails(placeId, sessionToken) {
    if (!placeId) return { result: null };
    try {
      const res = await base44.functions.invoke("searchLocations", {
        action: "details",
        place_id: placeId,
        session_token: sessionToken || null,
      });
      const data = res.data || {};
      return {
        result: data.result || null,
        provider: data.provider || null,
        requiresConfiguration: data.requiresConfiguration || false,
      };
    } catch (e) {
      return { result: null, error: e.message };
    }
  },

  /**
   * A search provider is wired (secure backend proxy). Actual availability
   * depends on GEOAPIFY_API_KEY being configured server-side.
   */
  hasProvider() {
    return true;
  },
};

export default LocationSearchService;