// src/App.tsx
import React, { useState } from "react";

/* =========================
   Types for live data
   ========================= */
// GeoNet recent quakes (MMI >= 3)
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

// NZTA / Waka Kotahi Road Events (GeoJSON Feature)
type RoadEventFeature = {
  type: "Feature";
  properties: Record<string, any>; // fields vary per service revision
};

/* =========================
   Constants (APIs)
   ========================= */
const GEONET_RECENT = "https://api.geonet.org.nz/quake?MMI=3";
const NZTA_ROAD_EVENTS =
  "https://services.arcgis.com/CXBb7LAjgIIdcsPt/arcgis/rest/services/NZTA_Highway_Information/FeatureServer/0/query?outFields=*&where=1%3D1&f=geojson";

/* =========================
   Helpers (field picking)
   ========================= */
function pickProp(
  obj: Record<string, any>,
  candidates: string[]
): any | undefined {
  // try exact first
  for (const k of candidates) if (obj[k] != null) return obj[k];
  // then case-insensitive
  const map: Record<string, string> = {};
  Object.keys(obj).forEach((k) => (map[k.toLowerCase()] = k));
  for (const k of candidates) {
    const found = map[k.toLowerCase()];
    if (found && obj[found] != null) return obj[found];
  }
  return undefined;
}

function pickPropIncludes(
  obj: Record<string, any>,
  substrs: string[]
): any | undefined {
  const entries = Object.entries(obj);
  const lower = substrs.map((s) => s.toLowerCase());
  for (const [k, v] of entries) {
    const lk = k.toLowerCase();
    if (lower.every((s) => lk.includes(s))) return v;
  }
  return undefined;
}

function toLocalDate(val: any): string {
  if (val == null) return "";
  const n = Number(val);
  if (!Number.isNaN(n)) {
    const ms = n < 1e12 ? n * 1000 : n; // handle seconds or ms
    const d = new Date(ms);
    if (!Number.isNaN(d.getTime())) return d.toLocaleString();
  }
  if (typeof val === "string") {
    const d = new Date(val);
    if (!Number.isNaN(d.getTime())) return d.toLocaleString();
  }
  return String(val);
}

/* =========================
   Components
   ========================= */
