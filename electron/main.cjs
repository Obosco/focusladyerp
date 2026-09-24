const { app, BrowserWindow } = require("electron");
const path = require("path");

app.whenReady().then(() => {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    icon: path.join(__dirname, "../build/icon.png"),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.loadFile(path.join(__dirname, "../dist/index.html"));
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});