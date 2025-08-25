test
# MVP UI Mock V1 — GitHub Pages Ready..

This repo is configured for GitHub Pages and Vite. Use it as a clean base if your current repo shows a blank page.

## How to use
1. Make a **public** repo on GitHub named `mvp_ui_mock_v1` (or any name).
2. Upload these files/folders exactly as-is.
3. Go to **Settings → Pages** and ensure Source is **GitHub Actions**.
4. Push any change to `main` — the included workflow builds & deploys.
5. Open `https://<your-user>.github.io/<your-repo>/`

## Local dev
```bash
npm install
npm run dev
```

Notes:
- `vite.config.ts` uses `base: './'` so assets resolve correctly on GitHub Pages.
- Workflow copies `dist/index.html` to `dist/404.html` for SPA refresh fallback.
