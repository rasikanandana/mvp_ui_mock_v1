import React, { useState } from "react";

// 1) Types
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

// 2) State + loader
const [quakes, setQuakes] = useState<QuakeFeature[]>([]);
const [loadingQuakes, setLoadingQuakes] = useState(false);
const [errorQuakes, setErrorQuakes] = useState<string | null>(null);

async function loadQuakes() {
  try {
    setLoadingQuakes(true);
    setErrorQuakes(null);
    const res = await fetch("https://api.geonet.org.nz/quake?MMI=3", {
      headers: { Accept: "application/vnd.geo+json;version=2" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data: QuakeFC = await res.json();
    // sort newest first
    const sorted = [...data.features].sort(
      (a, b) => new Date(b.properties.time).getTime() - new Date(a.properties.time).getTime()
    );
    setQuakes(sorted.slice(0, 20)); // cap to 20 for UI
  } catch (e: any) {
    setErrorQuakes(e.message || "Failed to load quakes");
  } finally {
    setLoadingQuakes(false);
  }
}



function ArchitectureDiagram() {
  return (
    <div className="max-w-7xl mx-auto p-4">
      <div className="bg-white rounded-2xl shadow-sm border p-6">
        <h2 className="text-xl font-bold mb-4">One‑Page Architecture Diagram</h2>
        {/* Responsive SVG diagram */}
        <div className="w-full overflow-auto">
          <svg viewBox="0 0 1200 760" className="w-full h-auto">
            <defs>
              <marker id="arrow" markerWidth="10" markerHeight="10" refX="6" refY="3" orient="auto" markerUnits="strokeWidth">
                <path d="M0,0 L0,6 L6,3 z" fill="#6b7280" />
              </marker>
              <style>{`
                .box{fill:#fff;stroke:#d1d5db;stroke-width:2;rx:14;ry:14;}
                .title{font:bold 14px ui-sans-serif,system-ui;fill:#111827}
                .text{font:12px ui-sans-serif,system-ui;fill:#374151}
                .tag{font:11px ui-sans-serif,system-ui;fill:#6b7280}
              `}</style>
            </defs>

            {/* ROW 1: Data Sources */}
            <rect x="40" y="40" width="1120" height="120" className="box"/>
            <text x="60" y="70" className="title">Open Data Sources</text>
            <text x="60" y="95" className="text">GeoNet (quakes/shakemaps) • Waka Kotahi / NZTA (traffic & cameras) • NIWA (rain / HIRDS / hydrology) • LINZ (addresses/boundaries) • Councils RSS (notices) • Community reports</text>
            <text x="1060" y="135" className="tag">Attribution & T&Cs</text>

            {/* Arrows to adapters */}
            <line x1="600" y1="160" x2="600" y2="200" stroke="#6b7280" strokeWidth="2" markerEnd="url(#arrow)"/>

            {/* ROW 2: Adapters layer */}
            <rect x="120" y="200" width="320" height="110" className="box"/>
            <text x="140" y="228" className="title">Earthquake Adapter</text>
            <text x="140" y="252" className="text">GeoNet → GeoJSON (events, MMI, polygons)</text>
            <text x="140" y="274" className="tag">Polling/WebSocket if available</text>

            <rect x="460" y="200" width="280" height="110" className="box"/>
            <text x="480" y="228" className="title">Traffic Adapter</text>
            <text x="480" y="252" className="text">NZTA events/cameras → GeoJSON</text>
            <text x="480" y="274" className="tag">Incidents • Closures • Detours</text>

            <rect x="760" y="200" width="320" height="110" className="box"/>
            <text x="780" y="228" className="title">Rain & Flood Adapter</text>
            <text x="780" y="252" className="text">NIWA stations/HIRDS → metrics/tiles</text>
            <text x="780" y="274" className="tag">6–24h totals • RP surfaces</text>

            {/* Arrows to aggregator */}
            <line x1="280" y1="310" x2="280" y2="360" stroke="#6b7280" strokeWidth="2" markerEnd="url(#arrow)"/>
            <line x1="600" y1="310" x2="600" y2="360" stroke="#6b7280" strokeWidth="2" markerEnd="url(#arrow)"/>
            <line x1="920" y1="310" x2="920" y2="360" stroke="#6b7280" strokeWidth="2" markerEnd="url(#arrow)"/>

            {/* ROW 3: Aggregator & Services */}
            <rect x="200" y="360" width="800" height="130" className="box"/>
            <text x="220" y="388" className="title">Aggregator API</text>
            <text x="220" y="412" className="text">Express / FastAPI • Normalise to GeoJSON • /geocode /hazards /traffic /rain • /query (multi‑layer)</text>
            <text x="220" y="434" className="tag">Validation • Rate limiting • Attribution</text>

            {/* Cache & DB */}
            <rect x="220" y="500" width="220" height="90" className="box"/>
            <text x="240" y="528" className="title">Cache</text>
            <text x="240" y="552" className="text">Redis (TTL per layer)</text>

            <rect x="460" y="500" width="250" height="90" className="box"/>
            <text x="480" y="528" className="title">Spatial Store (optional)</text>
            <text x="480" y="552" className="text">PostGIS for polygon/within queries</text>

            <rect x="730" y="500" width="250" height="90" className="box"/>
            <text x="750" y="528" className="title">Realtime</text>
            <text x="750" y="552" className="text">WebSocket / Socket.IO push</text>

            {/* arrows from aggregator to services */}
            <line x1="600" y1="490" x2="600" y2="460" stroke="#6b7280" strokeWidth="2" markerEnd="url(#arrow)"/>

            {/* Arrows to client */}
            <line x1="600" y1="590" x2="600" y2="630" stroke="#6b7280" strokeWidth="2" markerEnd="url(#arrow)"/>

            {/* ROW 4: Client */}
            <rect x="180" y="630" width="840" height="90" className="box"/>
            <text x="200" y="658" className="title">Client UI</text>
            <text x="200" y="682" className="text">React + Leaflet/MapLibre • Address search & draw area • Layer toggles • Live feed • Alerts</text>
            <text x="900" y="700" className="tag">PWA / Push later</text>
          </svg>
        </div>
        <p className="text-xs text-gray-500 mt-3">MVP scope highlighted. Data: GeoNet, NZTA/Waka Kotahi, NIWA, LINZ. For demonstration only.</p>
      </div>
    </div>
  );
}

export default function App() {
  const [view, setView] = useState<'dashboard'|'architecture'>(() => 'architecture');
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

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top bar */}
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur border-b">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-3">
          <div className="text-xl font-bold tracking-tight">Community Hazard Dashboard</div>
          <span className="text-xs text-gray-500 hidden sm:block">GovHack NZ • MVP</span>
          <nav className="ml-4 flex items-center gap-2">
            <button onClick={() => setView('dashboard')} className={`px-3 py-1.5 rounded-xl text-sm border ${view==='dashboard'?'bg-black text-white':'bg-white'}`}>Dashboard</button>
            <button onClick={() => setView('architecture')} className={`px-3 py-1.5 rounded-xl text-sm border ${view==='architecture'?'bg-black text-white':'bg-white'}`}>Architecture</button>
          </nav>
          <div className="ml-auto flex items-center gap-2 w-full sm:w-[520px]">
            <input className="w-full rounded-xl border px-3 py-2 text-sm" placeholder="Search address e.g. 123 Queen St, Lower Hutt" />
            <button className="rounded-xl bg-black text-white px-4 py-2 text-sm">Locate</button>
          </div>
        </div>
      </header>

      {view === 'architecture' ? (
        <ArchitectureDiagram />
      ) : (
        <main className="max-w-7xl mx-auto p-4 grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Left column: Map + toggles */}
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
                {[
                  ["quakes", "Earthquakes (MMI)"] as const,
                  ["traffic", "Traffic / Road Events"] as const,
                  ["rain", "Rain (6–24h)"] as const,
                  ["flood", "Flood / Coastal risk"] as const,
                  ["landslide", "Landslides"] as const,
                  ["community", "Community Reports"] as const,
                ].map(([k, label]) => (
                  <button key={k} onClick={() => toggle(k)} className={`justify-between flex items-center rounded-xl border px-3 py-2 text-sm ${layers[k] ? "bg-black text-white" : "bg-white"}`}>
                    <span>{label}</span>
                    <span className="text-xs opacity-70">{layers[k] ? "on" : "off"}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Community report */}
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
                <textarea className="rounded-xl border px-3 py-2 text-sm sm:col-span-2" placeholder="Describe what you see (e.g., water across road, depth, time)"></textarea>
                <div className="flex items-center justify-between sm:col-span-2">
                  <div className="text-xs text-gray-500">Location will use current map center unless you draw a point.</div>
                  <button className="rounded-xl bg-black text-white px-4 py-2 text-sm">Submit report</button>
                </div>
              </div>
            </div>
          </section>

          {/* Right column: Live feed & details */}
          <aside className="lg:col-span-4 flex flex-col gap-4">
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
          {new Date(q.properties.time).toLocaleString()} • depth {q.properties.depth} km • MMI {q.properties.mmi} • {q.properties.quality}
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



            

            <div className="bg-white rounded-2xl shadow-sm border p-4">
              <div className="font-semibold mb-2">Area Summary</div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-xl border p-3">
                  <div className="text-xs text-gray-500">Past 24h Rain</div>
                  <div className="text-2xl font-semibold">24 mm</div>
                </div>
                <div className="rounded-xl border p-3">
                  <div className="text-xs text-gray-500">Active Road Events</div>
                  <div className="text-2xl font-semibold">3</div>
                </div>
                <div className="rounded-xl border p-3">
                  <div className="text-xs text-gray-500">Quakes (24h)</div>
                  <div className="text-2xl font-semibold">5</div>
                </div>
                <div className="rounded-xl border p-3">
                  <div className="text-xs text-gray-500">Community Reports</div>
                  <div className="text-2xl font-semibold">1</div>
                </div>
              </div>
            </div>

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
        © 2025 GovHack NZ demo • Data sources: GeoNet, NZTA/Waka Kotahi, NIWA, LINZ • For demonstration only
      </footer>
    </div>
  );
}
