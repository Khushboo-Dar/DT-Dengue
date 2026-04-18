import { useEffect, useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, BarChart, Bar, Cell,
} from 'recharts';
import { getModelMetrics } from '../api/client.js';
import styles from './MetricsPanel.module.css';

function CalibrationChart({ data }) {
  const chartData = data.fraction_of_positives.map((fop, i) => ({
    pred: data.mean_predicted_value[i],
    actual: fop,
  }));
  return (
    <div className={styles.subChart}>
      <h3>Calibration Curve — P(Severe)</h3>
      <p className={styles.subCaption}>Perfect calibration = diagonal. Curve below = overestimates risk.</p>
      <ResponsiveContainer width="100%" height={160}>
        <LineChart data={chartData} margin={{ top: 6, right: 10, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis dataKey="pred" tickFormatter={v=>`${(v*100).toFixed(0)}%`} tick={{fill:'var(--text-dim)',fontSize:10}} />
          <YAxis domain={[0,1]} tickFormatter={v=>`${(v*100).toFixed(0)}%`} tick={{fill:'var(--text-dim)',fontSize:10}} />
          <Tooltip formatter={v=>`${(v*100).toFixed(1)}%`} contentStyle={{background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:'8px',fontSize:12}} />
          <ReferenceLine x={0} y={0} stroke="none" />
          {/* Perfect calibration diagonal */}
          <Line type="linear" dataKey="pred" stroke="var(--border-bright)" strokeDasharray="5 3" dot={false} name="Perfect" />
          <Line type="monotone" dataKey="actual" stroke="var(--accent)" strokeWidth={2.5}
            dot={{r:3,fill:'var(--accent)'}} name="Model" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function ConfusionMatrix({ cm, labels }) {
  const maxVal = Math.max(...cm.flat());
  return (
    <div className={styles.subChart}>
      <h3>Confusion Matrix</h3>
      <div className={styles.cmGrid}>
        {['', ...labels].map((l, ci) => (
          <div key={`ch${ci}`} className={ci === 0 ? styles.cmCorner : styles.cmHeader}>{l}</div>
        ))}
        {cm.map((row, ri) => [
          <div key={`rl${ri}`} className={styles.cmRowLabel}>{labels[ri]}</div>,
          ...row.map((val, ci) => {
            const isDiag = ri === ci;
            const opacity = 0.1 + 0.85 * (val / (maxVal || 1));
            const bg = isDiag
              ? `rgba(29,158,117,${opacity})`
              : `rgba(226,75,74,${opacity * 0.6})`;
            return (
              <div key={`c${ri}${ci}`} className={styles.cmCell} style={{ background: bg }}>
                {val}
              </div>
            );
          }),
        ])}
      </div>
    </div>
  );
}

function AUCBars({ roc_auc }) {
  const data = [
    { name: 'Mild',     auc: roc_auc.mild     },
    { name: 'Moderate', auc: roc_auc.moderate  },
    { name: 'Severe',   auc: roc_auc.severe    },
    { name: 'Macro',    auc: roc_auc.macro     },
  ];
  const colors = ['var(--mild)', 'var(--moderate)', 'var(--severe)', 'var(--accent)'];
  return (
    <div className={styles.subChart}>
      <h3>ROC-AUC (One-vs-Rest)</h3>
      <ResponsiveContainer width="100%" height={120}>
        <BarChart data={data} margin={{ top: 4, right: 10, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis dataKey="name" tick={{fill:'var(--text-dim)',fontSize:11}} tickLine={false} />
          <YAxis domain={[0.5,1]} tickFormatter={v=>v.toFixed(2)} tick={{fill:'var(--text-dim)',fontSize:10}} />
          <Tooltip formatter={v=>v.toFixed(4)} contentStyle={{background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:'8px',fontSize:12}} />
          <Bar dataKey="auc" radius={[4,4,0,0]}>
            {data.map((_, i) => <Cell key={i} fill={colors[i]} />)}
          </Bar>
          <ReferenceLine y={0.9} stroke="var(--mild)" strokeDasharray="4 2" label={{value:'0.9',fill:'var(--mild)',fontSize:10}} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/**
 * Model validation metrics panel: calibration, ROC-AUC, confusion matrix, key stats.
 */
export default function MetricsPanel() {
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  useEffect(() => {
    getModelMetrics()
      .then(setMetrics)
      .catch(() => setError('Metrics not available — run docker compose up --build first'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className={styles.empty}>Loading model metrics…</div>;
  if (error)   return <div className={styles.empty}>{error}</div>;
  if (!metrics) return null;

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <h2>Model Validation Metrics</h2>
        <span className={styles.modelTag}>XGBoost · n_test={metrics.n_test}</span>
      </div>

      {/* Key stat pills */}
      <div className={styles.statRow}>
        <StatPill label="Accuracy" value={`${(metrics.accuracy*100).toFixed(1)}%`} color="var(--accent)" />
        <StatPill label="Severe Recall" value={`${(metrics.severe_recall*100).toFixed(1)}%`}
          color={metrics.severe_recall >= 0.95 ? 'var(--mild)' : 'var(--severe)'} />
        <StatPill label="ROC-AUC Macro" value={metrics.roc_auc.macro.toFixed(3)} color="var(--mild)" />
        <StatPill label="Brier Score" value={metrics.brier_score.toFixed(3)}
          color={metrics.brier_score < 0.1 ? 'var(--mild)' : 'var(--moderate)'} />
      </div>

      <div className={styles.charts}>
        <CalibrationChart data={metrics.calibration} />
        <AUCBars roc_auc={metrics.roc_auc} />
      </div>

      <ConfusionMatrix cm={metrics.confusion_matrix} labels={metrics.class_labels} />
    </div>
  );
}

function StatPill({ label, value, color }) {
  return (
    <div className={styles.statPill}>
      <span className={styles.statLbl}>{label}</span>
      <span className={styles.statVal} style={{ color }}>{value}</span>
    </div>
  );
}
