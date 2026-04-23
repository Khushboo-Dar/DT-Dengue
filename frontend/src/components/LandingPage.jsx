import { useState } from 'react';
import { useLanguage } from '../i18n/LanguageContext.jsx';
import LanguageSelector from './LanguageSelector.jsx';
import styles from './LandingPage.module.css';

const FEATURES = [
  { icon: '\u{1F9EC}', title: 'AI Severity Prediction', desc: 'XGBoost classifier with 24 clinical, environmental, and epidemiological features' },
  { icon: '\u{1F4C8}', title: '7-Day Forecast', desc: 'Monte Carlo simulation projects patient trajectory with 90% confidence intervals' },
  { icon: '\u{1FA7A}', title: 'Treatment Simulation', desc: 'Counterfactual engine tests "what-if" treatment scenarios over 72 hours' },
  { icon: '\u{1F3E5}', title: 'Hospital Command Centre', desc: 'Real-time severity census, ICU demand, and outbreak level monitoring' },
  { icon: '\u{1F52C}', title: 'Explainable AI (SHAP)', desc: 'Every prediction comes with top-5 feature attributions doctors can trust' },
  { icon: '\u{1F310}', title: 'Outbreak Intelligence', desc: 'SEIR particle filter connects community transmission to individual patient risk' },
];

export default function LandingPage({ onEnter }) {
  const [entering, setEntering] = useState(false);
  const { t } = useLanguage();

  function handleEnter() {
    setEntering(true);
    setTimeout(() => onEnter(), 400);
  }

  return (
    <div className={`${styles.root} ${entering ? styles.fadeOut : ''}`}>
      {/* Animated background particles */}
      <div className={styles.bgGrid}>
        {Array.from({ length: 30 }).map((_, i) => (
          <div
            key={i}
            className={styles.particle}
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              animationDelay: `${Math.random() * 6}s`,
              animationDuration: `${4 + Math.random() * 6}s`,
            }}
          />
        ))}
      </div>

      {/* Language selector */}
      <div style={{ position: 'absolute', top: 16, right: 20, zIndex: 2 }}>
        <LanguageSelector />
      </div>

      {/* Hero section */}
      <div className={styles.hero}>
        <div className={styles.badge}>{t('landing.badge')}</div>
        <h1 className={styles.title}>
          <span className={styles.d3t}>D3T</span>
        </h1>
        <h2 className={styles.subtitle}>{t('landing.subtitle')}</h2>
        <p className={styles.tagline}>{t('landing.tagline')}</p>

        <button className={styles.enterBtn} onClick={handleEnter}>
          {t('landing.enter')}
          <span className={styles.arrow}>&#8594;</span>
        </button>

        <div className={styles.stats}>
          <div className={styles.stat}>
            <span className={styles.statNum}>24</span>
            <span className={styles.statLabel}>Clinical Features</span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statNum}>6-D</span>
            <span className={styles.statLabel}>Kalman Filter</span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statNum}>500</span>
            <span className={styles.statLabel}>SEIR Particles</span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statNum}>7d</span>
            <span className={styles.statLabel}>Forecast Horizon</span>
          </div>
        </div>
      </div>

      {/* Feature grid */}
      <div className={styles.features}>
        {FEATURES.map((f, i) => (
          <div key={i} className={styles.featureCard} style={{ animationDelay: `${0.1 * i}s` }}>
            <div className={styles.featureIcon}>{f.icon}</div>
            <h3 className={styles.featureTitle}>{f.title}</h3>
            <p className={styles.featureDesc}>{f.desc}</p>
          </div>
        ))}
      </div>

      <footer className={styles.footer}>
        {t('landing.footer')}
      </footer>
    </div>
  );
}
