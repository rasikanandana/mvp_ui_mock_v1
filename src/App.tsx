// src/App.tsx — Community Hazard Dashboard (improved)
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

/* =========================
   Types
   ========================= */
type QuakeFeature = {
  type: "Feature";
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: {
    publicID: string;
    time: string;
    depth: number;
    magnitude: number;
    locality: string;
    mmi: number;
    quality: string;
  };
};
type QuakeFC = { type: "FeatureCollection"; features: QuakeFeature[] };

type RoadEventFeature = {
  type: "Feature";
  geometry?: { type: "Point"; coordinates: [number, number] };
  properties: Record<string, any>;
};

type WeatherNow = {
  temperature: number;
  windspeed: number;
  winddirection: number;
  weathercode: number;
  precipProb: number | null;
};

type VolcanoFeature = {
  type: "Feature";
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: {
    volcanoID: string;
    volcanoTitle: string;
    level: number;
    activity: string;
    hazards?: string;
    activityBulletinURL?: string;
  };
};
type VolcanoFC = { type: "FeatureCollection"; features: VolcanoFeature[] };

type GeocoderResult = { lat: string; lon: string; display_name: string };

/* =========================
   Constants
   ========================= */
const GEONET_QUAKES   = "https://api.geonet.org.nz/quake?MMI=3";
const GEONET_VOLCANO  = "https://api.geonet.org.nz/volcano/val";
const NZTA_ROAD_EVENTS =
  "https://services.arcgis.com/CXBb7LAjgIIdcsPt/arcgis/rest/services/NZTA_Highway_Information/FeatureServer/0/query?outFields=*&where=1%3D1&f=geojson";
const NOMINATIM  = "https://nominatim.openstreetmap.org/search";
const OPEN_METEO = "https://api.open-meteo.com/v1/forecast";

const DEFAULT_CENTER: [number, number] = [-41.2866, 174.7762];
const QUAKE_REFRESH_S = 30;
const ROAD_REFRESH_S  = 120;
const WX_REFRESH_S    = 300; // 5 minutes

/* =========================
   Helpers
   ========================= */
