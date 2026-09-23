const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('focusladyDesktop', {
  appName: 'FocusLady ERP',
  version: process.env.npm_package_version || '1.0.0',
  reload: () => window.location.reload(),
  openExternal: (url) => require('electron').shell.openExternal(url),
});

window.addEventListener('DOMContentLoaded', () => {
  const appTitle = document.title || 'FocusLady ERP';
  document.title = appTitle;
});
