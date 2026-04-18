import styles from './SHAPChart.module.css';

const FEATURE_LABELS = {
  WBC:            'WBC',
  Platelets:      'Platelets',
  Hematocrit:     'Hematocrit',
  NS1_antigen:    'NS1 Antigen',
  AST_ALT_ratio:  'AST/ALT Ratio',
  pulse_pressure: 'Pulse Pressure',
  warning_signs:  'Warning Signs',
  SEIR_Beta:      'Community β',
  day_of_illness: 'Day of Illness',
  platelet_trend: 'Platelet Trend',
  WBC_trend:      'WBC Trend',
  PSOS_prior:     'Prior P(severe)',
};

function formatFeatureLabel(name) {
  return FEATURE_LABELS[name] ?? name.replace(/_/g, ' ');
}

/**
 * Horizontal bar chart showing top-5 SHAP values for a prediction.
 * Positive SHAP = pushes toward predicted class (red if severe, green if mild).
 * Negative SHAP = pushes away.
 */
export default function SHAPChart({ shap, severityLabel }) {
  if (!shap || shap.length === 0) return null;

  const maxAbs = Math.max(...shap.map(s => Math.abs(s.shap)), 0.001);

  const posColor = severityLabel === 'severe'   ? 'var(--severe)'
                 : severityLabel === 'moderate' ? 'var(--moderate)'
                 : 'var(--mild)';

  return (
    <div className={styles.wrap}>
      <h3>Why this prediction? — Top drivers</h3>
      <div className={styles.chart}>
        {shap.map(item => {
          const pct = (Math.abs(item.shap) / maxAbs) * 100;
          const isPositive = item.shap >= 0;
          const color = isPositive ? posColor : 'var(--text-faint)';

          return (
            <div key={item.feature} className={styles.row}>
              <div className={styles.label}>
                <span className={styles.fname}>{formatFeatureLabel(item.feature)}</span>
                <span className={styles.fval}>{item.value}</span>
              </div>
              <div className={styles.barWrap}>
                <div
                  className={styles.bar}
                  style={{
                    width: `${pct}%`,
                    background: color,
                    marginLeft: isPositive ? '50%' : `calc(50% - ${pct / 2}%)`,
                  }}
                />
                <div className={styles.zero} />
              </div>
              <span className={styles.shapVal} style={{ color }}>
                {item.shap > 0 ? '+' : ''}{item.shap.toFixed(3)}
              </span>
            </div>
          );
        })}
      </div>
      <p className={styles.caption}>
        SHAP values: positive = pushes toward <strong>{severityLabel}</strong> prediction
      </p>
    </div>
  );
}
