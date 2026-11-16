import { useLayoutEffect, useState } from 'react';

export type InterfaceTheme = 'system' | 'light' | 'dark';
const key = 'linkshelf-interface-theme';

function readTheme(): InterfaceTheme {
  const value = localStorage.getItem(key);
  return value === 'dark' || value === 'light' ? value : 'system';
}

export function useInterfaceTheme() {
  const [theme, setTheme] = useState(readTheme);

  useLayoutEffect(() => {
    const media = matchMedia('(prefers-color-scheme: dark)');
    const paint = () => {
      const dark = theme === 'dark' || (theme === 'system' && media.matches);
      document.documentElement.dataset.colorScheme = dark ? 'dark' : 'light';
    };
    const sync = (event: StorageEvent) => { if (event.key === key || event.key === null) setTheme(readTheme()); };
    paint();
    media.addEventListener('change', paint);
    window.addEventListener('storage', sync);
    return () => {
      media.removeEventListener('change', paint);
      window.removeEventListener('storage', sync);
    };
  }, [theme]);

  return { theme, changeTheme(value: InterfaceTheme) {
    localStorage.setItem(key, value);
    setTheme(value);
  } };
}
