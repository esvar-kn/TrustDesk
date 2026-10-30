// Light/dark theme state. The `dark` class on <html> drives the CSS-variable
// palette (see index.css); index.html applies the saved/system theme before
// first paint, and this hook keeps React in sync and persists changes.
import { useCallback, useEffect, useState } from 'react';

const KEY = 'trustdesk_theme';

function systemPrefersDark() {
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  } catch {
    return false;
  }
}

function initialDark() {
  // Trust the class the pre-paint script already set, then storage, then system.
  if (typeof document !== 'undefined' && document.documentElement.classList.contains('dark')) {
    return true;
  }
  try {
    const saved = localStorage.getItem(KEY);
    if (saved) return saved === 'dark';
  } catch {
    /* ignore */
  }
  return systemPrefersDark();
}

export function useTheme() {
  const [dark, setDark] = useState(initialDark);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    try {
      localStorage.setItem(KEY, dark ? 'dark' : 'light');
    } catch {
      /* ignore storage errors (private mode) */
    }
  }, [dark]);

  const toggle = useCallback(() => setDark((d) => !d), []);
  return { dark, toggle };
}
