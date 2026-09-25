const { FusesPlugin } = require('@electron-forge/plugin-fuses');
const { FuseV1Options, FuseVersion } = require('@electron/fuses');

module.exports = {
  packagerConfig: {
    asar: true,
    icon: 'public/icon-512.png',
    ignore: (filePath) => {
      const relativePath = filePath
        .replace(/^[/\\]+/, '')
        .replaceAll('\\', '/');

      if (
        relativePath === 'electron.cjs' ||
        relativePath === 'preload.js' ||
        relativePath === 'package.json'
      ) {
        return false;
      }

      if (relativePath === 'public') {
        return false;
      }

      if (relativePath.startsWith('public/')) {
        return ![
          'public/icon-512.png',
          'public/focus-lady-logo.svg',
        ].includes(relativePath);
      }

      return relativePath !== '';
    },
  },
  rebuildConfig: {},
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      config: {
        setupExe: 'FocusLady-ERP-Setup.exe',
      },
    },
  ],
  plugins: [
    {
      name: '@electron-forge/plugin-auto-unpack-natives',
      config: {},
    },
    // Fuses are used to enable/disable various Electron functionality
    // at package time, before code signing the application
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};
