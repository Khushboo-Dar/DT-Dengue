import styles from './PatientCard.module.css';

const SEV_COLORS = {
  mild:     'var(--mild)',
  moderate: 'var(--moderate)',
  severe:   'var(--severe)',
};

/**
 * Compact patient row card.
 * Features: severity badge, risk gauge arc (SVG), P(severe) %, platelet trend.
 */
export default function PatientCard({ patient, selected, onClick }) {
  const {
    patient_id,
    severity_label = 'mild',
    PSOS           = {},
    ekf_state      = {},
  } = patient;

  const color      = SEV_COLORS[severity_label] ?? 'var(--neutral)';
  const pSevere    = (PSOS.severe ?? 0);
  const pSeverePct = (pSevere * 100).toFixed(0);
  const platTrend  = ekf_state.platelet_trend ?? 0;
  const trendArrow = platTrend >= 0 ? '▲' : '▼';
  const trendColor = platTrend >= 0 ? 'var(--mild)' : 'var(--severe)';
  const daysTracked= ekf_state.days_tracked ?? 1;

  // SVG arc gauge for P(severe) 0–100%
  const R = 16, SW = 4, CX = 20, CY = 20;
  const arcLen  = Math.PI * R;
  const arcFill = arcLen * pSevere;
  const isPulsing = severity_label === 'severe';

  return (
    <button
      className={`${styles.card} ${selected ? styles.selected : ''} ${isPulsing ? styles.pulsing : ''}`}
      onClick={onClick}
      aria-pressed={selected}
    >
      {/* Left: badge + ID + day */}
      <div className={styles.left}>
        <div className={styles.badge} style={{ background: color }}>
          {severity_label === 'moderate' ? 'MOD' : severity_label.toUpperCase()}
        </div>
        <div className={styles.info}>
          <span className={styles.id}>{patient_id}</span>
          <span className={styles.day}>Day {daysTracked.toFixed(0)}</span>
        </div>
      </div>

      {/* Center: SVG gauge */}
      <svg viewBox="0 0 40 24" className={styles.gauge} aria-hidden="true">
        <path
          d={`M ${CX - R} ${CY} A ${R} ${R} 0 0 1 ${CX + R} ${CY}`}
          fill="none" stroke="var(--border)" strokeWidth={SW} strokeLinecap="round"
        />
        <path
          d={`M ${CX - R} ${CY} A ${R} ${R} 0 0 1 ${CX + R} ${CY}`}
          fill="none" stroke={color} strokeWidth={SW} strokeLinecap="round"
          strokeDasharray={`${arcFill} ${arcLen}`}
        />
        <text x={CX} y={CY - 3} textAnchor="middle" fontSize="7" fontWeight="700" fill={color}>
          {pSeverePct}%
        </text>
      </svg>

      {/* Right: trend */}
      <span className={styles.trend} style={{ color: trendColor }} title="Platelet trend">
        {trendArrow}
      </span>
    </button>
  );
}
