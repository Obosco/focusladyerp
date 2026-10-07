import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const outputDirs = [
  join(process.cwd(), ".vercel", "output", "static"),
  join(process.cwd(), ".output", "public"),
];
const requiredFiles = [
  "manifest.webmanifest",
  "sw.js",
  "offline.html",
  "favicon.ico",
  "icon-192.png",
  "icon-512.png",
  "icon-maskable-512.png",
  "focus-lady-logo.png",
];

const availableDirs = outputDirs.filter((directory) => existsSync(directory));
const publicDir = availableDirs.find((directory) =>
  requiredFiles.every((file) => existsSync(join(directory, file))),
);
if (!publicDir) {
  const missing = requiredFiles.filter(
    (file) => !availableDirs.some((directory) => existsSync(join(directory, file))),
  );
  const detail = missing.length ? ` Missing: ${missing.join(", ")}.` : "";
  console.error(`PWA check failed. No production output contains all required files.${detail}`);
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(join(publicDir, "manifest.webmanifest"), "utf8"));
if (manifest.display !== "standalone" || !manifest.start_url || !Array.isArray(manifest.icons)) {
  console.error("PWA check failed. Manifest is missing standalone, start_url, or icons.");
  process.exit(1);
}

const serviceWorker = readFileSync(join(publicDir, "sw.js"), "utf8");
if (!serviceWorker.includes('addEventListener("fetch"')) {
  console.error("PWA check failed. Service worker has no fetch handler.");
  process.exit(1);
}
if (!serviceWorker.includes("/focus-lady-logo.png")) {
  console.error("PWA check failed. Invoice logo is not precached.");
  process.exit(1);
}

console.log("PWA check passed: manifest, service worker, offline page, and icons are present.");
