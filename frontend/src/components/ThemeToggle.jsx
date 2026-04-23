import { useState, useEffect } from 'react';

export default function ThemeToggle() {
  const [theme, setTheme] = useState(() => {
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem('d3t-theme') || 'dark';
    }
    return 'dark';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('d3t-theme', theme);
  }, [theme]);

  const isDark = theme === 'dark';

  return (
    <button
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      title={`Switch to ${isDark ? 'light' : 'dark'} mode`}
      style={{
        width: 28,
        height: 28,
        borderRadius: '50%',
        background: 'var(--surface2)',
        border: '1px solid var(--border)',
        color: 'var(--text)',
        fontSize: 14,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 0,
        flexShrink: 0,
        cursor: 'pointer',
      }}
    >
      {isDark ? '\u2600' : '\u263E'}
    </button>
  );
}
