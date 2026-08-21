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

export default defineConfig(({ command }) => ({
  plugins: [
    loadServerEnv(),
    tailwindcss(),
    tsConfigPaths({ projects: ["./tsconfig.json"] }),
    // server.entry redirects TanStack Start's bundled server entry to
    // src/server.ts (our SSR error wrapper). nitro/vite builds from this.
    tanstackStart({ server: { entry: "server" } }),
    // node-server preset: .output/server/index.mjs runs under plain Node,
    // which is what electron.cjs spawns (listens on PORT, default 3000).
    ...(command === "build" ? [nitro({ preset: "node-server" })] : []),
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
