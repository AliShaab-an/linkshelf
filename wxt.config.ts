import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],

  manifest: {
    name: 'LinkShelf',
    description: 'Park tabs, organize useful links, and return to them at the right time.',
    version: '0.1.0',
    permissions: ['storage', 'alarms', 'notifications', 'tabs', 'bookmarks'],
    commands: {
      'park-current-tab': {
        suggested_key: {
          default: 'Alt+Shift+P',
          mac: 'Command+Shift+P',
        },
        description: 'Park the current tab in the default project',
      },
    },
  },

  vite: () => ({
    plugins: [tailwindcss()],
  }),
});
