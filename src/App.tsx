import React, { useEffect, useRef, useState } from "react";

/* =========================
   Types for live data
   ========================= */
// GeoNet recent quakes (MMI >= 3)
type QuakeFeature = {
  type: "Feature";
  geometry: { type: "Point"; coordinates: [number, number] }; // [lon, lat]
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

// NZTA / Waka Kotahi Road Events (GeoJSON Feature)
type RoadEventFeature = {
  type: "Feature";
  geometry?: { type: "Point"; coordinates: [number, number] }; // [lon, lat]
  properties: Record<string, any>;
};

// Open-Meteo (very small slice)
type WeatherNow = {
  temperature: number;
  windspeed: number;
  winddirection: number;
  weathercode: number;
};

/* =========================
   Constants (APIs)
   ========================= */
const GEONET_RECENT = "https://api.geonet.org.nz/quake?MMI=3"; // needs Accept header
const NZTA_ROAD_EVENTS =
  "https://services.arcgis.com/CXBb7LAjgIIdcsPt/arcgis/rest/services/NZTA_Highway_Information/FeatureServer/0/query?outFields=*&where=1%3D1&f=geojson";

// default map center (NZ)
const DEFAULT_CENTER: [number, number] = [-41.2866, 174.7762]; // Wellington lat, lon-ish

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
    const lk = k.toLowerCase();
    if (lower.every((s) => lk.includes(s))) return v;
  }
  return undefined;
}
function toLocalDate(val: any): string {
  if (val == null) return "";
  const n = Number(val);
  if (!Number.isNaN(n)) {
    const ms = n < 1e12 ? n * 1000 : n; // seconds or ms
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
  const na = new Set(["n/a", "na", "not applicable", "not applicable.", "not applicable,", "n/a.", "n/a,"]);
  return na.has(t) ? "" : String(s).trim();
}
function titleCase(s: string) {
  return s
    .toLowerCase()
    .split(/\s+/)
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : ""))
    .join(" ");
}

/* Use Leaflet from CDN */
declare const L: any;

/* =========================
   Small Architecture stub
   ========================= */
function ArchitectureDiagram() {
  return (
    <main className="max-w-7xl mx-auto p-4">
      <h2 className="text-xl font-bold mb-2">One-Page Architecture Diagram</h2>
      <p className="text-sm text-gray-600">
        Data sources → adapters → aggregator (optional) → cache/WebSocket → React UI
      </p>
      <div className="mt-4 p-4 rounded-xl border bg-white">
        <p className="text-sm text-gray-600">(Insert your SVG diagram here; omitted for brevity.)</p>
      </div>
    </main>
  );
}

/* =========================
   Main App
   ========================= */
