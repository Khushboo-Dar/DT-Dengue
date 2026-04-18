import { useEffect, useState } from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { getHospitalForecast } from '../api/client.js';
import styles from './HospitalPanel.module.css';

const OUTBREAK_COLORS = {
  LOW:      'var(--mild)',
  MODERATE: 'var(--moderate)',
  HIGH:     'var(--severe)',
  CRITICAL: '#ff2040',
};

function SeverityDonut({ mild, moderate, severe }) {
  const data = [
    { name: 'Mild',     value: mild     || 0, color: 'var(--mild)'     },
    { name: 'Moderate', value: moderate || 0, color: 'var(--moderate)' },
    { name: 'Severe',   value: severe   || 0, color: 'var(--severe)'   },
  ].filter(d => d.value > 0);

  if (!data.length) return <div className={styles.empty}>No patients yet</div>;

  return (
    <ResponsiveContainer width="100%" height={140}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius={38}
          outerRadius={58}
          paddingAngle={3}
          dataKey="value"
        >
          {data.map((entry, i) => (
            <Cell key={i} fill={entry.color} />
          ))}
        </Pie>
        <Tooltip
          formatter={(v, name) => [v, name]}
          contentStyle={{background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:'8px',fontSize:12}}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}

/**
 * Hospital-level aggregate view:
 * outbreak level, severity donut, ICU demand, risk queue.
 */
export default function HospitalPanel({ onUpdate }) {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(false);

  function refresh() {
    setLoading(true);
    getHospitalForecast()
      .then(d => { setData(d); onUpdate?.(d); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }

  useEffect(() => { refresh(); }, []);

  const outbreakColor = OUTBREAK_COLORS[data?.outbreak_level] ?? 'var(--neutral)';

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <h2>Hospital Command Centre</h2>
        <button onClick={refresh} disabled={loading} className={styles.refreshBtn}>
          {loading ? '…' : '↻ Refresh'}
        </button>
      </div>

      {/* Outbreak level banner */}
      <div className={styles.outbreakBanner} style={{ borderColor: outbreakColor, color: outbreakColor }}>
        <span className={styles.outbreakIcon}>◉</span>
        <span>
          Outbreak level: <strong>{data?.outbreak_level ?? '–'}</strong>
          &nbsp;·&nbsp;Community β = {data?.beta_mean?.toFixed(3) ?? '–'}
        </span>
      </div>

      <div className={styles.grid}>
        {/* Left: donut + stats */}
        <div className={styles.donutCol}>
          <h3>Patient Census</h3>
          <SeverityDonut mild={data?.mild} moderate={data?.moderate} severe={data?.severe} />
          <div className={styles.countRow}>
            <Chip label="Mild"     value={data?.mild     ?? 0} color="var(--mild)"     />
            <Chip label="Moderate" value={data?.moderate ?? 0} color="var(--moderate)" />
            <Chip label="Severe"   value={data?.severe   ?? 0} color="var(--severe)"   />
          </div>
          <div className={styles.icuBox}>
            <span className={styles.icuLabel}>ICU demand estimate</span>
            <span className={styles.icuVal} style={{color: (data?.icu_demand_estimate ?? 0) > 0 ? 'var(--severe)' : 'var(--mild)'}}>
              {data?.icu_demand_estimate ?? 0} patient{data?.icu_demand_estimate !== 1 ? 's' : ''}
            </span>
            <span className={styles.icuSub}>P(severe) &gt; 50%</span>
          </div>
        </div>

        {/* Right: risk queue */}
        <div className={styles.queueCol}>
          <h3>Risk Queue — top {data?.risk_queue?.length ?? 0} by P(severe)</h3>
          {!data?.risk_queue?.length && (
            <p className={styles.empty}>No patients tracked yet</p>
          )}
          <div className={styles.queue}>
            {(data?.risk_queue ?? []).map((p, i) => (
              <div key={p.patient_id} className={styles.queueRow}>
                <span className={styles.rank}>{i + 1}</span>
                <span className={styles.pid}>{p.patient_id}</span>
                <span className={`sev-chip ${p.severity_label}`}>{p.severity_label}</span>
                <div className={styles.psvBar}>
                  <div
                    className={styles.psvFill}
                    style={{
                      width: `${(p.p_severe * 100).toFixed(0)}%`,
                      background: p.p_severe > 0.5 ? 'var(--severe)' :
                                  p.p_severe > 0.3 ? 'var(--moderate)' : 'var(--mild)',
                    }}
                  />
                </div>
                <span className={styles.psvPct}>{(p.p_severe * 100).toFixed(0)}%</span>
                {p.warning_signs > 0 && (
                  <span className={styles.warnBadge}>⚠ {p.warning_signs}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Chip({ label, value, color }) {
  return (
    <div className={styles.chip}>
      <span style={{ color, fontWeight: 700, fontSize: 18 }}>{value}</span>
      <span className={styles.chipLbl}>{label}</span>
    </div>
  );
}
