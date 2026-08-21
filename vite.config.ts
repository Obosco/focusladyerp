import { defineConfig, loadEnv, type Plugin } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";
import { nitro } from "nitro/vite";

// Vite only exposes VITE_*-prefixed vars (through import.meta.env). Server-side code
// — server functions, auth middleware — reads unprefixed secrets from process.env,
// which nothing populates when running locally. Load the whole .env into process.env
// so those work in dev. Real platform env always wins, so this is a no-op in deploys.
function loadServerEnv(): Plugin {
  return {
    name: "load-server-env",
    config(_config, { mode }) {
      for (const [key, value] of Object.entries(loadEnv(mode, process.cwd(), ""))) {
        if (process.env[key] === undefined) process.env[key] = value;
      }
    },
  };
}

// Electron ships a plain Node server (.output/server/index.mjs); Vercel wants the
// Build Output API in .vercel/output. VERCEL=1 is set by the Vercel build image, and
// NITRO_PRESET overrides both for one-off builds.
const nitroPreset = process.env.NITRO_PRESET || (process.env.VERCEL ? "vercel" : "node-server");

// Nitro writes .vercel/output/config.json itself, which makes `headers` in vercel.json
// dead config — the Build Output API routes win. These entries are merged in ahead of
// Nitro's own routes; `continue: true` means they only decorate the response and let
// routing fall through to the filesystem check and then the SSR function.
const vercelRoutes: { src: string; continue: boolean; headers: Record<string, string> }[] = [
  {
    src: "/(.*)",
    continue: true,
    headers: {
      "x-content-type-options": "nosniff",
      "x-frame-options": "SAMEORIGIN",
      "referrer-policy": "strict-origin-when-cross-origin",
      "permissions-policy": "camera=(), microphone=(), geolocation=(), interest-cohort=()",
      "strict-transport-security": "max-age=31536000; includeSubDomains",
    },
  },
  {
    // The worker script must always be revalidated, otherwise a stale sw.js keeps
    // serving an old app shell long after a deploy.
    src: "/(sw\\.js|manifest\\.webmanifest)",
    continue: true,
    headers: { "cache-control": "public, max-age=0, must-revalidate" },
  },
];

export default defineConfig(({ command }) => ({
  plugins: [
    loadServerEnv(),
    tailwindcss(),
    tsConfigPaths({ projects: ["./tsconfig.json"] }),
    // server.entry redirects TanStack Start's bundled server entry to
    // src/server.ts (our SSR error wrapper). nitro/vite builds from this.
    tanstackStart({ server: { entry: "server" } }),
    ...(command === "build"
      ? [nitro({ preset: nitroPreset, vercel: { config: { version: 3, routes: vercelRoutes } } })]
      : []),
    viteReact(),
  ],
  css: { transformer: "lightningcss" },
  resolve: {
    alias: { "@": `${process.cwd()}/src` },
    dedupe: [
      "react",
      "react-dom",
      "react/jsx-runtime",
      "react/jsx-dev-runtime",
      "@tanstack/react-query",
      "@tanstack/query-core",
    ],
  },
  optimizeDeps: {
    include: ["react", "react-dom", "react-dom/client", "react/jsx-runtime", "react/jsx-dev-runtime"],
  },
  server: { host: "::", port: 8080 },
}));