export default function App() {
  /* --------- UI state --------- */
  const [view, setView] = useState<"dashboard" | "architecture">("dashboard");
  const [radius, setRadius] = useState(10);
  const [layers, setLayers] = useState({
    quakes: true,
    traffic: true,
    rain: true,
    flood: false,
    landslide: false,
    community: true,
  });
  const toggle = (k: keyof typeof layers) => setLayers((s) => ({ ...s, [k]: !s[k] }));

  /* --------- Map (Leaflet) --------- */
  const mapDivRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const quakesLayerRef = useRef<any>(null);
  const roadsLayerRef = useRef<any>(null);
  const [mapCenter, setMapCenter] = useState<[number, number]>(DEFAULT_CENTER);

  useEffect(() => {
    if (!mapDivRef.current || mapRef.current || typeof L === "undefined") return;
    const map = L.map(mapDivRef.current).setView(DEFAULT_CENTER, 6);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map);

    const quakesLayer = L.layerGroup().addTo(map);
    const roadsLayer = L.layerGroup().addTo(map);

    map.on("moveend", () => {
      const c = map.getCenter();
      setMapCenter([c.lat, c.lng]);
    });

    mapRef.current = map;
    quakesLayerRef.current = quakesLayer;
    roadsLayerRef.current = roadsLayer;
  }, []);

  /* --------- GeoNet quakes --------- */
  const [quakes, setQuakes] = useState<QuakeFeature[]>([]);
  const [loadingQuakes, setLoadingQuakes] = useState(false);
  const [errorQuakes, setErrorQuakes] = useState<string | null>(null);
  const [magMin, setMagMin] = useState(3.0); // client-side magnitude threshold

  async function loadQuakes() {
    try {
      setLoadingQuakes(true);
      setErrorQuakes(null);
      const res = await fetch(GEONET_RECENT, {
        headers: { Accept: "application/vnd.geo+json;version=2" },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: QuakeFC = await res.json();
      const sorted = [...data.features].sort(
        (a, b) => new Date(b.properties.time).getTime() - new Date(a.properties.time).getTime()
      );
      setQuakes(sorted.slice(0, 100));
    } catch (e: any) {
      setErrorQuakes(e.message || "Failed to load quakes");
    } finally {
      setLoadingQuakes(false);
    }
  }

  // draw quakes on the map whenever quakes or magMin change
  useEffect(() => {
    if (!quakesLayerRef.current || !mapRef.current) return;
    const layer = quakesLayerRef.current;
    layer.clearLayers();
    quakes
      .filter((q) => (q.properties?.magnitude ?? 0) >= magMin)
      .forEach((q) => {
        const [lon, lat] = q.geometry.coordinates;
        const mag = q.properties.magnitude ?? 0;
        const color =
          mag >= 5 ? "#d73027" : mag >= 4 ? "#fc8d59" : mag >= 3 ? "#fee08b" : "#d9ef8b";
        const radius = Math.max(4, mag * 2.2);
        L.circleMarker([lat, lon], {
          radius,
          color,
          weight: 1,
          fillColor: color,
          fillOpacity: 0.7,
        })
          .bindPopup(
            `<b>M${mag.toFixed(1)}</b> • ${q.properties.locality}<br/>` +
              `${new Date(q.properties.time).toLocaleString()} • depth ${q.properties.depth} km<br/>` +
              `MMI ${q.properties.mmi} • ${q.properties.quality}<br/>` +
              `<a href="https://www.geonet.org.nz/earthquake/${q.properties.publicID}" target="_blank">View on GeoNet</a>`
          )
          .addTo(layer);
      });
  }, [quakes, magMin]);

  /* --------- NZTA road events (robust field mapping) --------- */
  const [roadEvents, setRoadEvents] = useState<RoadEventFeature[]>([]);
  const [loadingRoad, setLoadingRoad] = useState(false);
  const [errorRoad, setErrorRoad] = useState<string | null>(null);

  async function loadRoadEvents() {
    try {
      setLoadingRoad(true);
      setErrorRoad(null);
      const res = await fetch(NZTA_ROAD_EVENTS);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const feats = (data.features || []) as RoadEventFeature[];
      setRoadEvents(feats);
    } catch (e: any) {
      setErrorRoad(e.message || "Failed to load road events");
    } finally {
      setLoadingRoad(false);
    }
  }

  // draw road events on the map whenever they change
  useEffect(() => {
    if (!roadsLayerRef.current || !mapRef.current) return;
    const layer = roadsLayerRef.current;
    layer.clearLayers();
    roadEvents.forEach((ev) => {
      const coords = ev.geometry?.coordinates;
      if (!coords) return;
      const [lon, lat] = coords;
      const p = ev.properties || {};
      const eventType =
        pickProp(p, ["EVENTTYPE", "EventType", "eventType", "event_type"]) ??
        pickPropIncludes(p, ["event", "type"]) ??
        "Road Event";
      const status = cleanNA(
        pickProp(p, ["STATUS", "Status", "status"]) ?? pickPropIncludes(p, ["status"])
      );
      const route =
        pickProp(p, ["ROUTE", "Route", "route", "road", "roadname"]) ??
        pickPropIncludes(p, ["route"]) ??
        "";
      const location =
        pickProp(p, ["LOCATION", "Location", "location", "locality"]) ??
        pickPropIncludes(p, ["loc"]) ??
        "";

      const marker = L.circleMarker([lat, lon], {
        radius: 6,
        color: "#2b83ba",
        weight: 1,
        fillColor: "#2b83ba",
        fillOpacity: 0.8,
      }).addTo(layer);
      marker.bindPopup(
        `<b>${titleCase(String(eventType))}</b>${route ? ` • ${route}` : ""}${location ? ` • ${location}` : ""}<br/>` +
          `${status ? titleCase(String(status)) + " • " : ""}` +
          `<small>(Data: Waka Kotahi NZTA)</small>`
      );
    });
  }, [roadEvents]);

  /* --------- Open-Meteo (weather at map center) --------- */
  const [weather, setWeather] = useState<WeatherNow | null>(null);
  const [loadingWx, setLoadingWx] = useState(false);
  const [errorWx, setErrorWx] = useState<string | null>(null);

  async function loadWeather(lat = mapCenter[0], lon = mapCenter[1]) {
    try {
      setLoadingWx(true);
      setErrorWx(null);
      const url = new URL("https://api.open-meteo.com/v1/forecast");
      url.searchParams.set("latitude", String(lat));
      url.searchParams.set("longitude", String(lon));
      url.searchParams.set("current_weather", "true");
      const res = await fetch(url.toString());
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const cw = data.current_weather;
      if (cw) {
        setWeather({
          temperature: cw.temperature,
          windspeed: cw.windspeed,
          winddirection: cw.winddirection,
          weathercode: cw.weathercode,
        });
      } else {
        setWeather(null);
      }
    } catch (e: any) {
      setErrorWx(e.message || "Failed to load weather");
    } finally {
      setLoadingWx(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top bar */}
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur border-b">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-3">
          <div className="text-xl font-bold tracking-tight">Community Hazard Dashboard</div>
          <nav className="ml-4 flex items-center gap-2">
            <button
              onClick={() => setView("dashboard")}
              className={`px-3 py-1.5 rounded-xl text-sm border ${view === "dashboard" ? "bg-black text-white" : "bg-white"}`}
            >
              Dashboard
            </button>
            <button
              onClick={() => setView("architecture")}
              className={`px-3 py-1.5 rounded-xl text-sm border ${view === "architecture" ? "bg-black text-white" : "bg-white"}`}
            >
              Architecture
            </button>
          </nav>
          <div className="ml-auto flex items-center gap-2 w-full sm:w-[520px]">
            <input className="w-full rounded-xl border px-3 py-2 text-sm" placeholder="Search address e.g. 123 Queen St" />
            <button className="rounded-xl bg-black text-white px-4 py-2 text-sm">Locate</button>
          </div>
        </div>
      </header>

      {/* Main */}
      {view === "architecture" ? (
        <ArchitectureDiagram />
      ) : (
        <main className="max-w-7xl mx-auto p-4 grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Left column: Map + toggles + community form */}
          <section className="lg:col-span-8 flex flex-col gap-4">
            {/* Map card */}
            <div className="bg-white rounded-2xl shadow-sm border">
              <div className="p-3 flex items-center justify-between">
                <div className="font-semibold">Map</div>
                <div className="flex items-center gap-2">
                  <label className="text-sm text-gray-600">Radius</label>
                  <input type="range" min={1} max={50} value={radius} onChange={(e) => setRadius(parseInt(e.target.value))} />
                  <span className="text-sm w-10 text-right">{radius} km</span>
                  <button className="rounded-lg border px-3 py-1 text-sm">Draw Area</button>
                </div>
              </div>
              <div className="h-[420px] rounded-b-2xl overflow-hidden">
                <div ref={mapDivRef} className="h-full w-full" />
              </div>
            </div>

            {/* Layer toggles */}
            <div className="bg-white rounded-2xl shadow-sm border p-4">
              <div className="font-semibold mb-2">Layers</div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {([
                  ["quakes", "Earthquakes (MMI)"] as const,
                  ["traffic", "Traffic / Road Events"] as const,
                  ["rain", "Rain (6–24h)"] as const,
                  ["flood", "Flood / Coastal risk"] as const,
                  ["landslide", "Landslides"] as const,
                  ["community", "Community Reports"] as const,
                ] as const).map(([k, label]) => (
                  <button
                    key={k}
                    onClick={() => toggle(k)}
                    className={`justify-between flex items-center rounded-xl border px-3 py-2 text-sm ${
                      layers[k as keyof typeof layers] ? "bg-black text-white" : "bg-white"
                    }`}
                  >
                    <span>{label}</span>
                    <span className="text-xs opacity-70">{layers[k as keyof typeof layers] ? "on" : "off"}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Community report form (demo) */}
            <div className="bg-white rounded-2xl shadow-sm border p-4">
              <div className="font-semibold mb-3">Report an Issue (Community)</div>
              <div className="grid gap-3 sm:grid-cols-2">
                <select className="rounded-xl border px-3 py-2 text-sm">
                  <option>Flooding</option>
                  <option>Tree fall</option>
                  <option>Road blockage</option>
                  <option>Power outage</option>
                  <option>Other</option>
                </select>
                <input className="rounded-xl border px-3 py-2 text-sm" placeholder="Nearest address / landmark" />
                <textarea className="rounded-xl border px-3 py-2 text-sm sm:col-span-2" placeholder="Describe what you see (e.g., water across road, depth, time)" />
                <div className="flex items-center justify-between sm:col-span-2">
                  <div className="text-xs text-gray-500">Location will use current map center unless you draw a point.</div>
                  <button className="rounded-xl bg-black text-white px-4 py-2 text-sm">Submit report</button>
                </div>
              </div>
            </div>
          </section>

          {/* Right column: Live feed + live data cards + summary */}
          <aside className="lg:col-span-4 flex flex-col gap-4">
            {/* Live Feed (demo) */}
            <div className="bg-white rounded-2xl shadow-sm border p-4">
              <div className="font-semibold mb-2">Live Feed</div>
              <ul className="divide-y">
                {[
                  { time: "2 min ago", title: "Road closure – SH2 slip near Kaitoke", detail: "Detour via Plateau Rd. Expect delays." },
                  { time: "12 min ago", title: "Quake M3.9 – 15 km NE of Wellington", detail: "MMI 3 (weak) reported in Lower Hutt." },
                  { time: "25 min ago", title: "Heavy rain band moving east", detail: "Last 6h: 18 mm in Hutt Valley stations." },
                ].map((it, i) => (
                  <li key={i} className="py-3">
                    <div className="text-sm font-medium">{it.title}</div>
                    <div className="text-xs text-gray-500">{it.time}</div>
                    <div className="text-sm text-gray-600 mt-1">{it.detail}</div>
                  </li>
                ))}
              </ul>
            </div>

            {/* Weather at map center (Open-Meteo) */}
            <div className="bg-white rounded-2xl shadow-sm border p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="font-semibold">Weather (map center)</div>
                <button onClick={() => loadWeather()} className="rounded-lg border px-3 py-1 text-sm" disabled={loadingWx}>
                  {loadingWx ? "Loading…" : "Refresh"}
                </button>
              </div>
              {errorWx && <div className="text-sm text-red-600">Error: {errorWx}</div>}
              {!loadingWx && !weather && !errorWx && <div className="text-sm text-gray-500">No data loaded yet — click Refresh.</div>}
              {weather && (
                <div className="text-sm">
                  <div className="text-gray-600">Lat {mapCenter[0].toFixed(3)}, Lon {mapCenter[1].toFixed(3)}</div>
                  <div className="mt-1">Temp: <span className="font-medium">{weather.temperature}°C</span></div>
                  <div>Wind: {weather.windspeed} km/h • Dir {Math.round(weather.winddirection)}°</div>
                </div>
              )}
            </div>

            {/* Earthquakes (live from GeoNet) */}
            <div className="bg-white rounded-2xl shadow-sm border p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="font-semibold">Earthquakes (GeoNet, MMI ≥ 3)</div>
                <div className="flex items-center gap-2">
                  <label className="text-xs text-gray-500">Min mag</label>
                  <input
                    type="number"
                    step="0.1"
                    min={0}
                    className="w-20 rounded border px-2 py-1 text-sm"
                    value={magMin}
                    onChange={(e) => setMagMin(Number(e.target.value))}
                  />
                  <button onClick={loadQuakes} className="rounded-lg border px-3 py-1 text-sm" disabled={loadingQuakes}>
                    {loadingQuakes ? "Loading…" : "Refresh"}
                  </button>
                </div>
              </div>
              {errorQuakes && <div className="text-sm text-red-600">Error: {errorQuakes}</div>}
              {!loadingQuakes && quakes.length === 0 && !errorQuakes && (
                <div className="text-sm text-gray-500">No data loaded yet — click Refresh.</div>
              )}
              <ul className="divide-y">
                {quakes
                  .filter((q) => (q.properties?.magnitude ?? 0) >= magMin)
                  .map((q) => (
                    <li key={q.properties.publicID} className="py-3">
                      <div className="text-sm font-medium">
                        M{q.properties.magnitude.toFixed(1)} • {q.properties.locality}
                      </div>
                      <div className="text-xs text-gray-500">
                        {new Date(q.properties.time).toLocaleString()} • depth {q.properties.depth} km • MMI {q.properties.mmi} •{" "}
                        {q.properties.quality}
                      </div>
                      <div className="text-xs mt-1">
                        <a
                          className="underline text-blue-700"
                          href={`https://www.geonet.org.nz/earthquake/${q.properties.publicID}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          View on GeoNet
                        </a>
                      </div>
                    </li>
                  ))}
              </ul>
            </div>

            {/* Road Events (live from Waka Kotahi) */}
            <div className="bg-white rounded-2xl shadow-sm border p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="font-semibold">Road Events (NZTA)</div>
                <button onClick={loadRoadEvents} className="rounded-lg border px-3 py-1 text-sm" disabled={loadingRoad}>
                  {loadingRoad ? "Loading…" : "Refresh"}
                </button>
              </div>
              {errorRoad && <div className="text-sm text-red-600">Error: {errorRoad}</div>}
              {!loadingRoad && roadEvents.length === 0 && !errorRoad && (
                <div className="text-sm text-gray-500">No data loaded yet — click Refresh.</div>
              )}
              <ul className="divide-y">
                {roadEvents
                  .map((ev) => {
                    const p = ev.properties || {};
                    const eventType =
                      pickProp(p, ["EVENTTYPE", "EventType", "eventType", "event_type"]) ??
                      pickPropIncludes(p, ["event", "type"]);
                    const status =
                      pickProp(p, ["STATUS", "Status", "status"]) ?? pickPropIncludes(p, ["status"]);
                    const severity =
                      pickProp(p, ["SEVERITY", "Severity", "severity"]) ?? pickPropIncludes(p, ["severity"]);
                    const route =
                      pickProp(p, ["ROUTE", "Route", "route", "road", "roadname"]) ??
                      pickPropIncludes(p, ["route"]);
                    const location =
                      pickProp(p, ["LOCATION", "Location", "location", "locality"]) ??
                      pickPropIncludes(p, ["loc"]);
                    const desc =
                      pickProp(p, ["DESCRIPTION", "Description", "description", "DETAILS"]) ??
                      pickPropIncludes(p, ["desc"]);
                    const lastUpdated =
                      pickProp(p, ["LASTUPDATED", "LastUpdated", "lastupdated", "last_edited_date"]) ??
                      pickPropIncludes(p, ["last", "update"]);
                    const when = toLocalDate(lastUpdated);
                    const id = pickProp(p, ["OBJECTID", "ObjectID", "objectid", "id"]) ?? Math.random();

                    const hasMeaningful =
                      cleanNA(eventType) || cleanNA(status) || cleanNA(severity) || cleanNA(desc);

                    return { id, eventType, status, severity, route, location, desc, when, hasMeaningful, geom: ev.geometry };
                  })
                  .filter((x) => x.hasMeaningful)
                  .slice(0, 20)
                  .map(({ id, eventType, status, severity, route, location, desc, when }) => (
                    <li key={String(id)} className="py-3">
                      <div className="text-sm font-medium">
                        {cleanNA(eventType) ? titleCase(String(eventType)) : "Road Event"}
                        {route ? ` • ${route}` : ""} {location ? ` • ${location}` : ""}
                      </div>
                      <div className="text-xs text-gray-500">
                        {cleanNA(status) ? titleCase(String(status)) : "Active/Planned"}
                        {cleanNA(severity) ? ` • ${titleCase(String(severity))}` : ""}
                        {when ? ` • ${when}` : ""}
                      </div>
                      {cleanNA(desc) && <div className="text-sm text-gray-600 mt-1">{String(desc)}</div>}
                    </li>
                  ))}
              </ul>
            </div>

            {/* Area summary (demo) */}
            <div className="bg-white rounded-2xl shadow-sm border p-4">
              <div className="font-semibold mb-2">Area Summary</div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-xl border p-3">
                  <div className="text-xs text-gray-500">Quakes shown (≥ mag)</div>
                  <div className="text-2xl font-semibold">
                    {quakes.filter((q) => (q.properties?.magnitude ?? 0) >= magMin).length}
                  </div>
                </div>
                <div className="rounded-xl border p-3">
                  <div className="text-xs text-gray-500">Road events loaded</div>
                  <div className="text-2xl font-semibold">{roadEvents.length}</div>
                </div>
                <div className="rounded-xl border p-3">
                  <div className="text-xs text-gray-500">Map center</div>
                  <div className="text-2xl font-semibold">
                    {mapCenter[0].toFixed(2)}, {mapCenter[1].toFixed(2)}
                  </div>
                </div>
                <div className="rounded-xl border p-3">
                  <div className="text-xs text-gray-500">Radius</div>
                  <div className="text-2xl font-semibold">{radius} km</div>
                </div>
              </div>
            </div>
          </aside>
        </main>
      )}

      <footer className="max-w-7xl mx-auto px-4 py-6 text-xs text-gray-500">
        Data sources: GeoNet, Waka Kotahi NZTA, OpenStreetMap, Open-Meteo. For demonstration only.
      </footer>
    </div>
  );
}
