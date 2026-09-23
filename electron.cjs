const { app, BrowserWindow, dialog, shell, ipcMain } = require("electron");
const path = require("path");

const APP_URL = "https://focusladyerp.vercel.app";
const APP_TITLE = "FocusLady ERP";
const WINDOW_WIDTH = 1440;
const WINDOW_HEIGHT = 900;
const MIN_WIDTH = 1100;
const MIN_HEIGHT = 700;

let mainWindow;
let isQuitting = false;

function getIconPath() {
  const candidates = [
    path.join(__dirname, "public", "icon-512.png"),
    path.join(__dirname, "public", "focus-lady-logo.svg"),
    path.join(__dirname, "public", "favicon.ico"),
    path.join(__dirname, "public", "icon-192.png")
  ];

  return candidates.find((candidate) => {
    try {
      return require("fs").existsSync(candidate);
    } catch {
      return false;
    }
  });
}

function isSafeExternalUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function createLoadingHtml() {
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8" />
        <title>${APP_TITLE}</title>
        <style>
          :root {
            color-scheme: light;
            --bg: #f6f3ef;
            --panel: rgba(255,255,255,0.9);
            --text: #1c1c1c;
            --muted: #5b5b5b;
            --accent: #1f1f1f;
          }
          * { box-sizing: border-box; }
          body {
            margin: 0;
            min-height: 100vh;
            display: grid;
            place-items: center;
            background: radial-gradient(circle at top, #ffffff 0%, var(--bg) 45%, #efe9e2 100%);
            font-family: Arial, Helvetica, sans-serif;
            color: var(--text);
          }
          .panel {
            width: min(540px, 80vw);
            background: var(--panel);
            border: 1px solid rgba(0,0,0,0.08);
            box-shadow: 0 24px 48px rgba(0,0,0,0.12);
            padding: 32px 28px;
            text-align: center;
          }
          .brand {
            display: flex;
            justify-content: center;
            align-items: center;
            gap: 16px;
            margin-bottom: 18px;
          }
          .logo {
            width: 56px;
            height: 56px;
            object-fit: contain;
            border-radius: 14px;
            background: white;
            padding: 8px;
            border: 1px solid rgba(0,0,0,0.08);
          }
          h1 {
            margin: 0;
            font-size: 1.8rem;
            letter-spacing: 0.02em;
          }
          p {
            margin: 10px 0 0;
            color: var(--muted);
            line-height: 1.5;
          }
          .spinner {
            width: 38px;
            height: 38px;
            margin: 22px auto 0;
            border: 4px solid rgba(0,0,0,0.08);
            border-top-color: var(--accent);
            border-radius: 50%;
            animation: spin 0.9s linear infinite;
          }
          @keyframes spin { to { transform: rotate(360deg); } }
        </style>
      </head>
      <body>
        <div class="panel">
          <div class="brand">
            <img class="logo" src="file://${path.join(__dirname, "public", "focus-lady-logo.svg")}" alt="FocusLady ERP" />
            <h1>FocusLady ERP</h1>
          </div>
          <p>Loading the production ERP...</p>
          <div class="spinner"></div>
        </div>
      </body>
    </html>
  `;
}

function createErrorHtml(message) {
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8" />
        <title>FocusLady ERP unavailable</title>
        <style>
          body {
            margin: 0; font-family: Arial, Helvetica, sans-serif; display: grid; place-items: center;
            min-height: 100vh; background: #f5f1ec; color: #1b1b1b;
          }
          .card {
            width: min(600px, 88vw); background: white; border: 1px solid rgba(0,0,0,0.08);
            box-shadow: 0 18px 42px rgba(0,0,0,0.12); padding: 32px; text-align: center;
          }
          h1 { margin-top: 0; }
          p { color: #4d4d4d; line-height: 1.6; }
          a { color: #111111; }
        </style>
      </head>
      <body>
        <div class="card">
          <h1>FocusLady ERP is unavailable</h1>
          <p>${message}</p>
          <p><a href="${APP_URL}" target="_blank" rel="noopener noreferrer">Open the production app in your browser</a></p>
        </div>
      </body>
    </html>
  `;
}

function createWindow() {
  if (mainWindow) return;

  mainWindow = new BrowserWindow({
    width: WINDOW_WIDTH,
    height: WINDOW_HEIGHT,
    minWidth: MIN_WIDTH,
    minHeight: MIN_HEIGHT,
    backgroundColor: "#f5f1ec",
    title: APP_TITLE,
    icon: getIconPath(),
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      enableRemoteModule: false,
      webSecurity: true,
      spellcheck: false,
      preload: path.join(__dirname, "preload.js")
    }
  });

  mainWindow.setMenuBarVisibility(false);
  mainWindow.once("ready-to-show", () => mainWindow.show());

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    const isExternal = !url.startsWith(APP_URL) && !url.startsWith("about:blank");
    if (isExternal) {
      if (isSafeExternalUrl(url)) shell.openExternal(url);
      return { action: "deny" };
    }
    return { action: "allow" };
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith(APP_URL) && !url.startsWith("about:blank")) {
      event.preventDefault();
      if (isSafeExternalUrl(url)) shell.openExternal(url);
    }
  });

  mainWindow.webContents.on("did-fail-load", (event, errorCode, errorDescription, validatedURL) => {
    const message = `Unable to reach the FocusLady ERP web application. Please check your internet connection or try again later.\n\nURL: ${validatedURL || APP_URL}\nError: ${errorDescription || "Unknown network error"}`;
    mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(createErrorHtml(message))}`);
  });

  mainWindow.webContents.on("did-finish-load", () => {
    mainWindow.setTitle(APP_TITLE);
  });

  mainWindow.webContents.on("before-input-event", (event, input) => {
    if ((input.control || input.meta) && input.key.toLowerCase() === "p") {
      event.preventDefault();
      mainWindow.webContents.print();
    }

    if ((input.control || input.meta) && input.key.toLowerCase() === "r") {
      event.preventDefault();
      mainWindow.webContents.reload();
    }
  });

  mainWindow.on("close", (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
      return;
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  mainWindow.loadURL(APP_URL);
}

app.on("ready", () => {
  createWindow();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  } else if (mainWindow) {
    mainWindow.show();
  }
});

app.on("before-quit", () => {
  isQuitting = true;
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

app.whenReady().then(() => {
  if (mainWindow) {
    mainWindow.loadURL(APP_URL);
  }
});

app.on("web-contents-created", (_, contents) => {
  contents.on("new-window", (event, url) => {
    event.preventDefault();
    shell.openExternal(url);
  });
});

app.on("certificate-error", (event, webContents, url, error, certificate, callback) => {
  event.preventDefault();
  callback(false);
});

