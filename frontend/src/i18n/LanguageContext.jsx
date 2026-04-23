import { createContext, useContext, useState } from 'react';
import translations, { LANGUAGES } from './translations.js';

const LanguageContext = createContext();

export function LanguageProvider({ children }) {
  const [lang, setLang] = useState(() => {
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem('d3t-lang') || 'en';
    }
    return 'en';
  });

  function changeLang(newLang) {
    setLang(newLang);
    localStorage.setItem('d3t-lang', newLang);
  }

  function t(key) {
    return translations[lang]?.[key] ?? translations.en?.[key] ?? key;
  }

  return (
    <LanguageContext.Provider value={{ lang, changeLang, t, LANGUAGES }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
