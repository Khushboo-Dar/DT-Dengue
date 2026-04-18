import { useEffect, useState } from 'react';
import {
  ComposedChart, Area, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { getForecast } from '../api/client.js';
import styles from './ForecastChart.module.css';

function buildChartData(forecast) {
  return forecast.days.map((day, i) => ({
    day,
    p5:     forecast.p_severe_p5[i],
    p50:    forecast.p_severe_p50[i],
    p95:    forecast.p_severe_p95[i],
    mild:   forecast.p_mild_p50[i],
    moderate: forecast.p_moderate_p50[i],
  }));
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const p50   = payload.find(p => p.dataKey === 'p50');
  const mild  = payload.find(p => p.dataKey === 'mild');
  const mod   = payload.find(p => p.dataKey === 'moderate');
  return (
    <div className={styles.tooltip}>
      <p className={styles.ttDay}>Day +{label}</p>
      {mild  && <p style={{color:'var(--mild)'}}>Mild: {(mild.value*100).toFixed(1)}%</p>}
      {mod   && <p style={{color:'var(--moderate)'}}>Moderate: {(mod.value*100).toFixed(1)}%</p>}
      {p50   && <p style={{color:'var(--severe)'}}>P(severe) median: {(p50.value*100).toFixed(1)}%</p>}
    </div>
  );
}

/**
 * 7-day predictive trajectory with 90% confidence band (P5–P95) for P(severe).
 * Fetches from GET /forecast/{patientId}.
 */
export default function ForecastChart({ patientId, forecast: initialForecast, onForecastLoaded }) {
  const [forecast, setForecast] = useState(initialForecast ?? null);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');

  useEffect(() => {
    if (!patientId) return;
    setLoading(true);
    setError('');
    getForecast(patientId)
      .then(data => {
        setForecast(data);
        onForecastLoaded?.(patientId, data);
      })
      .catch(() => setError('Forecast unavailable'))
      .finally(() => setLoading(false));
  }, [patientId]);

  if (loading) return <div className={styles.empty}>Computing 7-day forecast…</div>;
  if (error)   return <div className={styles.empty}>{error}</div>;
  if (!forecast) return null;

  const chartData = buildChartData(forecast);
  const maxP95    = Math.max(...forecast.p_severe_p95);
  const critDay   = forecast.p_severe_p50.findIndex(v => v > 0.5) + 1;

  return (
    <div className={styles.wrap}>
      <div className={styles.header}>
        <h2>7-Day Predictive Trajectory</h2>
        {critDay > 0 && (
          <span className={styles.critAlert}>
            Critical threshold may be reached by day +{critDay}
          </span>
        )}
        {maxP95 < 0.3 && (
          <span className={styles.stableTag}>Stable trajectory</span>
        )}
      </div>

      <ResponsiveContainer width="100%" height={220}>
        <ComposedChart data={chartData} margin={{ top: 8, right: 16, left: -10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis
            dataKey="day"
            label={{ value: 'Days from now', position: 'insideBottom', offset: -2, fill: 'var(--text-dim)', fontSize: 11 }}
            tick={{ fill: 'var(--text-dim)', fontSize: 11 }}
            tickLine={false}
          />
          <YAxis
            domain={[0, 1]}
            tickFormatter={v => `${(v*100).toFixed(0)}%`}
            tick={{ fill: 'var(--text-dim)', fontSize: 11 }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />

          {/* 90% CI band for severe */}
          <Area
            type="monotone"
            dataKey="p95"
            stroke="none"
            fill="rgba(226,75,74,0.12)"
            legendType="none"
            name="P(severe) 90% CI"
          />
          <Area
            type="monotone"
            dataKey="p5"
            stroke="none"
            fill="var(--bg2)"
            legendType="none"
            name=" "
          />

          {/* Median severe line */}
          <Line
            type="monotone"
            dataKey="p50"
            stroke="var(--severe)"
            strokeWidth={2.5}
            dot={{ r: 3, fill: 'var(--severe)' }}
            name="P(severe) median"
          />
          <Line
            type="monotone"
            dataKey="mild"
            stroke="var(--mild)"
            strokeWidth={1.5}
            strokeDasharray="4 2"
            dot={false}
            name="P(mild)"
          />
          <Line
            type="monotone"
            dataKey="moderate"
            stroke="var(--moderate)"
            strokeWidth={1.5}
            strokeDasharray="4 2"
            dot={false}
            name="P(moderate)"
          />
        </ComposedChart>
      </ResponsiveContainer>
      <p className={styles.caption}>
        Shaded band = 90% confidence interval (Monte Carlo, n=200). Dashed lines = median P(mild)/P(moderate).
      </p>
    </div>
  );
}
