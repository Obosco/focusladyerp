import { defineConfig, loadEnv, type Plugin } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { nitro } from "nitro/vite";

function loadServerEnv(): Plugin {
  return {
    name: "load-server-env",
    config(_config, { mode }) {
      for (const [key, value] of Object.entries(
        loadEnv(mode, process.cwd(), "")
      )) {
        if (process.env[key] === undefined) {
          process.env[key] = value;
        }
      }
    },
  };
}

const nitroPreset =
  process.env.NITRO_PRESET ||
  (process.env.VERCEL ? "vercel" : "node-server");

const vercelRoutes: {
  src: string;
  continue: boolean;
  headers: Record<string, string>;
}[] = [
  {
    src: "/(.*)",
    continue: true,
    headers: {
      "x-content-type-options": "nosniff",
      "x-frame-options": "SAMEORIGIN",
      "referrer-policy": "strict-origin-when-cross-origin",
      "permissions-policy":
        "camera=(), microphone=(), geolocation=(), interest-cohort=()",
      "strict-transport-security":
        "max-age=31536000; includeSubDomains",
    },
  },
  {
    src: "/(sw\\.js|manifest\\.webmanifest)",
    continue: true,
    headers: {
      "cache-control": "public, max-age=0, must-revalidate",
    },
  },
];

export default defineConfig(({ command }) => ({
  publicDir: "public",

  plugins: [
    loadServerEnv(),
    tailwindcss(),

    tanstackStart({
      server: { entry: "server" },
    }),

    ...(command === "build"
      ? [
          nitro({
            preset: nitroPreset,
            vercel: {
              config: {
                version: 3,
                routes: vercelRoutes,
              },
            },
          }),
        ]
      : []),

    viteReact(),
  ],

  css: {
    transformer: "lightningcss",
  },

  resolve: {
    tsconfigPaths: true,
    alias: {
      "@": `${process.cwd()}/src`,
    },
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
    include: [
      "react",
      "react-dom",
      "react-dom/client",
      "react/jsx-runtime",
      "react/jsx-dev-runtime",
    ],
  },

  server: {
    host: "::",
    port: 8080,
  },
}));