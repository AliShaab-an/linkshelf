import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

// See https://wxt.dev/api/config.html

/** Public key for development builds only; see `manifest` below. Not a secret. */
const DEVELOPMENT_KEY = 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA0ZjJnSxowcSjVL0Flh4L3xpROX7EgYYlE6zuZUgMkvHKjmwG9D51SNssrE6Gdln8OS9d4d0Pmb7vekDQalJR8aCZySJnAIbcPrU5ltmBoZlKKlZkRUI/rIfL2mYphn0Fkgr+ShBzSXAqHcwSw+Xgl6dh5qZ4DnS4Vg/d0KtdDMyr4QP4v+i9lHjaDwkTfGK79GwIOLlsoaQRO3LwI6LYyXCmd+ls1wyeyU2woxid7nNBY5AKJWZDign4+VKiaJR+W00Eqju1gmDs4znLLjlVe+j6oBc819W8XDa24hGrL1rLDuT89fYecB1O3Blr7tskgiMpTwAjj3NCDrXSuZNHCwIDAQAB';
export default defineConfig({
  modules: ['@wxt-dev/module-react'],

  manifest: ({ mode }) => ({
    // Development builds only: a fixed public key gives the unpacked extension a stable ID
    // (chrome-extension://chlfgppaffnmojfjkdaidgoicejmfhmi) that the local backend can allow.
    // Release builds never include it, so the Chrome Web Store ID is unchanged.
    ...(mode === 'development' ? { key: DEVELOPMENT_KEY } : {}),
    name: 'LinkShelf',
    description: 'Park tabs, organize useful links, and return to them at the right time.',
    version: '0.5.1',
    permissions: ['storage', 'alarms', 'notifications', 'tabs', 'bookmarks'],
    // Asked for only when the person turns on tab groups in Settings; never needed to install or update.
    optional_permissions: ['tabGroups'],
    commands: {
      'park-current-tab': {
        suggested_key: {
          default: 'Alt+Shift+P',
          mac: 'Command+Shift+P',
        },
        description: 'Park the current tab in the default project',
      },
      'toggle-side-panel': {
        suggested_key: { default: 'Alt+Shift+L' },
        description: 'Open or close LinkShelf',
      },
      'open-search': {
        suggested_key: { default: 'Alt+Shift+F' },
        description: 'Open LinkShelf search',
      },
      'open-today': {
        suggested_key: { default: 'Alt+Shift+T' },
        description: 'Open LinkShelf Today',
      },
    },
  }),

  vite: () => ({
    plugins: [tailwindcss()],
  }),
});
