import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const outputDirs = [
  join(process.cwd(), ".vercel", "output", "static"),
  join(process.cwd(), ".output", "public"),
];
const publicDir = outputDirs.find((directory) => existsSync(directory));
if (!publicDir) {
  console.error("PWA check failed. No production public output directory was found.");
  process.exit(1);
}
const requiredFiles = [
  "manifest.webmanifest",
  "sw.js",
  "offline.html",
  "favicon.ico",
  "icon-192.png",
  "icon-512.png",
  "icon-maskable-512.png",
];

const missing = requiredFiles.filter((file) => !existsSync(join(publicDir, file)));
if (missing.length > 0) {
  console.error(`PWA check failed. Missing: ${missing.join(", ")}`);
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(join(publicDir, "manifest.webmanifest"), "utf8"));
if (manifest.display !== "standalone" || !manifest.start_url || !Array.isArray(manifest.icons)) {
  console.error("PWA check failed. Manifest is missing standalone, start_url, or icons.");
  process.exit(1);
}

const serviceWorker = readFileSync(join(publicDir, "sw.js"), "utf8");
if (!serviceWorker.includes("addEventListener(\"fetch\"")) {
  console.error("PWA check failed. Service worker has no fetch handler.");
  process.exit(1);
}

console.log("PWA check passed: manifest, service worker, offline page, and icons are present.");
