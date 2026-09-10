import React, { useState, useRef, useEffect, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { MapPin, Navigation, Info, Search, Loader2, X, Check } from "lucide-react";
import { GeofenceService, LocationSearchService } from "@/services/mobile";
import { useToast } from "@/components/ui/use-toast";

/**
 * LocationConfigEditor — RC20.1
 *
 * Captures canonical geofence configuration for a Location Smart Message:
 *   - place name, formatted address, place_id (provider identifier)
 *   - latitude / longitude (canonical coordinates — required for geofencing)
 *   - radius (50–1000m, default 200m)
 *
 * Primary flow: Geoapify search → select from results → coordinates stored.
 * Fallback: "Use my current location" (native geolocation).
 * Users do NOT need to enter latitude/longitude manually.
 *
 * Geoapify is called ONLY during configuration. Native geofencing later
 * operates on the stored coordinates/radius — no per-event Geoapify call.
 */
const RADIUS_MIN = 50;
const RADIUS_MAX = 1000;
const RADIUS_DEFAULT = 200;
const RADIUS_PRESETS = [100, 200, 500];
const MIN_QUERY_LEN = 3;
const DEBOUNCE_MS = 350;

export default function LocationConfigEditor({ config, onChange }) {
  const { toast } = useToast();
  const [locating, setLocating] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [notice, setNotice] = useState(null);
  const sessionRef = useRef(null);
  const debounceRef = useRef(null);
  const requestIdRef = useRef(0);

  const set = (key, value) => onChange({ ...config, [key]: value });

  // One Google Places session token per editor mount (session billing).
  useEffect(() => {
    sessionRef.current = (crypto?.randomUUID?.() || (Date.now() + Math.random().toString(36)));
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, []);

  const runSearch = useCallback(async (q) => {
    const trimmed = q.trim();
    if (trimmed.length < MIN_QUERY_LEN) {
      setResults([]);
      setSearching(false);
      setNotice(null);
      return;
    }
    const myId = ++requestIdRef.current; // ignore stale responses
    setSearching(true);
    try {
      const res = await LocationSearchService.autocomplete(trimmed, sessionRef.current);
      if (myId !== requestIdRef.current) return;
      setResults(res.results || []);
      setNotice(res.requiresConfiguration ? (res.message || null) : (res.error || null));
    } catch (e) {
      if (myId !== requestIdRef.current) return;
      setNotice(e.message);
    } finally {
      if (myId === requestIdRef.current) setSearching(false);
    }
  }, []);

  const handleQueryChange = (val) => {
    setQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runSearch(val), DEBOUNCE_MS);
  };

  const handleSelect = async (place) => {
    // RC20.1.1: Geoapify autocomplete results already carry lat/lon. Use them
    // directly — do NOT make a second Place Details request just to resolve
    // coordinates. Place Details is only an optional fallback if a result
    // somehow lacks coordinates (and must not block selection otherwise).
    if (typeof place.latitude === "number" && typeof place.longitude === "number") {
      const next = { ...config };
      next.location_place_id = place.place_id || null;
      next.location_place_name = place.primary_text || "";
      next.location_address = place.secondary_text || "";
      next.location_latitude = place.latitude;
      next.location_longitude = place.longitude;
      if (typeof next.location_radius_meters !== "number") {
        next.location_radius_meters = RADIUS_DEFAULT;
      }
      onChange(next);
      setResults([]);
      setQuery("");
      setNotice(null);
      toast({ title: "Location selected", description: next.location_place_name });
      return;
    }

    // Optional fallback: a result without coordinates (rare). Try Place Details.
    setSearching(true);
    try {
      const res = await LocationSearchService.getDetails(place.place_id, sessionRef.current);
      const r = res.result;
      if (r && typeof r.latitude === "number" && typeof r.longitude === "number") {
        const next = { ...config };
        next.location_place_id = place.place_id || null;
        next.location_place_name = place.primary_text || r.name || "";
        next.location_address = r.formatted_address || place.secondary_text || "";
        next.location_latitude = r.latitude;
        next.location_longitude = r.longitude;
        if (typeof next.location_radius_meters !== "number") {
          next.location_radius_meters = RADIUS_DEFAULT;
        }
        onChange(next);
        setResults([]);
        setQuery("");
        setNotice(null);
        toast({ title: "Location selected", description: next.location_place_name });
      } else {
        toast({ title: "Could not get coordinates", description: "Try another place or use your current location.", variant: "destructive" });
      }
    } catch (e) {
      toast({ title: "Search failed", description: e.message, variant: "destructive" });
    } finally {
      setSearching(false);
    }
  };

  const handleUseCurrentLocation = async () => {
    setLocating(true);
    try {
      const result = await GeofenceService.getCurrentLocation();
      if (result.supported && result.latitude != null) {
        const next = { ...config };
        next.location_latitude = result.latitude;
        next.location_longitude = result.longitude;
        if (typeof next.location_radius_meters !== "number") next.location_radius_meters = RADIUS_DEFAULT;
        if (!next.location_place_name) next.location_place_name = "My current location";
        onChange(next);
        toast({ title: "Location captured", description: "Coordinates updated to your current position." });
      } else {
        toast({ title: "Location unavailable", description: result.error || "Try searching for a place instead." });
      }
    } finally {
      setLocating(false);
    }
  };

  const handleRadiusChange = (val) => {
    const n = Number(val);
    if (isNaN(n)) return;
    set("location_radius_meters", Math.min(RADIUS_MAX, Math.max(RADIUS_MIN, n)));
  };

  const handleClearLocation = () => {
    const next = { ...config };
    delete next.location_latitude;
    delete next.location_longitude;
    delete next.location_place_name;
    delete next.location_address;
    delete next.location_place_id;
    delete next.location_postcode;
    onChange(next);
  };

  const radius = (typeof config.location_radius_meters === "number") ? config.location_radius_meters : RADIUS_DEFAULT;
  const hasCoords = typeof config.location_latitude === "number" && typeof config.location_longitude === "number";

  return (
    <div className="space-y-3">
      {hasCoords ? (
        <div className="rounded-xl border border-border bg-card p-3 space-y-2">
          <div className="flex items-start gap-2">
            <MapPin className="w-4 h-4 text-primary shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{config.location_place_name || "Selected place"}</p>
              {config.location_address && (
                <p className="text-xs text-muted-foreground truncate">{config.location_address}</p>
              )}
              <p className="text-xs text-muted-foreground mt-0.5">
                {config.location_latitude?.toFixed(4)}, {config.location_longitude?.toFixed(4)}
              </p>
            </div>
            <button type="button" onClick={handleClearLocation} className="text-muted-foreground hover:text-foreground touch-manipulation shrink-0">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <Label htmlFor="loc-search">Search for a place</Label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              id="loc-search"
              value={query}
              onChange={e => handleQueryChange(e.target.value)}
              placeholder="e.g. Nottingham Train Station"
              className="pl-9"
              autoComplete="off"
            />
            {searching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground" />}
          </div>

          {results.length > 0 && (
            <div className="rounded-xl border border-border bg-card divide-y divide-border overflow-hidden">
              {results.map(r => (
                <button
                  key={r.place_id}
                  type="button"
                  onClick={() => handleSelect(r)}
                  className="w-full text-left px-3 py-2.5 hover:bg-muted/50 touch-manipulation flex items-start gap-2"
                >
                  <MapPin className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{r.primary_text}</p>
                    {r.secondary_text && <p className="text-xs text-muted-foreground truncate">{r.secondary_text}</p>}
                  </div>
                </button>
              ))}
            </div>
          )}

          {notice && (
            <p className="text-xs text-muted-foreground flex items-start gap-1">
              <Info className="w-3 h-3 mt-0.5 shrink-0" />
              {notice}
            </p>
          )}

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleUseCurrentLocation}
            disabled={locating}
            className="w-full h-9 rounded-xl"
          >
            {locating ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Navigation className="w-4 h-4 mr-1" />}
            Use my current location
          </Button>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="radius">Detection radius</Label>
        <div className="flex gap-2">
          {RADIUS_PRESETS.map(r => (
            <button
              key={r}
              type="button"
              onClick={() => set("location_radius_meters", r)}
              className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors touch-manipulation ${
                radius === r ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
              }`}
            >
              {r}m
            </button>
          ))}
        </div>
        <Input
          id="radius"
          type="number"
          min={RADIUS_MIN}
          max={RADIUS_MAX}
          value={radius}
          onChange={e => handleRadiusChange(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">How close to the place counts as "arrived". Default 200m.</p>
      </div>

      {hasCoords && (
        <p className="text-xs text-success flex items-center gap-1">
          <Check className="w-3 h-3" />
          Geofence ready · ~{radius}m radius
        </p>
      )}
    </div>
  );
}