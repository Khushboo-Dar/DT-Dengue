import styles from './PatientTimeline.module.css';

const SEV_COLORS = {
  mild: 'var(--mild)',
  moderate: 'var(--moderate)',
  severe: 'var(--severe)',
};

/**
 * Vertical timeline showing patient journey across prediction steps.
 * Each entry shows day of illness, severity, and probability.
 */
export default function PatientTimeline({ history, patient }) {
  if (!history || history.length === 0) {
    return (
      <div className={styles.empty}>
        No history yet. Multiple predictions build the timeline.
      </div>
    );
  }

  // Determine severity label from probabilities
  function getSeverity(entry) {
    const { mild, moderate, severe } = entry;
    if (severe >= moderate && severe >= mild) return 'severe';
    if (moderate >= mild) return 'moderate';
    return 'mild';
  }

  function getEvent(entry, prev) {
    const sev = getSeverity(entry);
    const prevSev = prev ? getSeverity(prev) : null;

    if (!prevSev) return 'Admitted';
    if (sev === 'severe' && prevSev !== 'severe') return 'Deteriorated to Severe';
    if (sev === 'moderate' && prevSev === 'mild') return 'Worsened to Moderate';
    if (sev === 'mild' && prevSev !== 'mild') return 'Improved to Mild';
    if (sev === 'moderate' && prevSev === 'severe') return 'Improving';
    return 'Assessment updated';
  }

  return (
    <div className={styles.wrap}>
      <h3>Patient Journey Timeline</h3>
      <div className={styles.timeline}>
        {history.map((entry, i) => {
          const sev = getSeverity(entry);
          const color = SEV_COLORS[sev];
          const event = getEvent(entry, i > 0 ? history[i - 1] : null);

          return (
            <div key={i} className={styles.item}>
              {/* Connector line */}
              {i < history.length - 1 && <div className={styles.connector} style={{ borderColor: color }} />}

              {/* Dot */}
              <div className={styles.dot} style={{ background: color, boxShadow: `0 0 8px ${color}` }} />

              {/* Content */}
              <div className={styles.content}>
                <div className={styles.header}>
                  <span className={styles.day}>Day {entry.day}</span>
                  <span className={styles.sevBadge} style={{ color, background: `${color}20` }}>
                    {sev.toUpperCase()}
                  </span>
                </div>
                <div className={styles.event}>{event}</div>
                <div className={styles.probs}>
                  <span style={{ color: 'var(--mild)' }}>Mild: {(entry.mild * 100).toFixed(1)}%</span>
                  <span style={{ color: 'var(--moderate)' }}>Mod: {(entry.moderate * 100).toFixed(1)}%</span>
                  <span style={{ color: 'var(--severe)' }}>Sev: {(entry.severe * 100).toFixed(1)}%</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
