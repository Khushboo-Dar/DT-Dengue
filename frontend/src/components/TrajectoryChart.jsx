import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import styles from './TrajectoryChart.module.css';

const C_MILD     = '#1D9E75';
const C_MODERATE = '#E8933A';
const C_SEVERE   = '#E24B4A';

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className={styles.tooltip}>
      <p className={styles.ttDay}>Day {label}</p>
      {payload.map(p => (
        <p key={p.dataKey} style={{ color: p.color }}>
          {p.name}: {(p.value * 100).toFixed(1)}%
        </p>
      ))}
    </div>
  );
}

/**
 * Multi-line trajectory chart showing mild / moderate / severe PSOS
 * probability over illness day. `history` is an array of
 * { day, mild, moderate, severe } objects.
 */
export default function TrajectoryChart({ history }) {
  if (!history || history.length === 0) {
    return (
      <div className={styles.empty}>
        No trajectory data yet — add a patient reading to begin tracking.
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <h2>Patient Severity Trajectory</h2>
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={history} margin={{ top: 8, right: 16, left: -10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#2a2d3a" />
          <XAxis
            dataKey="day"
            label={{ value: 'Day of illness', position: 'insideBottom', offset: -2, fill: '#888780', fontSize: 11 }}
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
          <Legend
            wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
            formatter={name => name.charAt(0).toUpperCase() + name.slice(1)}
          />
          <ReferenceLine y={0.5} stroke="#2a2d3a" strokeDasharray="4 4" />
          <Line
            type="monotone"
            dataKey="mild"
            stroke={C_MILD}
            strokeWidth={2}
            dot={{ r: 3, fill: C_MILD }}
            activeDot={{ r: 5 }}
            name="mild"
          />
          <Line
            type="monotone"
            dataKey="moderate"
            stroke={C_MODERATE}
            strokeWidth={2}
            dot={{ r: 3, fill: C_MODERATE }}
            activeDot={{ r: 5 }}
            name="moderate"
          />
          <Line
            type="monotone"
            dataKey="severe"
            stroke={C_SEVERE}
            strokeWidth={2.5}
            dot={{ r: 3, fill: C_SEVERE }}
            activeDot={{ r: 5 }}
            name="severe"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
