import { useState } from 'react';
import styles from './DriftAlertBanner.module.css';

/**
 * Amber top-of-page banner listing features where drift was detected.
 * Each alert can be individually dismissed.
 */
export default function DriftAlertBanner({ alerts }) {
  const [dismissed, setDismissed] = useState(new Set());

  const visible = alerts.filter((a) => !dismissed.has(a.timestamp + a.feature));
  if (visible.length === 0) return null;

  const features = [...new Set(visible.map((a) => a.feature))];

  return (
    <div className={styles.banner} role="alert">
      <span className={styles.icon}>⚠</span>
      <span className={styles.message}>
        Model drift detected in:{' '}
        <strong>{features.join(', ')}</strong>
        {' '}— auto-retraining queued
      </span>
      <button
        className={styles.dismiss}
        onClick={() => setDismissed(new Set(visible.map((a) => a.timestamp + a.feature)))}
        aria-label="Dismiss drift alerts"
      >
        ✕
      </button>
    </div>
  );
}
