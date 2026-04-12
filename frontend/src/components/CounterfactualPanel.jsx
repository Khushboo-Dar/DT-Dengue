import { useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { simulate } from '../api/client.js';
import styles from './CounterfactualPanel.module.css';

const SCENARIO_COLORS = ['#4a9eff', '#f4a342', '#1D9E75', '#E24B4A', '#c579e8'];

function buildPayload(patientId, platRate, ivEffect, delay) {
  return {
    patient_id: patientId,
    scenarios: [
      { label: 'No Treatment',     platelet_recovery_rate: 0,        iv_fluid_effect: 0,        intervention_start_hour: 0    },
      { label: 'Conservative',     platelet_recovery_rate: platRate * 0.4, iv_fluid_effect: ivEffect * 0.4, intervention_start_hour: delay },
      { label: 'Custom',           platelet_recovery_rate: platRate,  iv_fluid_effect: ivEffect,  intervention_start_hour: delay },
      { label: 'Aggressive',       platelet_recovery_rate: 18,        iv_fluid_effect: 90,        intervention_start_hour: 0    },
    ],
  };
}

function buildChartData(scenarios) {
  const hours = [24, 48, 72];
  return hours.map((h) => {
    const point = { hour: h };
    scenarios.forEach((s) => {
      const t = s.trajectory.find(tp => tp.hour === h);
      point[s.label] = t ? t.severe : 0;
    });
    return point;
  });
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className={styles.tooltip}>
      <p className={styles.ttHour}>t+{label}h</p>
      {payload.map(p => (
        <p key={p.dataKey} style={{ color: p.color }}>
          {p.dataKey}: {(p.value * 100).toFixed(1)}% P(sv)
        </p>
      ))}
    </div>
  );
}

/**
 * Treatment simulation panel.
 * Three sliders configure a custom scenario; "Run simulation" fires
 * POST /simulate/counterfactual with 4 auto-generated scenarios.
 * The chart overlays P_severe trajectories; recommended scenario gets a green border.
 */
export default function CounterfactualPanel({ patientId }) {
  const [platRate,  setPlatRate]  = useState(5);
  const [ivEffect,  setIvEffect]  = useState(50);
  const [delay,     setDelay]     = useState(0);
  const [results,   setResults]   = useState(null);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState('');

  async function handleRun() {
    if (!patientId) return;
    setLoading(true);
    setError('');
    try {
      const data = await simulate(buildPayload(patientId, platRate, ivEffect, delay));
      setResults(data);
    } catch (e) {
      setError('Simulation failed — ' + (e.response?.data?.detail ?? e.message));
    } finally {
      setLoading(false);
    }
  }

  const chartData      = results ? buildChartData(results.scenarios) : null;
  const recommendedLbl = results?.scenarios.find(s => s.recommended)?.label;

  return (
    <div className={styles.panel}>
      <h2>Treatment Counterfactuals</h2>

      <div className={styles.sliders}>
        <label>
          <span>Platelet recovery rate: <strong>{platRate} u/day</strong></span>
          <input type="range" min="0" max="20" step="0.5"
            value={platRate} onChange={e => setPlatRate(+e.target.value)} />
        </label>
        <label>
          <span>IV fluid effect: <strong>{ivEffect}%</strong></span>
          <input type="range" min="0" max="100" step="1"
            value={ivEffect} onChange={e => setIvEffect(+e.target.value)} />
        </label>
        <label>
          <span>Intervention delay: <strong>{delay}h</strong></span>
          <input type="range" min="0" max="24" step="1"
            value={delay} onChange={e => setDelay(+e.target.value)} />
        </label>
      </div>

      <button
        className={styles.runBtn}
        onClick={handleRun}
        disabled={loading || !patientId}
      >
        {loading ? 'Simulating…' : 'Run Simulation'}
      </button>

      {error && <p className={styles.error}>{error}</p>}

      {chartData && (
        <>
          <div className={styles.scenarioList}>
            {results.scenarios.map((s, i) => (
              <div
                key={s.label}
                className={`${styles.scenBadge} ${s.recommended ? styles.recommended : ''}`}
                style={{ borderColor: SCENARIO_COLORS[i] }}
              >
                <span style={{ color: SCENARIO_COLORS[i] }}>●</span>
                <span>{s.label}</span>
                {s.recommended && <span className={styles.recTag}>Recommended</span>}
                <span className={styles.peakSev}>
                  peak P(sv): {(s.peak_severe * 100).toFixed(1)}%
                </span>
              </div>
            ))}
          </div>

          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={chartData} margin={{ top: 6, right: 16, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a2d3a" />
              <XAxis
                dataKey="hour"
                tickFormatter={v => `+${v}h`}
                tick={{ fill: '#888780', fontSize: 11 }}
                tickLine={false}
              />
              <YAxis
                domain={[0, 1]}
                tickFormatter={v => `${(v * 100).toFixed(0)}%`}
                tick={{ fill: '#888780', fontSize: 11 }}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip content={<CustomTooltip />} />
              {results.scenarios.map((s, i) => (
                <Line
                  key={s.label}
                  type="monotone"
                  dataKey={s.label}
                  stroke={SCENARIO_COLORS[i]}
                  strokeWidth={s.recommended ? 3 : 1.5}
                  strokeDasharray={s.recommended ? '0' : '4 2'}
                  dot={{ r: 3, fill: SCENARIO_COLORS[i] }}
                  activeDot={{ r: 5 }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </>
      )}
    </div>
  );
}
