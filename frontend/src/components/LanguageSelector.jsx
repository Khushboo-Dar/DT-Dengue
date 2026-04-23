import { useLanguage } from '../i18n/LanguageContext.jsx';

export default function LanguageSelector() {
  const { lang, changeLang, LANGUAGES } = useLanguage();

  return (
    <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
      {Object.entries(LANGUAGES).map(([code, { label }]) => (
        <button
          key={code}
          onClick={() => changeLang(code)}
          title={LANGUAGES[code].name}
          style={{
            padding: '3px 8px',
            fontSize: 11,
            fontWeight: lang === code ? 700 : 500,
            borderRadius: 4,
            background: lang === code ? 'var(--accent-dim)' : 'transparent',
            color: lang === code ? 'var(--accent)' : 'var(--text-dim)',
            border: lang === code ? '1px solid var(--accent)' : '1px solid transparent',
            cursor: 'pointer',
          }}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
