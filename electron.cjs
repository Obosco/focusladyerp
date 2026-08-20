const { app, BrowserWindow } = require("electron");
const { spawn } = require("child_process");
const path = require("path");

let server;

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
  const serverPath = path.join(
    process.resourcesPath,
    ".output",
    "server",
    "index.mjs"
  );

  server = spawn(process.execPath, [serverPath], {
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