function ArchitectureDiagram() {
  return (
    <main className="max-w-7xl mx-auto p-4">
      <h2 className="text-xl font-bold mb-2">One-Page Architecture Diagram</h2>
      <p className="text-sm text-gray-600">
        Data sources → adapters → aggregator API → cache/WebSocket → React UI
      </p>
      <div className="mt-4 p-4 rounded-xl border bg-white">
        <p className="text-sm text-gray-600">
          (Your SVG diagram can be inserted here; omitted for brevity.)
        </p>
      </div>
    </main>
  );
}

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
  const toggle = (k: keyof typeof layers) =>
    setLayers((s) => ({ ...s, [k]: !s[k] }));

  /* --------- GeoNet quakes --------- */
  const [quakes, setQuakes] = useState<QuakeFeature[]>([]);
  const [loadingQuakes, setLoadingQuakes] = useState(false);
  const [errorQuakes, setErrorQuakes] = useState<string | null>(null);

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
        (a, b) =>
          new Date(b.properties.time).getTime() -
          new Date(a.properties.time).getTime()
      );
      setQuakes(sorted.slice(0, 20));
    } catch (e: any) {
      setErrorQuakes(e.message || "Failed to load quakes");
    } finally {
      setLoadingQuakes(false);
    }
  }

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
      // Helpful: peek at field names in devtools
      if (feats[0]) {
        // eslint-disable-next-line no-console
        console.log("NZTA sample fields:", Object.keys(feats[0].properties));
      }
    } catch (e: any) {
      setErrorRoad(e.message || "Failed to load road events");
    } finally {
      setLoadingRoad(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top bar */}
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur border-b">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-3">
          <div className="text-xl font-bold tracking-tight">
            Community Hazard Dashboard
          </div>
          <span className="text-xs text-gray-500 hidden sm:block">
            GovHack NZ • MVP
          </span>
          <nav className="ml-4 flex items-center gap-2">
            <button
              onClick={() => setView("dashboard")}
              className={`px-3 py-1.5 rounded-xl text-sm border ${
                view === "dashboard" ? "bg-black text-white" : "bg-white"
              }`}
            >
              Dashboard
            </button>
            <button
              onClick={() => setView("architecture")}
              className={`px-3 py-1.5 rounded-xl text-sm border ${
                view === "architecture" ? "bg-black text-white" : "bg-white"
              }`}
            >
              Architecture
            </button>
          </nav>
          <div className="ml-auto flex items-center gap-2 w-full sm:w-[520px]">
            <input
              className="w-full rounded-xl border px-3 py-2 text-sm"
              placeholder="Search address e.g. 123 Queen St, Lower Hutt"
            />
            <button className="rounded-xl bg-black text-white px-4 py-2 text-sm">
              Locate
            </button>
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
                  <input
                    type="range"
                    min={1}
                    max={50}
                    value={radius}
                    onChange={(e) => setRadius(parseInt(e.target.value))}
                  />
                  <span className="text-sm w-10 text-right">{radius} km</span>
                  <button className="rounded-lg border px-3 py-1 text-sm">
                    Draw Area
                  </button>
                </div>
              </div>
              <div className="h-[420px] bg-gradient-to-br from-gray-100 to-gray-200 rounded-b-2xl grid place-items-center text-gray-500">
                <div className="text-center">
                  <div className="text-5xl">🗺️</div>
                  <div className="mt-2 text-sm">(Map placeholder for Leaflet/MapLibre)</div>
                </div>
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
                      layers[k as keyof typeof layers]
                        ? "bg-black text-white"
                        : "bg-white"
                    }`}
                  >
                    <span>{label}</span>
                    <span className="text-xs opacity-70">
                      {layers[k as keyof typeof layers] ? "on" : "off"}
                    </span>
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
                <input
                  className="rounded-xl border px-3 py-2 text-sm"
                  placeholder="Nearest address / landmark"
                />
                <textarea
                  className="rounded-xl border px-3 py-2 text-sm sm:col-span-2"
                  placeholder="Describe what you see (e.g., water across road, depth, time)"
                />
                <div className="flex items-center justify-between sm:col-span-2">
                  <div className="text-xs text-gray-500">
                    Location will use current map center unless you draw a point.
                  </div>
                  <button className="rounded-xl bg-black text-white px-4 py-2 text-sm">
                    Submit report
                  </button>
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
                  {
                    time: "2 min ago",
                    title: "Road closure – SH2 slip near Kaitoke",
                    detail: "Detour via Plateau Rd. Expect delays.",
                  },
                  {
                    time: "12 min ago",
                    title: "Quake M3.9 – 15 km NE of Wellington",
                    detail: "MMI 3 (weak) reported in Lower Hutt.",
                  },
                  {
                    time: "25 min ago",
                    title: "Heavy rain band moving east",
                    detail: "Last 6h: 18 mm in Hutt Valley stations.",
                  },
                ].map((it, i) => (
                  <li key={i} className="py-3">
                    <div className="text-sm font-medium">{it.title}</div>
                    <div className="text-xs text-gray-500">{it.time}</div>
                    <div className="text-sm text-gray-600 mt-1">{it.detail}</div>
                  </li>
                ))}
              </ul>
            </div>

            {/* Earthquakes (live from GeoNet) */}
            <div className="bg-white rounded-2xl shadow-sm border p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="font-semibold">Earthquakes (GeoNet, MMI ≥ 3)</div>
                <button
                  onClick={loadQuakes}
                  className="rounded-lg border px-3 py-1 text-sm"
                  disabled={loadingQuakes}
                >
                  {loadingQuakes ? "Loading…" : "Refresh"}
                </button>
              </div>

              {errorQuakes && (
                <div className="text-sm text-red-600">Error: {errorQuakes}</div>
              )}

              {!loadingQuakes && quakes.length === 0 && !errorQuakes && (
                <div className="text-sm text-gray-500">
                  No data loaded yet — click Refresh.
                </div>
              )}

              <ul className="divide-y">
                {quakes.map((q) => (
                  <li key={q.properties.publicID} className="py-3">
                    <div className="text-sm font-medium">
                      M{q.properties.magnitude.toFixed(1)} • {q.properties.locality}
                    </div>
                    <div className="text-xs text-gray-500">
                      {new Date(q.properties.time).toLocaleString()} • depth{" "}
                      {q.properties.depth} km • MMI {q.properties.mmi} •{" "}
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
                <button
                  onClick={loadRoadEvents}
                  className="rounded-lg border px-3 py-1 text-sm"
                  disabled={loadingRoad}
                >
                  {loadingRoad ? "Loading…" : "Refresh"}
                </button>
              </div>

              {errorRoad && (
                <div className="text-sm text-red-600">Error: {errorRoad}</div>
              )}
              {!loadingRoad && roadEvents.length === 0 && !errorRoad && (
                <div className="text-sm text-gray-500">
                  No data loaded yet — click Refresh.
                </div>
              )}

              <ul className="divide-y">
                {roadEvents.slice(0, 20).map((ev) => {
                  const p = ev.properties || {};
                  // robust field mapping
                  const eventType =
                    pickProp(p, ["EVENTTYPE", "EventType", "eventType", "event_type"]) ??
                    pickPropIncludes(p, ["event", "type"]) ??
                    "Event";
                  const status =
                    pickProp(p, ["STATUS", "Status", "status"]) ??
                    pickPropIncludes(p, ["status"]) ??
                    "Status unknown";
                  const severity =
                    pickProp(p, ["SEVERITY", "Severity", "severity"]) ??
                    pickPropIncludes(p, ["severity"]);
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
                  const id =
                    pickProp(p, ["OBJECTID", "ObjectID", "objectid", "id"]) ??
                    Math.random();

                  return (
                    <li key={String(id)} className="py-3">
                      <div className="text-sm font-medium">
                        {String(eventType)} {route ? `• ${route}` : ""}{" "}
                        {location ? `• ${location}` : ""}
                      </div>
                      <div className="text-xs text-gray-500">
                        {String(status)} {severity ? `• ${severity}` : ""}{" "}
                        {when ? `• ${when}` : ""}
                      </div>
                      {desc && (
                        <div className="text-sm text-gray-600 mt-1">{String(desc)}</div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>

            {/* Area summary (demo) */}
            <div className="bg-white rounded-2xl shadow-sm border p-4">
              <div className="font-semibold mb-2">Area Summary</div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-xl border p-3">
                  <div className="text-xs text-gray-500">Past 24h Rain</div>
                  <div className="text-2xl font-semibold">24 mm</div>
                </div>
                <div className="rounded-xl border p-3">
                  <div className="text-xs text-gray-500">Active Road Events</div>
                  <div className="text-2xl font-semibold">{roadEvents.length}</div>
                </div>
                <div className="rounded-xl border p-3">
                  <div className="text-xs text-gray-500">Quakes (loaded)</div>
                  <div className="text-2xl font-semibold">{quakes.length}</div>
                </div>
                <div className="rounded-xl border p-3">
                  <div className="text-xs text-gray-500">Community Reports</div>
                  <div className="text-2xl font-semibold">1</div>
                </div>
              </div>
            </div>

            {/* Subscriptions (demo) */}
            <div className="bg-white rounded-2xl shadow-sm border p-4">
              <div className="font-semibold mb-2">Subscriptions</div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" defaultChecked />
                Alert me for MMI ≥ 4 within 50 km
              </label>
              <label className="flex items-center gap-2 text-sm mt-2">
                <input type="checkbox" defaultChecked />
                Alert me for new road closures in area
              </label>
            </div>
          </aside>
        </main>
      )}

      <footer className="max-w-7xl mx-auto px-4 py-6 text-xs text-gray-500">
        © 2025 demo 
      </footer>
    </div>
  );
}
