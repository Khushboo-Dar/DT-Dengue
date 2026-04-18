import { useState } from 'react';
import styles from './DriftAlertBanner.module.css';

export default function DriftAlertBanner({ alerts }) {
  const [dismissed, setDismissed] = useState(new Set());

  const visible = alerts.filter(a => !dismissed.has(a.timestamp + (a.feature ?? 'retrain')));
  if (visible.length === 0) return null;

  const driftFeatures = [...new Set(visible.filter(a => a.type === 'drift').map(a => a.feature))];
  const retrainEvents = visible.filter(a => a.type === 'retrain');
  const latestRetrain = retrainEvents[0];

  function dismissAll() {
    setDismissed(new Set(visible.map(a => a.timestamp + (a.feature ?? 'retrain'))));
  }

  return (
    <div className={styles.wrap}>
      {driftFeatures.length > 0 && (
        <div className={`${styles.banner} ${styles.drift}`} role="alert">
          <span className={styles.icon}>⚠</span>
          <span className={styles.message}>
            Concept drift detected in <strong>{driftFeatures.join(', ')}</strong>
            {' '}— auto-retraining queued
          </span>
        </div>
      )}
      {latestRetrain && (
        <div className={`${styles.banner} ${styles.retrain}`} role="status">
          <span className={styles.icon}>✓</span>
          <span className={styles.message}>
            Model retrained · new accuracy: <strong>{(latestRetrain.accuracy * 100).toFixed(1)}%</strong>
            {' '}· hot-swapped live
          </span>
        </div>
      )}
      <button className={styles.dismiss} onClick={dismissAll} aria-label="Dismiss">✕</button>
    </div>
  );
}