function pickProp(obj: Record<string, any>, candidates: string[]): any | undefined {
  for (const k of candidates) if (obj[k] != null) return obj[k];
  const map: Record<string, string> = {};
  Object.keys(obj).forEach((k) => (map[k.toLowerCase()] = k));
  for (const k of candidates) {
    const f = map[k.toLowerCase()];
    if (f && obj[f] != null) return obj[f];
  }
  return undefined;
}
function pickPropIncludes(obj: Record<string, any>, substrs: string[]): any | undefined {
  const lower = substrs.map((s) => s.toLowerCase());
  for (const [k, v] of Object.entries(obj)) {
    if (lower.every((s) => k.toLowerCase().includes(s))) return v;
  }
  return undefined;
}
function toLocalDate(val: any): string {
  if (val == null) return "";
  const n = Number(val);
  if (!Number.isNaN(n)) {
    const ms = n < 1e12 ? n * 1000 : n;
    const d = new Date(ms);
    if (!Number.isNaN(d.getTime())) return d.toLocaleString();
  }
  if (typeof val === "string") {
    const d = new Date(val);
    if (!Number.isNaN(d.getTime())) return d.toLocaleString();
  }
  return String(val);
}
function cleanNA(s?: any) {
  if (!s) return "";
  const t = String(s).trim().toLowerCase();
  const na = new Set(["n/a", "na", "not applicable", "not applicable.", "n/a."]);
  return na.has(t) ? "" : String(s).trim();
}
function titleCase(s: string) {
  return s.toLowerCase().split(/\s+/).map((w) => (w ? w[0].toUpperCase() + w.slice(1) : "")).join(" ");
}
function distanceKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLon = ((bLon - aLon) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
function wmoCodeToDescription(code: number): string {
  const map: Record<number, string> = {
    0: "Clear sky", 1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast",
    45: "Fog", 48: "Icy fog",
    51: "Light drizzle", 53: "Moderate drizzle", 55: "Dense drizzle",
    61: "Slight rain", 63: "Moderate rain", 65: "Heavy rain",
    71: "Slight snow", 73: "Moderate snow", 75: "Heavy snow",
    80: "Slight showers", 81: "Moderate showers", 82: "Violent showers",
    95: "Thunderstorm", 96: "Thunderstorm + hail", 99: "Thunderstorm + heavy hail",
  };
  return map[code] ?? `WMO code ${code}`;
}
function hazardLevelFromMag(mag: number): { label: string; color: string; bg: string } {
  if (mag >= 6) return { label: "CRITICAL",      color: "#fff",    bg: "#b91c1c" };
  if (mag >= 5) return { label: "HIGH",           color: "#fff",    bg: "#ea580c" };
  if (mag >= 4) return { label: "MODERATE",       color: "#422006", bg: "#fbbf24" };
  if (mag >= 3) return { label: "LOW-MODERATE",   color: "#166534", bg: "#bbf7d0" };
  return             { label: "LOW",              color: "#166534", bg: "#dcfce7" };
}
function volcanoLevelColor(level: number): string {
  if (level >= 4) return "#b91c1c";
  if (level >= 3) return "#ea580c";
  if (level >= 2) return "#fbbf24";
  return "#86efac";
}
function fmtTime(d: Date) {
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

declare const L: any;

/* =========================
   Architecture Diagram
   ========================= */
function ArchitectureDiagram() {
  const sources = [
    { y: 68,  label: "GeoNet API",    sub: "Earthquakes (MMI ≥ 3)",  dot: "#ef4444" },
    { y: 148, label: "GeoNet API",    sub: "Volcanic Alert Levels",   dot: "#f97316" },
    { y: 228, label: "NZTA ArcGIS",  sub: "Highway Events",          dot: "#3b82f6" },
    { y: 308, label: "Open-Meteo",   sub: "Weather + Rain Prob %",   dot: "#8b5cf6" },
    { y: 388, label: "Nominatim OSM",sub: "NZ Address Geocoding",    dot: "#10b981" },
  ];
  const adapters = [
    { y: 68,  label: "loadQuakes()",     dot: "#ef4444" },
    { y: 148, label: "loadVolcanoes()",  dot: "#f97316" },
    { y: 228, label: "loadRoadEvents()", dot: "#3b82f6" },
    { y: 308, label: "loadWeather()",    dot: "#8b5cf6" },
    { y: 388, label: "geocodeAddress()", dot: "#10b981" },
  ];
  const cache = [
    { y: 68,  label: "quakes[ ]",      sub: "30s auto-refresh",   dot: "#22c55e" },
    { y: 148, label: "volcanoes[ ]",   sub: "load on mount",      dot: "#22c55e" },
    { y: 228, label: "roadEvents[ ]",  sub: "2 min auto-refresh", dot: "#22c55e" },
    { y: 308, label: "weather",        sub: "5 min auto-refresh", dot: "#22c55e" },
    { y: 388, label: "geocodeResults", sub: "per query",          dot: "#22c55e" },
  ];
  const panels = [
    { y: 55,  label: "Interactive Map (Leaflet)",   sub: "Quake & road markers, radius circle" },
    { y: 135, label: "Map Layer Toggles",           sub: "Show / hide layer groups" },
    { y: 215, label: "Live Feed",                   sub: "2 EQ · 2 road · highest volcano alert" },
    { y: 295, label: "Weather Card",                sub: "Temp · wind · rain prob · 5 min refresh" },
    { y: 375, label: "Volcanic Alert Levels",       sub: "All NZ volcanoes · GeoNet" },
    { y: 455, label: "Area Summary + Hazard Badge", sub: "Aggregated stats · risk level" },
  ];

  return (
    <main className="max-w-5xl mx-auto p-6">
      <h2 className="text-2xl font-bold mb-1 text-slate-800">System Architecture</h2>
      <p className="text-sm text-slate-500 mb-5">
        data pipeline.
      </p>
      <div className="bg-white rounded-2xl border p-4 overflow-x-auto shadow-sm">
        <svg
          viewBox="0 0 940 510"
          xmlns="http://www.w3.org/2000/svg"
          className="w-full min-w-[680px]"
          style={{ fontFamily: "ui-sans-serif, system-ui, sans-serif" }}
        >
          <defs>
            <marker id="arr" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
              <path d="M0,0 L7,3.5 L0,7 Z" fill="#94a3b8" />
            </marker>
          </defs>

          {/* Column backgrounds */}
          <rect x="8"   y="8" width="192" height="492" rx="10" fill="#fef2f2" stroke="#fecaca"  strokeWidth="1" />
          <rect x="212" y="8" width="172" height="492" rx="10" fill="#eff6ff" stroke="#bfdbfe"  strokeWidth="1" />
          <rect x="396" y="8" width="162" height="492" rx="10" fill="#f0fdf4" stroke="#bbf7d0"  strokeWidth="1" />
          <rect x="570" y="8" width="362" height="492" rx="10" fill="#fefce8" stroke="#fde68a"  strokeWidth="1" />

          {/* Column headings */}
          <text x="104" y="30" textAnchor="middle" fontSize="10" fontWeight="700" fill="#b91c1c"  letterSpacing="0.05em">DATA SOURCES</text>
          <text x="298" y="30" textAnchor="middle" fontSize="10" fontWeight="700" fill="#1d4ed8"  letterSpacing="0.05em">FETCH ADAPTERS</text>
          <text x="477" y="30" textAnchor="middle" fontSize="10" fontWeight="700" fill="#15803d"  letterSpacing="0.05em">REACT STATE</text>
          <text x="751" y="30" textAnchor="middle" fontSize="10" fontWeight="700" fill="#92400e"  letterSpacing="0.05em">UI PANELS</text>

          {sources.map(({ y, label, sub, dot }, i) => (
            <g key={`src-${i}`}>
              <rect x="18" y={y} width="172" height="50" rx="7" fill="white" stroke={dot} strokeWidth="1.5" />
              <circle cx="32" cy={y + 14} r="5" fill={dot} />
              <text x="42" y={y + 18} fontSize="11" fontWeight="600" fill="#1e293b">{label}</text>
              <text x="28" y={y + 35} fontSize="10" fill="#64748b">{sub}</text>
              <line x1="190" y1={y + 25} x2="212" y2={y + 25} stroke="#94a3b8" strokeWidth="1.5" markerEnd="url(#arr)" />
            </g>
          ))}
          {adapters.map(({ y, label, dot }, i) => (
            <g key={`adp-${i}`}>
              <rect x="222" y={y} width="152" height="50" rx="7" fill="white" stroke={dot} strokeWidth="1.5" />
              <text x="298" y={y + 29} textAnchor="middle" fontSize="10.5" fontWeight="600" fill={dot} fontFamily="ui-monospace,monospace">{label}</text>
              <line x1="374" y1={y + 25} x2="396" y2={y + 25} stroke="#94a3b8" strokeWidth="1.5" markerEnd="url(#arr)" />
            </g>
          ))}
          {cache.map(({ y, label, sub, dot }, i) => (
            <g key={`cch-${i}`}>
              <rect x="406" y={y} width="142" height="50" rx="7" fill="white" stroke={dot} strokeWidth="1.5" />
              <text x="477" y={y + 21} textAnchor="middle" fontSize="11" fontWeight="600" fill="#15803d">{label}</text>
              <text x="477" y={y + 37} textAnchor="middle" fontSize="9.5" fill="#64748b">{sub}</text>
              <line x1="548" y1={y + 25} x2="570" y2={y + 25} stroke="#94a3b8" strokeWidth="1.5" markerEnd="url(#arr)" />
            </g>
          ))}
          {panels.map(({ y, label, sub }, i) => (
            <g key={`ui-${i}`}>
              <rect x="580" y={y} width="342" height="58" rx="7" fill="white" stroke="#f59e0b" strokeWidth="1.5" />
              <text x="751" y={y + 23} textAnchor="middle" fontSize="11" fontWeight="600" fill="#78350f">{label}</text>
              <text x="751" y={y + 39} textAnchor="middle" fontSize="9.5" fill="#92400e">{sub}</text>
            </g>
          ))}
        </svg>
      </div>
      <p className="text-xs text-slate-400 mt-3">
        ..
      </p>
    </main>
  );
}

/* =========================
   Main App
   ========================= */
export default function App() {
  /* --------- UI state --------- */
  const [view, setView] = useState<"dashboard" | "architecture">("dashboard");
  const [radius, setRadius] = useState(300);
  const [layers, setLayers] = useState({
    quakes: true, traffic: true, rain: true, flood: false, landslide: false, community: true,
  });
  const toggle = (k: keyof typeof layers) => setLayers((s) => ({ ...s, [k]: !s[k] }));

  /* --------- Map --------- */
  const mapDivRef   = useRef<HTMLDivElement | null>(null);
  const mapRef      = useRef<any>(null);
  const quakesLayerRef  = useRef<any>(null);
  const roadsLayerRef   = useRef<any>(null);
  const radiusLayerRef  = useRef<any>(null);
  const [mapCenter, setMapCenter] = useState<[number, number]>(DEFAULT_CENTER);

  useEffect(() => {
    if (!mapDivRef.current || mapRef.current || typeof L === "undefined") return;
    const map = L.map(mapDivRef.current).setView(DEFAULT_CENTER, 6);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);
    quakesLayerRef.current = L.layerGroup().addTo(map);
    roadsLayerRef.current  = L.layerGroup().addTo(map);
    radiusLayerRef.current = L.layerGroup().addTo(map);
    map.on("moveend", () => { const c = map.getCenter(); setMapCenter([c.lat, c.lng]); });
    mapRef.current = map;
  }, []);

  /* Layer toggle → actual Leaflet layer visibility */
  useEffect(() => {
    if (!mapRef.current) return;
    const m = mapRef.current;
    const applyVisibility = (layer: any, visible: boolean) => {
      if (!layer) return;
      if (visible  && !m.hasLayer(layer)) layer.addTo(m);
      if (!visible &&  m.hasLayer(layer)) m.removeLayer(layer);
    };
    applyVisibility(quakesLayerRef.current, layers.quakes);
    applyVisibility(roadsLayerRef.current,  layers.traffic);
  }, [layers.quakes, layers.traffic]);

  /* Radius circle */
  useEffect(() => {
    if (!radiusLayerRef.current || !mapRef.current) return;
    radiusLayerRef.current.clearLayers();
    const [lat, lon] = mapCenter;
    L.circle([lat, lon], {
      radius: radius * 1000, color: "#4f46e5", weight: 1.5,
      fillColor: "#818cf8", fillOpacity: 0.07,
    }).addTo(radiusLayerRef.current);
  }, [mapCenter, radius]);

  function useMyLocation() {
    if (!navigator.geolocation) return alert("Geolocation not supported.");
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setMapCenter([coords.latitude, coords.longitude]);
        mapRef.current?.setView([coords.latitude, coords.longitude], 12);
      },
      () => alert("Could not get location. Check browser permissions."),
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }

  /* --------- Geocoder (Nominatim) --------- */
  const [geocodeQuery,   setGeocodeQuery]   = useState("");
  const [geocodeResults, setGeocodeResults] = useState<GeocoderResult[]>([]);
  const [isGeocoding,    setIsGeocoding]    = useState(false);

  async function geocodeAddress(q: string) {
    if (!q.trim()) return;
    setIsGeocoding(true);
    setGeocodeResults([]);
    try {
      const url = new URL(NOMINATIM);
      url.searchParams.set("q", q + " New Zealand");
      url.searchParams.set("format", "json");
      url.searchParams.set("limit", "5");
      url.searchParams.set("countrycodes", "nz");
      const res = await fetch(url.toString(), {
        headers: { "Accept-Language": "en", "User-Agent": "Community-Hazard-Dashboard/1.0" },
      });
      const data: GeocoderResult[] = await res.json();
      setGeocodeResults(data);
    } finally {
      setIsGeocoding(false);
    }
  }

  function selectGeocodeResult(r: GeocoderResult) {
    const lat = parseFloat(r.lat);
    const lon = parseFloat(r.lon);
    setMapCenter([lat, lon]);
    mapRef.current?.setView([lat, lon], 13);
    setGeocodeResults([]);
    setGeocodeQuery(r.display_name.split(",").slice(0, 2).join(",").trim());
  }

  /* --------- GeoNet Quakes --------- */
  const [quakes,         setQuakes]         = useState<QuakeFeature[]>([]);
  const [loadingQuakes,  setLoadingQuakes]  = useState(false);
  const [errorQuakes,    setErrorQuakes]    = useState<string | null>(null);
  const [magMin,         setMagMin]         = useState(3.0);
  const [lastQuakeRefresh, setLastQuakeRefresh] = useState<Date | null>(null);
  const [quakeCountdown, setQuakeCountdown] = useState(QUAKE_REFRESH_S);

  const loadQuakes = useCallback(async () => {
    try {
      setLoadingQuakes(true);
      setErrorQuakes(null);
      const res = await fetch(GEONET_QUAKES, {
        headers: { Accept: "application/vnd.geo+json;version=2" },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: QuakeFC = await res.json();
      const sorted = [...data.features].sort(
        (a, b) => new Date(b.properties.time).getTime() - new Date(a.properties.time).getTime()
      );
      setQuakes(sorted.slice(0, 100));
      setLastQuakeRefresh(new Date());
      setQuakeCountdown(QUAKE_REFRESH_S);
    } catch (e: any) {
      setErrorQuakes(e.message || "Failed to load quakes");
    } finally {
      setLoadingQuakes(false);
    }
  }, []);

  /* Auto-refresh quakes + initial load */
  useEffect(() => {
    loadQuakes();
    const countId   = setInterval(() => setQuakeCountdown((c) => (c <= 1 ? QUAKE_REFRESH_S : c - 1)), 1000);
    const refreshId = setInterval(loadQuakes, QUAKE_REFRESH_S * 1000);
    return () => { clearInterval(countId); clearInterval(refreshId); };
  }, [loadQuakes]);

  const quakesFiltered = useMemo(
    () => quakes.filter((q) => {
      const [lon, lat] = q.geometry.coordinates;
      return distanceKm(mapCenter[0], mapCenter[1], lat, lon) <= radius && q.properties.magnitude >= magMin;
    }),
    [quakes, mapCenter, radius, magMin]
  );

  useEffect(() => {
    if (!quakesLayerRef.current) return;
    quakesLayerRef.current.clearLayers();
    quakesFiltered.forEach((q) => {
      const [lon, lat] = q.geometry.coordinates;
      const mag = q.properties.magnitude ?? 0;
      const hl  = hazardLevelFromMag(mag);
      L.circleMarker([lat, lon], {
        radius: Math.max(5, mag * 2.5), color: hl.bg, weight: 1.5, fillColor: hl.bg, fillOpacity: 0.8,
      })
        .bindPopup(
          `<b>M${mag.toFixed(1)}</b> — ${q.properties.locality}<br/>` +
          `${new Date(q.properties.time).toLocaleString()}<br/>` +
          `Depth ${q.properties.depth} km · MMI ${q.properties.mmi} · ${q.properties.quality}<br/>` +
          `<a href="https://www.geonet.org.nz/earthquake/${q.properties.publicID}" target="_blank">GeoNet →</a>`
        )
        .addTo(quakesLayerRef.current);
    });
  }, [quakesFiltered]);

  /* --------- NZTA Road Events --------- */
  const [roadEvents,    setRoadEvents]    = useState<RoadEventFeature[]>([]);
  const [loadingRoad,   setLoadingRoad]   = useState(false);
  const [errorRoad,     setErrorRoad]     = useState<string | null>(null);
  const [lastRoadRefresh, setLastRoadRefresh] = useState<Date | null>(null);
  const [roadCountdown, setRoadCountdown] = useState(ROAD_REFRESH_S);

  const loadRoadEvents = useCallback(async () => {
    try {
      setLoadingRoad(true);
      setErrorRoad(null);
      const res = await fetch(NZTA_ROAD_EVENTS);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setRoadEvents((data.features || []) as RoadEventFeature[]);
      setLastRoadRefresh(new Date());
      setRoadCountdown(ROAD_REFRESH_S);
    } catch (e: any) {
      setErrorRoad(e.message || "Failed to load road events");
    } finally {
      setLoadingRoad(false);
    }
  }, []);

  /* Auto-refresh roads + initial load */
  useEffect(() => {
    loadRoadEvents();
    const countId   = setInterval(() => setRoadCountdown((c) => (c <= 1 ? ROAD_REFRESH_S : c - 1)), 1000);
    const refreshId = setInterval(loadRoadEvents, ROAD_REFRESH_S * 1000);
    return () => { clearInterval(countId); clearInterval(refreshId); };
  }, [loadRoadEvents]);

  const roadsFiltered = useMemo(
    () => roadEvents.filter((ev) => {
      const c = ev.geometry?.coordinates;
      if (!c) return false;
      const [lon, lat] = c;
      return distanceKm(mapCenter[0], mapCenter[1], lat, lon) <= radius;
    }),
    [roadEvents, mapCenter, radius]
  );

  useEffect(() => {
    if (!roadsLayerRef.current) return;
    roadsLayerRef.current.clearLayers();
    roadsFiltered.forEach((ev) => {
      const coords = ev.geometry?.coordinates;
      if (!coords) return;
      const [lon, lat] = coords;
      const p = ev.properties || {};
      const eventType =
        pickProp(p, ["EVENTTYPE", "EventType", "eventType", "event_type"]) ??
        pickPropIncludes(p, ["event", "type"]) ?? "Road Event";
      const route    = pickProp(p, ["ROUTE", "Route", "route", "road", "roadname"]) ?? pickPropIncludes(p, ["route"]) ?? "";
      const location = pickProp(p, ["LOCATION", "Location", "location", "locality"]) ?? pickPropIncludes(p, ["loc"]) ?? "";
      L.circleMarker([lat, lon], {
        radius: 6, color: "#1d4ed8", weight: 1.5, fillColor: "#60a5fa", fillOpacity: 0.85,
      })
        .bindPopup(
          `<b>${titleCase(String(eventType))}</b>` +
          `${route ? ` · ${route}` : ""}${location ? ` · ${location}` : ""}<br/>` +
          `<small>Waka Kotahi NZTA</small>`
        )
        .addTo(roadsLayerRef.current);
    });
  }, [roadsFiltered]);

  /* --------- Weather (Open-Meteo) --------- */
  const [weather,      setWeather]      = useState<WeatherNow | null>(null);
  const [loadingWx,    setLoadingWx]    = useState(false);
  const [errorWx,      setErrorWx]      = useState<string | null>(null);
  const [lastWxRefresh,setLastWxRefresh]= useState<Date | null>(null);
  const [wxCountdown,  setWxCountdown]  = useState(WX_REFRESH_S);

  const loadWeather = useCallback(async (lat = mapCenter[0], lon = mapCenter[1]) => {
    try {
      setLoadingWx(true);
      setErrorWx(null);
      const url = new URL(OPEN_METEO);
      url.searchParams.set("latitude",  String(lat));
      url.searchParams.set("longitude", String(lon));
      url.searchParams.set("current_weather", "true");
      url.searchParams.set("hourly", "precipitation_probability");
      url.searchParams.set("forecast_days", "1");
      const res  = await fetch(url.toString());
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const cw   = data.current_weather;
      const precipProb = data.hourly?.precipitation_probability?.[new Date().getHours()] ?? null;
      if (cw) {
        setWeather({ temperature: cw.temperature, windspeed: cw.windspeed,
                     winddirection: cw.winddirection, weathercode: cw.weathercode, precipProb });
        setLastWxRefresh(new Date());
        setWxCountdown(WX_REFRESH_S);
      }
    } catch (e: any) {
      setErrorWx(e.message || "Failed");
    } finally {
      setLoadingWx(false);
    }
  }, [mapCenter]);

  /* Auto-refresh weather (ref pattern so interval doesn't restart on every map pan) */
  const loadWeatherRef = useRef(loadWeather);
  useEffect(() => { loadWeatherRef.current = loadWeather; }, [loadWeather]);
  useEffect(() => {
    loadWeatherRef.current();
    const countId   = setInterval(() => setWxCountdown((c) => (c <= 1 ? WX_REFRESH_S : c - 1)), 1000);
    const refreshId = setInterval(() => { loadWeatherRef.current(); setWxCountdown(WX_REFRESH_S); }, WX_REFRESH_S * 1000);
    return () => { clearInterval(countId); clearInterval(refreshId); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* --------- GeoNet Volcanic Alert Levels --------- */
  const [volcanoes,   setVolcanoes]   = useState<VolcanoFeature[]>([]);
  const [loadingVol,  setLoadingVol]  = useState(false);
  const [errorVol,    setErrorVol]    = useState<string | null>(null);

  const loadVolcanoes = useCallback(async () => {
    try {
      setLoadingVol(true);
      setErrorVol(null);
      const res  = await fetch(GEONET_VOLCANO, { headers: { Accept: "application/vnd.geo+json;version=2" } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: VolcanoFC = await res.json();
      setVolcanoes(data.features ?? []);
    } catch (e: any) {
      setErrorVol(e.message || "Failed");
    } finally {
      setLoadingVol(false);
    }
  }, []);

  useEffect(() => { loadVolcanoes(); }, [loadVolcanoes]);

  const activeVolcanoes = useMemo(
    () => volcanoes.filter((v) => v.properties.level >= 1),
    [volcanoes]
  );

  /* --------- Computed values --------- */
  const maxMag = useMemo(
    () => Math.max(...quakesFiltered.map((q) => q.properties.magnitude), 0),
    [quakesFiltered]
  );
  const hazard = useMemo(() => hazardLevelFromMag(maxMag), [maxMag]);

  const alertCount = useMemo(
    () =>
      quakesFiltered.filter((q) => q.properties.magnitude >= 4).length +
      activeVolcanoes.filter((v) => v.properties.level >= 2).length,
    [quakesFiltered, activeVolcanoes]
  );

  /* Live Feed: 2 most-recent EQ + 2 road events (with full detail) + highest-alert volcano (NZ-wide) */
  const feedData = useMemo(() => {
    const eqItems = quakesFiltered.slice(0, 2).map((q) => ({
      tag: "EQ", tagBg: "bg-red-100", tagColor: "text-red-700",
      title:  `Quake M${q.properties.magnitude.toFixed(1)} — ${q.properties.locality}`,
      time:   new Date(q.properties.time).toLocaleString(),
      detail: `Depth ${q.properties.depth} km · MMI ${q.properties.mmi} · ${q.properties.quality}`,
      desc:   "",
    }));

    const roadItems = roadsFiltered.slice(0, 2).map((ev) => {
      const p        = ev.properties || {};
      const t        = pickProp(p, ["EVENTTYPE", "EventType", "eventType"]) ?? pickPropIncludes(p, ["event", "type"]) ?? "Road Event";
      const route    = pickProp(p, ["ROUTE", "Route", "route", "road", "roadname"])   ?? pickPropIncludes(p, ["route"])        ?? "";
      const location = pickProp(p, ["LOCATION", "Location", "location", "locality"]) ?? pickPropIncludes(p, ["loc"])           ?? "";
      const status   = cleanNA(pickProp(p, ["STATUS", "Status", "status"])            ?? pickPropIncludes(p, ["status"])        ?? "");
      const desc     = cleanNA(pickProp(p, ["DESCRIPTION", "Description", "description", "DETAILS"]) ?? pickPropIncludes(p, ["desc"]) ?? "");
      const when     = toLocalDate(pickProp(p, ["LASTUPDATED", "LastUpdated", "last_edited_date"]) ?? pickPropIncludes(p, ["last", "update"]));
      const detailParts = [
        status   ? titleCase(status)   : "",
        cleanNA(location) ? String(location) : "",
      ].filter(Boolean);
      return {
        tag: "ROAD", tagBg: "bg-blue-100", tagColor: "text-blue-700",
        title:  `${titleCase(String(t))}${route ? " · " + route : ""}`,
        time:   when || "Recent",
        detail: detailParts.join(" · ") || "Waka Kotahi NZTA",
        desc,
      };
    });

    // Highest-alert volcano — NZ-wide, not filtered by radius
    const topVol = [...volcanoes].sort((a, b) => b.properties.level - a.properties.level)[0];
    const volItems = topVol
      ? [{
          tag: "VOL",
          tagBg:    topVol.properties.level >= 2 ? "bg-orange-100" : "bg-green-100",
          tagColor: topVol.properties.level >= 2 ? "text-orange-700" : "text-green-700",
          title:  `${topVol.properties.volcanoTitle} — Level ${topVol.properties.level}`,
          time:   "Current",
          detail: topVol.properties.activity,
          desc:   "",
        }]
      : [];

    return { radiusItems: [...eqItems, ...roadItems], volItems };
  }, [quakesFiltered, roadsFiltered, volcanoes]);

  /* Refresh All */
  function refreshAll() {
    loadQuakes();
    loadRoadEvents();
    loadWeather();
    loadVolcanoes();
  }

  /* ==================================================
     RENDER
     ================================================== */
  return (
    <div className="min-h-screen bg-slate-100">
      {/* ===== Header ===== */}
      <header className="sticky top-0 z-[900] bg-white/95 backdrop-blur border-b shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-2.5 flex items-center gap-3 flex-wrap">

          <div className="flex items-start gap-2 shrink-0">
            <div>
              <span className="text-lg font-bold tracking-tight text-slate-800">
                Community Hazard Dashboard
              </span>
              <div className="text-xs text-slate-400 leading-tight mt-0.5">2025 ver 2. Rasika Nandana.</div>
            </div>
            {alertCount > 0 && (
              <span className="rounded-full bg-red-500 text-white text-xs font-bold px-2 py-0.5 animate-pulse mt-1">
                {alertCount}
              </span>
            )}
          </div>

          <nav className="flex gap-1 shrink-0">
            {(["dashboard", "architecture"] as const).map((v) => (
              <button key={v} onClick={() => setView(v)}
                className={`px-3 py-1 rounded-lg text-xs font-medium border transition-colors ${
                  view === v ? "bg-slate-800 text-white border-slate-800" : "bg-white text-slate-600 hover:bg-slate-50"
                }`}>
                {v === "dashboard" ? "Dashboard" : "Architecture"}
              </button>
            ))}
          </nav>

          {/* Geocoder */}
          <div className="ml-auto flex items-center gap-2 relative flex-wrap">
            <div className="relative">
              <input
                className="rounded-lg border px-3 py-1.5 text-sm w-64 bg-white"
                placeholder="Search NZ address…"
                value={geocodeQuery}
                onChange={(e) => setGeocodeQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && geocodeAddress(geocodeQuery)}
              />
              {geocodeResults.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-lg border shadow-xl z-[1000] max-h-52 overflow-y-auto">
                  {geocodeResults.map((r, i) => (
                    <button key={i} onClick={() => selectGeocodeResult(r)}
                      className="w-full text-left px-3 py-2 text-xs hover:bg-slate-50 border-b last:border-0 text-slate-700">
                      {r.display_name.split(",").slice(0, 4).join(", ")}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button onClick={() => geocodeAddress(geocodeQuery)} disabled={isGeocoding}
              className="rounded-lg border px-3 py-1.5 text-sm bg-white disabled:opacity-50">
              {isGeocoding ? "…" : "Search"}
            </button>
            <button onClick={useMyLocation} className="rounded-lg border px-3 py-1.5 text-sm bg-white">
              📍 My location
            </button>
            <button onClick={refreshAll} className="rounded-lg bg-slate-800 text-white px-3 py-1.5 text-sm font-medium">
              ↻ Refresh all
            </button>
          </div>
        </div>
      </header>

      {/* ===== Views ===== */}
      {view === "architecture" ? (
        <ArchitectureDiagram />
      ) : (
        <main className="max-w-7xl mx-auto p-4 grid grid-cols-1 lg:grid-cols-12 gap-4">

          {/* ===== Left: Map + toggles + community form ===== */}
          <section className="lg:col-span-8 flex flex-col gap-4">

            {/* Map */}
            <div className="bg-white rounded-2xl shadow-sm border">
              <div className="p-3 flex items-center justify-between flex-wrap gap-2">
                <span className="font-semibold text-sm">Interactive Map</span>
                <div className="flex items-center gap-2">
                  <label className="text-xs text-slate-500">Radius</label>
                  <input type="range" min={1} max={300} value={radius}
                    onChange={(e) => setRadius(+e.target.value)} className="w-32" />
                  <span className="text-sm w-16 text-right font-medium text-slate-700">{radius} km</span>
                </div>
              </div>
              <div className="h-[440px] rounded-b-2xl overflow-hidden">
                <div ref={mapDivRef} className="h-full w-full" />
              </div>
            </div>

            {/* Layer toggles */}
            <div className="bg-white rounded-2xl shadow-sm border p-4">
              <div className="font-semibold text-sm mb-3">Map Layers</div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {([
                  ["quakes",    "🔴 Earthquakes"],
                  ["traffic",   "🔵 Road Events"],
                  ["rain",      "🌧 Rainfall (6–24 h)"],
                  ["flood",     "🌊 Flood / Coastal"],
                  ["landslide", "⛰ Landslides"],
                  ["community", "👥 Community Reports"],
                ] as const).map(([k, label]) => (
                  <button key={k} onClick={() => toggle(k as keyof typeof layers)}
                    className={`flex justify-between items-center rounded-xl border px-3 py-2 text-xs font-medium transition-colors ${
                      layers[k as keyof typeof layers]
                        ? "bg-slate-800 text-white border-slate-800"
                        : "bg-white text-slate-600 hover:bg-slate-50"
                    }`}>
                    <span>{label}</span>
                    <span className="opacity-50 ml-1">{layers[k as keyof typeof layers] ? "on" : "off"}</span>
                  </button>
                ))}
              </div>
              <p className="text-xs text-slate-400 mt-2.5">
                Earthquakes and Road Events are live layers. Flood, Landslide, and Community layers are
                planned (LINZ, OpenTopography, community API).
              </p>
            </div>

            {/* Community report form */}
            <div className="bg-white rounded-2xl shadow-sm border p-4">
              <div className="font-semibold text-sm mb-3">Submit Community Report</div>
              <div className="grid gap-3 sm:grid-cols-2">
                <select className="rounded-xl border px-3 py-2 text-sm bg-white">
                  <option>Flooding</option><option>Tree fall</option><option>Road blockage</option>
                  <option>Power outage</option><option>Liquefaction</option><option>Landslide</option>
                  <option>Other</option>
                </select>
                <input className="rounded-xl border px-3 py-2 text-sm" placeholder="Nearest address / landmark" />
                <textarea className="rounded-xl border px-3 py-2 text-sm sm:col-span-2 resize-none" rows={2}
                  placeholder="Describe what you see — e.g. water over road, estimated depth, time started" />
                <div className="flex items-center justify-between sm:col-span-2">
                  <span className="text-xs text-slate-400">Coordinates taken from current map centre.</span>
                  <button className="rounded-xl bg-slate-800 text-white px-4 py-2 text-sm font-medium">
                    Submit report
                  </button>
                </div>
              </div>
            </div>
          </section>

          {/* ===== Right: data panels ===== */}
          <aside className="lg:col-span-4 flex flex-col gap-4">

            {/* Area Summary */}
            <div className="bg-white rounded-2xl shadow-sm border p-4">
              <div className="font-semibold text-sm mb-2">Area Summary</div>
              <div className="flex items-center gap-2 mb-3">
                <span className="rounded-md px-2.5 py-1 text-xs font-bold tracking-wide"
                  style={{ background: hazard.bg, color: hazard.color }}>
                  {hazard.label}
                </span>
                <span className="text-xs text-slate-500">
                  Largest M{maxMag.toFixed(1)} · {radius} km radius
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                {[
                  { label: "Quakes in radius", val: quakesFiltered.length },
                  { label: "Road events",       val: roadsFiltered.length },
                  { label: "Active volcanoes",  val: activeVolcanoes.length },
                  { label: "Map centre",        val: `${mapCenter[0].toFixed(2)}, ${mapCenter[1].toFixed(2)}` },
                ].map(({ label, val }) => (
                  <div key={label} className="rounded-xl border p-2.5">
                    <div className="text-xs text-slate-400">{label}</div>
                    <div className="text-xl font-semibold text-slate-800">{val}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Live Feed: 2 EQ + 2 road (with detail) + NZ volcanic alert */}
            <div className="bg-white rounded-2xl shadow-sm border p-4">
              <div className="font-semibold text-sm mb-2">Live Feed</div>

              {/* Within-radius events */}
              <div className="text-xs text-slate-400 font-semibold uppercase tracking-wide mb-1">
                Within {radius} km
              </div>
              {feedData.radiusItems.length === 0 ? (
                <p className="text-xs text-slate-400 mb-3">
                  No events — adjust radius or click Refresh All.
                </p>
              ) : (
                <ul className="divide-y mb-3">
                  {feedData.radiusItems.map((ev, i) => (
                    <li key={i} className="py-2.5 flex items-start gap-2">
                      <span className={`rounded px-1.5 py-0.5 text-xs font-bold shrink-0 ${ev.tagBg} ${ev.tagColor}`}>
                        {ev.tag}
                      </span>
                      <div>
                        <div className="text-sm font-medium text-slate-800">{ev.title}</div>
                        {ev.time   && <div className="text-xs text-slate-400">{ev.time}</div>}
                        {ev.detail && <div className="text-xs text-slate-500 mt-0.5">{ev.detail}</div>}
                        {ev.desc   && <div className="text-xs text-slate-600 mt-0.5 italic">{ev.desc}</div>}
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              {/* NZ Volcanic Alerts — nationwide, not filtered by radius */}
              {feedData.volItems.length > 0 && (
                <>
                  <div className="text-xs text-slate-400 font-semibold uppercase tracking-wide pt-2 pb-1 border-t">
                    NZ Volcanic Alerts
                  </div>
                  <ul className="divide-y">
                    {feedData.volItems.map((ev, i) => (
                      <li key={i} className="py-2.5 flex items-start gap-2">
                        <span className={`rounded px-1.5 py-0.5 text-xs font-bold shrink-0 ${ev.tagBg} ${ev.tagColor}`}>
                          {ev.tag}
                        </span>
                        <div>
                          <div className="text-sm font-medium text-slate-800">{ev.title}</div>
                          {ev.time   && <div className="text-xs text-slate-400">{ev.time}</div>}
                          {ev.detail && <div className="text-xs text-slate-500 mt-0.5">{ev.detail}</div>}
                        </div>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>

            {/* Weather */}
            <div className="bg-white rounded-2xl shadow-sm border p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="font-semibold text-sm">Weather at map centre</div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400">↻ {wxCountdown}s</span>
                  <button onClick={() => { loadWeather(); setWxCountdown(WX_REFRESH_S); }}
                    disabled={loadingWx}
                    className="rounded-lg border px-2 py-1 text-xs disabled:opacity-50">
                    {loadingWx ? "…" : "Refresh"}
                  </button>
                </div>
              </div>
              {lastWxRefresh && (
                <div className="text-xs text-slate-400 mb-1">Updated {fmtTime(lastWxRefresh)}</div>
              )}
              {errorWx && <div className="text-xs text-red-600">{errorWx}</div>}
              {weather ? (
                <div className="text-sm space-y-1">
                  <div className="font-medium text-slate-700">{wmoCodeToDescription(weather.weathercode)}</div>
                  <div className="text-slate-600">
                    🌡 {weather.temperature}°C &nbsp;·&nbsp; 💨 {weather.windspeed} km/h @ {Math.round(weather.winddirection)}°
                  </div>
                  {weather.precipProb !== null && (
                    <div className={`text-sm ${weather.precipProb >= 70 ? "text-blue-700 font-medium" : "text-slate-600"}`}>
                      🌧 Rain probability: {weather.precipProb}%{weather.precipProb >= 70 && " ⚠ High"}
                    </div>
                  )}
                  <div className="text-xs text-slate-400">
                    Open-Meteo · {mapCenter[0].toFixed(3)}, {mapCenter[1].toFixed(3)}
                  </div>
                </div>
              ) : (
                !loadingWx && <p className="text-xs text-slate-400">Loading weather…</p>
              )}
            </div>

            {/* Earthquakes */}
            <div className="bg-white rounded-2xl shadow-sm border p-4">
              <div className="flex items-center justify-between mb-1 flex-wrap gap-1">
                <div className="font-semibold text-sm">Earthquakes</div>
                <div className="flex items-center gap-1.5">
                  <label className="text-xs text-slate-400">Min M</label>
                  <input type="number" step="0.1" min={0} className="w-16 rounded border px-1.5 py-1 text-xs"
                    value={magMin} onChange={(e) => setMagMin(+e.target.value)} />
                  <button onClick={loadQuakes} disabled={loadingQuakes}
                    className="rounded-lg border px-2 py-1 text-xs disabled:opacity-50">
                    {loadingQuakes ? "…" : "↻"}
                  </button>
                </div>
              </div>
              <div className="text-xs text-slate-400 mb-2">
                {lastQuakeRefresh
                  ? `Updated ${fmtTime(lastQuakeRefresh)} · auto-refresh in ${quakeCountdown}s`
                  : "Loading…"}
              </div>
              {errorQuakes && <div className="text-xs text-red-600 mb-2">{errorQuakes}</div>}
              {quakesFiltered.length === 0 && !loadingQuakes && (
                <div className="text-xs text-slate-400">No quakes ≥ M{magMin} within {radius} km.</div>
              )}
              <ul className="divide-y">
                {quakesFiltered.slice(0, 12).map((q) => {
                  const hl = hazardLevelFromMag(q.properties.magnitude);
                  return (
                    <li key={q.properties.publicID} className="py-2">
                      <div className="flex items-center gap-2">
                        <span className="rounded px-1.5 py-0.5 text-xs font-bold shrink-0"
                          style={{ background: hl.bg, color: hl.color }}>
                          M{q.properties.magnitude.toFixed(1)}
                        </span>
                        <span className="text-sm font-medium text-slate-800 truncate">
                          {q.properties.locality}
                        </span>
                      </div>
                      <div className="text-xs text-slate-400 mt-0.5">
                        {new Date(q.properties.time).toLocaleString()} · {q.properties.depth} km · MMI {q.properties.mmi}
                      </div>
                      <a className="text-xs text-blue-600 underline"
                        href={`https://www.geonet.org.nz/earthquake/${q.properties.publicID}`}
                        target="_blank" rel="noreferrer">
                        GeoNet →
                      </a>
                    </li>
                  );
                })}
              </ul>
            </div>

            {/* Volcanic Alert Levels */}
            <div className="bg-white rounded-2xl shadow-sm border p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="font-semibold text-sm">Volcanic Alert Levels</div>
                <button onClick={loadVolcanoes} disabled={loadingVol}
                  className="rounded-lg border px-2 py-1 text-xs disabled:opacity-50">
                  {loadingVol ? "…" : "↻"}
                </button>
              </div>
              {errorVol && <div className="text-xs text-red-600 mb-2">{errorVol}</div>}
              {volcanoes.length === 0 && !loadingVol && (
                <div className="text-xs text-slate-400">Click ↻ to load.</div>
              )}
              <ul className="divide-y">
                {volcanoes.map((v) => (
                  <li key={v.properties.volcanoID} className="py-2 flex items-center gap-2.5">
                    <span className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                      style={{
                        background: volcanoLevelColor(v.properties.level),
                        color: v.properties.level <= 1 ? "#166534" : "#fff",
                      }}>
                      {v.properties.level}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-slate-800">{v.properties.volcanoTitle}</div>
                      <div className="text-xs text-slate-500 truncate">{v.properties.activity}</div>
                    </div>
                    {v.properties.activityBulletinURL && (
                      <a href={v.properties.activityBulletinURL} target="_blank" rel="noreferrer"
                        className="text-xs text-blue-600 underline shrink-0">
                        Bulletin →
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </div>

            {/* Road Events */}
            <div className="bg-white rounded-2xl shadow-sm border p-4">
              <div className="flex items-center justify-between mb-1">
                <div className="font-semibold text-sm">Road Events</div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400">↻ {roadCountdown}s</span>
                  <button onClick={loadRoadEvents} disabled={loadingRoad}
                    className="rounded-lg border px-2 py-1 text-xs disabled:opacity-50">
                    {loadingRoad ? "…" : "Refresh"}
                  </button>
                </div>
              </div>
              {lastRoadRefresh && (
                <div className="text-xs text-slate-400 mb-2">Updated {fmtTime(lastRoadRefresh)}</div>
              )}
              {errorRoad && <div className="text-xs text-red-600 mb-2">{errorRoad}</div>}
              {roadsFiltered.length === 0 && !loadingRoad && !errorRoad && (
                <div className="text-xs text-slate-400">No road events within {radius} km.</div>
              )}
              <ul className="divide-y">
                {roadsFiltered
                  .map((ev) => {
                    const p = ev.properties || {};
                    const eventType =
                      pickProp(p, ["EVENTTYPE", "EventType", "eventType", "event_type"]) ??
                      pickPropIncludes(p, ["event", "type"]);
                    const status =
                      pickProp(p, ["STATUS", "Status", "status"]) ??
                      pickPropIncludes(p, ["status"]);
                    const route =
                      pickProp(p, ["ROUTE", "Route", "route", "road", "roadname"]) ??
                      pickPropIncludes(p, ["route"]);
                    const location =
                      pickProp(p, ["LOCATION", "Location", "location", "locality"]) ??
                      pickPropIncludes(p, ["loc"]);
                    const desc =
                      pickProp(p, ["DESCRIPTION", "Description", "description", "DETAILS"]) ??
                      pickPropIncludes(p, ["desc"]);
                    const lastUp =
                      pickProp(p, ["LASTUPDATED", "LastUpdated", "last_edited_date"]) ??
                      pickPropIncludes(p, ["last", "update"]);
                    const id =
                      pickProp(p, ["OBJECTID", "ObjectID", "objectid", "id"]) ?? Math.random();
                    const hasMeaningful = cleanNA(eventType) || cleanNA(status) || cleanNA(desc);
                    return { id, eventType, status, route, location, desc, lastUp, hasMeaningful };
                  })
                  .filter((x) => x.hasMeaningful)
                  .slice(0, 20)
                  .map(({ id, eventType, status, route, location, desc, lastUp }) => (
                    <li key={String(id)} className="py-2">
                      <div className="text-sm font-medium text-slate-800">
                        {cleanNA(eventType) ? titleCase(String(eventType)) : "Road Event"}
                        {route    ? ` · ${route}`    : ""}
                        {location ? ` · ${location}` : ""}
                      </div>
                      <div className="text-xs text-slate-400">
                        {cleanNA(status) ? titleCase(String(status)) : "Active"}
                        {lastUp ? " · " + toLocalDate(lastUp) : ""}
                      </div>
                      {cleanNA(desc) && (
                        <div className="text-xs text-slate-500 mt-0.5">{String(desc)}</div>
                      )}
                    </li>
                  ))}
              </ul>
            </div>

          </aside>
        </main>
      )}

      <footer className="max-w-7xl mx-auto px-4 py-5 text-xs text-slate-400 border-t mt-2">
        Data:{" "}
        <a className="underline" href="https://www.geonet.org.nz"    target="_blank">GeoNet</a>{" "}·{" "}
        <a className="underline" href="https://www.nzta.govt.nz"     target="_blank">Waka Kotahi NZTA</a>{" "}·{" "}
        <a className="underline" href="https://www.openstreetmap.org" target="_blank">OpenStreetMap / Nominatim</a>{" "}·{" "}
        <a className="underline" href="https://open-meteo.com"        target="_blank">Open-Meteo</a>.{" "}
        For demonstration purposes only — not for operational emergency use. Rasika Nandana 2025.
      </footer>
    </div>
  );
}
