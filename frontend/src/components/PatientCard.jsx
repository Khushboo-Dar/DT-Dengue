import styles from './PatientCard.module.css';

const SEV_COLORS = {
  mild:     'var(--mild)',
  moderate: 'var(--moderate)',
  severe:   'var(--severe)',
};

/**
 * Compact 72-px patient row card.
 * Shows: ID, severity badge, P(severe) %, platelet trend arrow.
 */
export default function PatientCard({ patient, selected, onClick }) {
  const {
    patient_id,
    severity_label = 'mild',
    PSOS = {},
    ekf_state = {},
  } = patient;

  const color       = SEV_COLORS[severity_label] ?? 'var(--neutral)';
  const pSevere     = ((PSOS.severe ?? 0) * 100).toFixed(1);
  const platTrend   = ekf_state.platelet_trend ?? 0;
  const trendArrow  = platTrend >= 0 ? '↑' : '↓';
  const trendColor  = platTrend >= 0 ? 'var(--mild)' : 'var(--severe)';

  return (
    <button
      className={`${styles.card} ${selected ? styles.selected : ''}`}
      onClick={onClick}
      aria-pressed={selected}
    >
      <div className={styles.left}>
        <div className={styles.badge} style={{ background: color }}>
          {severity_label.toUpperCase()}
        </div>
        <span className={styles.id}>{patient_id}</span>
      </div>

      <div className={styles.right}>
        <span className={styles.severe} style={{ color }}>
          {pSevere}%
          <span className={styles.sevLabel}> P(sv)</span>
        </span>
        <span className={styles.trend} style={{ color: trendColor }} title="Platelet trend">
          {trendArrow} plt
        </span>
      </div>
    </button>
  );
}
