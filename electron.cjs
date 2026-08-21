const { app, BrowserWindow } = require("electron");
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

let server;

// Load .env so the spawned server gets Supabase + Google Sheets credentials.
function loadEnv(dir) {
  try {
    for (const line of fs.readFileSync(path.join(dir, ".env"), "utf8").split("\n")) {
      const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=("?)(.*)\2\s*$/);
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[3];
    }
  } catch {
    /* no .env — rely on real environment */
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.loadURL("http://localhost:3000");
}

app.whenReady().then(() => {
  // Packaged app ships .output in resources; dev runs it from the project root.
  const root = [process.resourcesPath, __dirname].find((dir) =>
    fs.existsSync(path.join(dir, ".output", "server", "index.mjs"))
  );
  if (!root) {
    console.error("No .output build found. Run `npm run build` first.");
    app.quit();
    return;
  }
  loadEnv(root);

  server = spawn(process.execPath, [path.join(root, ".output", "server", "index.mjs")], {
    cwd: root, // so GOOGLE_SERVICE_ACCOUNT_FILE's relative path resolves
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1"
    },
    stdio: "inherit"
  });

  setTimeout(createWindow, 3000);
});

app.on("window-all-closed", () => {
  if (server) server.kill();
  app.quit();
});
