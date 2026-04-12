import { useState } from 'react';
import { updateSEIR } from '../api/client.js';
import styles from './SEIRStatus.module.css';

const BETA_MIN = 0.1;
const BETA_MAX = 0.9;

function betaColor(beta) {
  if (beta < 0.35) return 'var(--mild)';
  if (beta < 0.6)  return 'var(--moderate)';
  return 'var(--severe)';
}

function betaLabel(beta) {
  if (beta < 0.35) return 'LOW';
  if (beta < 0.6)  return 'MODERATE';
  return 'HIGH';
}

/**
 * Displays current posterior Beta distribution from the SEIR particle filter.
 * Includes a gauge arc, confidence-interval range bar, and an inline form
 * for submitting new weekly case counts.
 */
export default function SEIRStatus({ seir, onUpdate }) {
  const [open,  setOpen]  = useState(false);
  const [cases, setCases] = useState('');
  const [date,  setDate]  = useState(() => new Date().toISOString().slice(0, 10));
  const [busy,  setBusy]  = useState(false);

  const beta    = seir?.beta_mean  ?? 0.3;
  const p10     = seir?.beta_p10   ?? 0.2;
  const p90     = seir?.beta_p90   ?? 0.4;
  const ess     = seir?.ess        ?? null;
  const color   = betaColor(beta);
  const pct     = (beta - BETA_MIN) / (BETA_MAX - BETA_MIN);
  const p10pct  = (p10  - BETA_MIN) / (BETA_MAX - BETA_MIN) * 100;
  const p90pct  = (p90  - BETA_MIN) / (BETA_MAX - BETA_MIN) * 100;

  // SVG half-circle gauge params
  const R = 52, SW = 10, CX = 70, CY = 65;
  const arcLen = Math.PI * R;
  const arcFill = arcLen * pct;

  async function handleSubmit(e) {
    e.preventDefault();
    if (!cases || parseInt(cases, 10) < 0) return;
    setBusy(true);
    try {
      const result = await updateSEIR({ week_end_date: date, new_cases: parseInt(cases, 10) });
      onUpdate(result);
      setOpen(false);
      setCases('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.card}>
      <h3>Community Transmission</h3>

      <div className={styles.gaugeRow}>
        <svg viewBox="0 0 140 75" className={styles.gauge} aria-label={`Beta ${beta.toFixed(3)}`}>
          {/* Background arc */}
          <path
            d={`M ${CX - R} ${CY} A ${R} ${R} 0 0 1 ${CX + R} ${CY}`}
            fill="none"
            stroke="#2a2d3a"
            strokeWidth={SW}
            strokeLinecap="round"
          />
          {/* Value arc */}
          <path
            d={`M ${CX - R} ${CY} A ${R} ${R} 0 0 1 ${CX + R} ${CY}`}
            fill="none"
            stroke={color}
            strokeWidth={SW}
            strokeLinecap="round"
            strokeDasharray={`${arcFill} ${arcLen}`}
          />
          <text x={CX} y={CY - 10} textAnchor="middle" className={styles.betaVal} style={{ fill: color }}>
            {beta.toFixed(3)}
          </text>
          <text x={CX} y={CY + 4} textAnchor="middle" className={styles.betaLabel} style={{ fill: color }}>
            β  {betaLabel(beta)}
          </text>
        </svg>

        <div className={styles.stats}>
          {ess !== null && (
            <div className={styles.stat}>
              <span className={styles.statLbl}>ESS</span>
              <span className={styles.statVal}>{Math.round(ess)}</span>
            </div>
          )}
          <div className={styles.stat}>
            <span className={styles.statLbl}>90% CI</span>
            <span className={styles.statVal}>[{p10.toFixed(3)}, {p90.toFixed(3)}]</span>
          </div>
        </div>
      </div>

      {/* Range bar */}
      <div className={styles.rangeWrap}>
        <div className={styles.rangeBar}>
          <div
            className={styles.rangeFill}
            style={{ left: `${p10pct}%`, width: `${p90pct - p10pct}%`, background: color }}
          />
          <div
            className={styles.rangeDot}
            style={{ left: `${pct * 100}%`, background: color }}
          />
        </div>
        <div className={styles.rangeLabels}>
          <span>0.1</span><span>0.9</span>
        </div>
      </div>

      <button className={styles.updateBtn} onClick={() => setOpen(v => !v)}>
        {open ? 'Cancel' : 'Update Outbreak Data'}
      </button>

      {open && (
        <form className={styles.form} onSubmit={handleSubmit}>
          <label>
            Week ending
            <input type="date" value={date} onChange={e => setDate(e.target.value)} required />
          </label>
          <label>
            New cases
            <input
              type="number" min="0" value={cases}
              onChange={e => setCases(e.target.value)}
              placeholder="e.g. 240"
              required
            />
          </label>
          <button type="submit" disabled={busy} className={styles.submitBtn}>
            {busy ? 'Updating…' : 'Submit'}
          </button>
        </form>
      )}
    </div>
  );
}
