import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],

  manifest: {
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
  },

  vite: () => ({
    plugins: [tailwindcss()],
  }),
});
