// src/App.tsx
import React, { useState } from "react";

// --- GeoNet recent quakes (MMI >= 3) -------------------------
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

export default function App() {
  // page view + demo state
  const [view, setView] = useState<"dashboard" | "architecture">("dashboard");

  // quake state
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
        </div>
      </header>

      {/* Main */}
      {view === "architecture" ? (
        <main className="max-w-7xl mx-auto p-4">
          <h2 className="text-xl font-bold mb-2">One-Page Architecture Diagram</h2>
          <p className="text-sm text-gray-600">
            (Keep your SVG diagram version here. This is a placeholder.)
          </p>
        </main>
      ) : (
        <main className="max-w-7xl mx-auto p-4 grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Left column placeholder */}
          <section className="lg:col-span-8">
            <div className="bg-white rounded-2xl shadow-sm border p-6 h-[420px] grid place-items-center text-gray-500">
              <div className="text-center">
                <div className="text-5xl">🗺️</div>
                <div className="mt-2 text-sm">(Map placeholder)</div>
              </div>
            </div>
          </section>

          {/* Right column: Live feed + Quakes */}
          <aside className="lg:col-span-4 flex flex-col gap-4">
            {/* Live Feed demo card */}
            <div className="bg-white rounded-2xl shadow-sm border p-4">
              <div className="font-semibold mb-2">Live Feed (demo)</div>
              <ul className="divide-y">
                {[
                  {
                    time: "2 min ago",
                    title: "Road closure – SH2 slip near Kaitoke",
                    detail: "Detour via Plateau Rd. Expect delays.",
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
          </aside>
        </main>
      )}

      <footer className="max-w-7xl mx-auto px-4 py-6 text-xs text-gray-500">
        © 2025 GovHack NZ demo • Data sources: GeoNet, NZTA/Waka Kotahi, NIWA, LINZ • For demonstration only
      </footer>
    </div>
  );
}
