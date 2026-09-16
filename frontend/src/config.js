// Central place for environment-specific config.
// Override by setting VITE_API_URL in a .env file (see .env.example).
//
// Default is a RELATIVE path ("/api"), not an absolute URL. This relies on
// whatever served this page also handling /api — which is true in both
// places this app runs:
//   - Production (Docker): Caddy terminates HTTPS and routes /api/* to the
//     backend container on the same origin (see ../Caddyfile).
//   - Local dev (`npm run dev`): Vite's dev server proxies /api/* to the
//     local API process (see vite.config.js).
// This also means normal browser traffic never crosses origins, so it's
// never subject to CORS at all — one less thing to keep in sync.
export const API_URL = import.meta.env.VITE_API_URL || '/api';
