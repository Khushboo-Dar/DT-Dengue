/**
 * HumanTwin — animated SVG human body digital twin.
 *
 * Features:
 * A) Interactive live sliders — drag Platelets / Temp / Pulse Pressure to see
 *    the body react in real-time (no API call needed).
 * B) Live ECG waveform strip — canvas-drawn heartbeat that speeds up with danger.
 * C) Smooth SVG transitions — every fill/opacity change animates fluidly.
 *
 * Props: patient (full patient object with .inputs and .ekf_state)
 */
import { useState, useEffect, useRef } from 'react';
import styles from './HumanTwin.module.css';

// ── Helpers ──────────────────────────────────────────────────────────────────

function lerpColor(hex1, hex2, t) {
  const p = (h) => [
    parseInt(h.slice(1, 3), 16),
    parseInt(h.slice(3, 5), 16),
    parseInt(h.slice(5, 7), 16),
  ];
  const [r1, g1, b1] = p(hex1);
  const [r2, g2, b2] = p(hex2);
  const r = Math.round(r1 + (r2 - r1) * t);
  const g = Math.round(g1 + (g2 - g1) * t);
  const b = Math.round(b1 + (b2 - b1) * t);
  return `rgb(${r},${g},${b})`;
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

// ── Static data ──────────────────────────────────────────────────────────────

// 48 pre-positioned petechiae dots in 4 tiers
const PETECHIAE = [
  { x: 138, y: 46, tier: 1 }, { x: 162, y: 44, tier: 1 }, { x: 149, y: 52, tier: 1 },
  { x: 157, y: 58, tier: 1 }, { x: 140, y: 61, tier: 1 }, { x: 168, y: 54, tier: 1 },
  { x: 133, y: 55, tier: 1 }, { x: 155, y: 120, tier: 1 }, { x: 143, y: 118, tier: 1 },
  { x: 162, y: 130, tier: 1 }, { x: 138, y: 132, tier: 1 }, { x: 151, y: 140, tier: 1 },
  { x: 124, y: 165, tier: 2 }, { x: 174, y: 168, tier: 2 }, { x: 135, y: 175, tier: 2 },
  { x: 165, y: 172, tier: 2 }, { x: 148, y: 158, tier: 2 }, { x: 156, y: 182, tier: 2 },
  { x: 128, y: 188, tier: 2 }, { x: 171, y: 190, tier: 2 }, { x: 144, y: 196, tier: 2 },
  { x: 158, y: 200, tier: 2 }, { x: 136, y: 210, tier: 2 }, { x: 166, y: 208, tier: 2 },
  { x: 116, y: 155, tier: 3 }, { x: 183, y: 158, tier: 3 }, { x: 108, y: 172, tier: 3 },
  { x: 191, y: 175, tier: 3 }, { x: 112, y: 195, tier: 3 }, { x: 188, y: 198, tier: 3 },
  { x: 143, y: 225, tier: 3 }, { x: 157, y: 228, tier: 3 }, { x: 130, y: 240, tier: 3 },
  { x: 169, y: 242, tier: 3 }, { x: 148, y: 252, tier: 3 }, { x: 152, y: 260, tier: 3 },
  { x: 99,  y: 205, tier: 4 }, { x: 201, y: 208, tier: 4 }, { x: 94,  y: 222, tier: 4 },
  { x: 206, y: 225, tier: 4 }, { x: 91,  y: 238, tier: 4 }, { x: 209, y: 241, tier: 4 },
  { x: 85,  y: 255, tier: 4 }, { x: 215, y: 258, tier: 4 }, { x: 137, y: 278, tier: 4 },
  { x: 163, y: 280, tier: 4 }, { x: 145, y: 292, tier: 4 }, { x: 156, y: 294, tier: 4 },
];

const TORSO_PATH = 'M 112 138 L  88 140 L  95 300 L 122 310 L 178 310 L 205 300 L 212 140 L 188 138 Z';
const HEART_PATH = 'M 150 200 C 150 200 130 188 130 178 C 130 170 138 165 150 174 C 162 165 170 170 170 178 C 170 188 150 200 150 200 Z';

// Shared transition for smooth SVG fill/opacity changes
const SMOOTH = { transition: 'fill 0.8s ease, opacity 0.8s ease' };

// ECG beat pattern — normalised P-QRS-T complex
const ECG_BEAT = [
  0,0,0,0,0,0.04,0.08,0.12,0.08,0.04,0,0,     // P wave
  0,-0.08,-0.18,0.85,1.0,0.75,-0.25,-0.12,0,    // QRS complex
  0,0,0,0.08,0.18,0.24,0.18,0.08,0,0,0,0,       // T wave
  0,0,0,0,0,0,0,0,0,0,                           // baseline
];

// ── ECG Monitor sub-component ────────────────────────────────────────────────

function ECGStrip({ bpm, color, critical }) {
  const canvasRef = useRef(null);
  const offsetRef = useRef(0);
  const animRef   = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width;
    const H = canvas.height;
    const mid = H / 2;
    const amp = H * 0.38;
    const pixelsPerBeat = 100;
    const speed = (bpm / 72) * 1.2;  // px per frame, scaled by bpm

    function draw() {
      offsetRef.current += speed;
      if (offsetRef.current > pixelsPerBeat * 10) offsetRef.current = 0;

      // Dark background
      ctx.fillStyle = '#0a0d14';
      ctx.fillRect(0, 0, W, H);

      // Subtle grid
      ctx.strokeStyle = 'rgba(37, 40, 56, 0.4)';
      ctx.lineWidth = 0.5;
      for (let gy = 0; gy < H; gy += 12) {
        ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke();
      }
      for (let gx = 0; gx < W; gx += 12) {
        ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, H); ctx.stroke();
      }

      // ECG trace
      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.shadowColor = color;
      ctx.shadowBlur = 6;

      for (let x = 0; x < W; x++) {
        let beatPhase = ((x + offsetRef.current) % pixelsPerBeat) / pixelsPerBeat;
        let idx = Math.floor(beatPhase * ECG_BEAT.length) % ECG_BEAT.length;
        let val = ECG_BEAT[idx];

        // Add jitter for critical / arrhythmic
        if (critical && Math.random() < 0.03) val += (Math.random() - 0.5) * 0.4;

        const y = mid - val * amp;
        if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;

      // BPM label
      ctx.fillStyle = color;
      ctx.font = 'bold 11px monospace';
      ctx.fillText(`${bpm} BPM`, 8, 14);

      animRef.current = requestAnimationFrame(draw);
    }

    draw();
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, [bpm, color, critical]);

  return (
    <canvas
      ref={canvasRef}
      width={420}
      height={56}
      className={styles.ecgCanvas}
    />
  );
}

// ── Slider control ───────────────────────────────────────────────────────────

function VitalSlider({ label, value, min, max, step, onChange, unit, dangerLow, dangerHigh }) {
  const isDanger = (dangerLow != null && value <= dangerLow) ||
                   (dangerHigh != null && value >= dangerHigh);
  const displayVal = Number.isInteger(step)
    ? Math.round(value)
    : value.toFixed(1);

  return (
    <div className={styles.sliderRow}>
      <div className={styles.sliderHeader}>
        <span className={styles.sliderLabel}>{label}</span>
        <span className={`${styles.sliderValue} ${isDanger ? styles.sliderDanger : ''}`}>
          {displayVal}{unit && <span className={styles.sliderUnit}> {unit}</span>}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        className={styles.rangeInput}
      />
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export default function HumanTwin({ patient }) {
  // Local slider overrides (reset when patient changes)
  const [overrides, setOverrides] = useState({});
  const [slidersOpen, setSlidersOpen] = useState(true);
  const patientId = patient?.patient_id;

  useEffect(() => { setOverrides({}); }, [patientId]);

  // ── Empty state ──────────────────────────────────────────────────────────
  if (!patient) {
    return (
      <div className={styles.emptyState}>
        <svg className={styles.emptyIcon} width="120" height="220" viewBox="0 0 300 560">
          <ellipse cx="150" cy="65" rx="42" ry="46" fill="#252838" />
          <rect x="133" y="108" width="34" height="25" rx="4" fill="#252838" />
          <path d={TORSO_PATH} fill="#252838" />
          <rect x="76" y="135" width="28" height="90" rx="10" fill="#252838" />
          <rect x="196" y="135" width="28" height="90" rx="10" fill="#252838" />
          <rect x="112" y="308" width="34" height="100" rx="10" fill="#252838" />
          <rect x="154" y="308" width="34" height="100" rx="10" fill="#252838" />
        </svg>
        <p className={styles.emptyText}>Select a patient to activate the digital twin</p>
      </div>
    );
  }

  // ── Merge patient inputs with slider overrides ───────────────────────────
  const rawInputs   = patient.inputs ?? {};
  const ekf         = patient.ekf_state ?? {};
  const psos        = patient.PSOS ?? {};
  const sevLabel    = patient.severity_label ?? 'mild';

  const platelets   = overrides.Platelets    ?? rawInputs.Platelets    ?? ekf.x_hat?.[0] ?? 150;
  const wbc         = overrides.WBC          ?? rawInputs.WBC          ?? ekf.x_hat?.[2] ?? 5;
  const hematocrit  = rawInputs.Hematocrit   ?? 40;
  const ns1         = rawInputs.NS1_antigen  ?? 0;
  const astAlt      = overrides.AST_ALT_ratio ?? rawInputs.AST_ALT_ratio ?? 1;
  const pulsePres   = overrides.pulse_pressure ?? rawInputs.pulse_pressure ?? 40;
  const warnSigns   = overrides.warning_signs  ?? rawInputs.warning_signs  ?? 0;
  const tempLag1    = overrides.Temp_lag1      ?? rawInputs.Temp_lag1      ?? 37.5;
  const pSevere     = psos.severe             ?? 0;
  const dayOfIllness = patient.dayOfIllness   ?? rawInputs.day_of_illness ?? '?';

  const ekfPlatelets = ekf.x_hat?.[0] ?? platelets;
  const ekfWBC       = ekf.x_hat?.[2] ?? wbc;

  // ── Derived visual state ─────────────────────────────────────────────────
  const feverT    = clamp((tempLag1 - 37) / 3, 0, 1);
  const skinColor = lerpColor('#c8a882', '#d96a3a', feverT);

  const auraStyle = {
    mild:     { animation: 'auraPulseMild 3s ease-in-out infinite',     filter: 'drop-shadow(0 0 8px #1D9E75)' },
    moderate: { animation: 'auraPulseModerate 2s ease-in-out infinite', filter: 'drop-shadow(0 0 10px #E8933A)' },
    severe:   { animation: 'auraPulseSevere 0.8s ease-in-out infinite', filter: 'drop-shadow(0 0 12px #E24B4A)' },
  }[sevLabel] ?? {};

  const pTier         = platelets >= 150 ? 0 : platelets >= 100 ? 1 : platelets >= 50 ? 2 : 4;
  const vesselOpacity = clamp(0.15 + (platelets / 150) * 0.35, 0.15, 0.5);

  const heartAnim =
    pulsePres < 20 ? 'heartbeatCritical 0.6s ease-in-out infinite' :
    pulsePres < 30 ? 'heartbeatFast 0.7s ease-in-out infinite' :
                     'heartbeat 0.9s ease-in-out infinite';
  const heartT     = clamp(1 - (pulsePres - 10) / 50, 0, 1);
  const heartColor = lerpColor('#554444', '#E24B4A', heartT);

  const liverColor = astAlt > 3 ? '#e05a20' : astAlt > 2 ? '#d4922a' : '#5a3a1a';
  const liverAnim  = astAlt > 3 ? 'organFlash 1.2s ease-in-out infinite' : 'none';
  const stomachOpacity = warnSigns >= 2 ? 0.7 : 0.25;

  // ECG: BPM derived from pulse pressure
  const ecgBpm =
    pulsePres < 15 ? 130 :
    pulsePres < 20 ? 115 :
    pulsePres < 30 ? 95  :
    pulsePres < 40 ? 80  : 72;
  const ecgColor = sevLabel === 'severe' ? '#E24B4A' : sevLabel === 'moderate' ? '#E8933A' : '#1D9E75';

  // Badge classes
  const platClass = platelets < 50 ? styles.critical : platelets < 100 ? styles.warning : styles.normal;
  const ppClass   = pulsePres < 20 ? styles.critical : pulsePres < 30 ? styles.warning : styles.normal;
  const astClass  = astAlt > 3 ? styles.critical : astAlt > 2 ? styles.warning : styles.normal;
  const platTrend = ekfPlatelets < platelets ? '▼' : ekfPlatelets > platelets ? '▲' : '–';

  // Helper for slider onChange
  const setOv = (key) => (val) => setOverrides(prev => ({ ...prev, [key]: val }));

  return (
    <div className={styles.wrapper}>
      {/* Shock risk banner */}
      {pulsePres < 20 && (
        <div className={styles.shockBanner}>⚡ SHOCK RISK</div>
      )}

      {/* P(severe) above */}
      <div className={`${styles.severityBadge} ${styles[sevLabel]}`}>
        {(pSevere * 100).toFixed(1)}%
      </div>
      <div className={`${styles.severityLabel} ${styles[sevLabel]}`}>
        P(severe) · {sevLabel}
      </div>

      {/* ── Body row: badges | SVG | badges ──────────────────────────── */}
      <div className={styles.bodyRow}>
        {/* Left badges */}
        <div className={styles.badgesLeft}>
          <div className={`${styles.vitalBadge} ${platClass}`}>
            <div className={styles.badgeLabel}>Platelets</div>
            <div className={styles.badgeValue}>
              {Math.round(platelets)}
              <span className={styles.badgeTrend}>{platTrend}</span>
            </div>
            <div className={styles.badgeLabel}>×10³/μL</div>
          </div>
          <div className={`${styles.vitalBadge} ${wbc < 3 ? styles.critical : wbc > 10 ? styles.warning : styles.normal}`}>
            <div className={styles.badgeLabel}>WBC</div>
            <div className={styles.badgeValue}>{Number(wbc).toFixed(1)}</div>
            <div className={styles.badgeLabel}>×10³/μL</div>
          </div>
          <div className={`${styles.vitalBadge} ${hematocrit > 50 ? styles.warning : styles.normal}`}>
            <div className={styles.badgeLabel}>HCT</div>
            <div className={styles.badgeValue}>{Number(hematocrit).toFixed(1)}%</div>
          </div>
        </div>

        {/* ── SVG Body ─────────────────────────────────────────────── */}
        <svg
          className={styles.svgBody}
          width="220"
          height="420"
          viewBox="0 0 300 560"
          style={auraStyle}
        >
          <defs>
            <filter id="aura-filter" x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="6" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
            <filter id="organ-glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>

          {/* Layer 1 — Body silhouette (smooth fill transition) */}
          <ellipse cx="150" cy="65" rx="42" ry="46" fill={skinColor} style={SMOOTH} />
          <ellipse cx="136" cy="63" rx="5" ry="5.5" fill="rgba(0,0,0,0.25)" />
          <ellipse cx="164" cy="63" rx="5" ry="5.5" fill="rgba(0,0,0,0.25)" />
          <rect x="133" y="108" width="34" height="25" rx="4" fill={skinColor} style={SMOOTH} />
          <path d={TORSO_PATH} fill={skinColor} style={SMOOTH} />
          <rect x="76"  y="135" width="28" height="85" rx="12" fill={skinColor} style={SMOOTH} />
          <rect x="80"  y="218" width="24" height="70" rx="10" fill={skinColor} style={SMOOTH} />
          <ellipse cx="92"  cy="298" rx="13" ry="14" fill={skinColor} style={SMOOTH} />
          <rect x="196" y="135" width="28" height="85" rx="12" fill={skinColor} style={SMOOTH} />
          <rect x="196" y="218" width="24" height="70" rx="10" fill={skinColor} style={SMOOTH} />
          <ellipse cx="208" cy="298" rx="13" ry="14" fill={skinColor} style={SMOOTH} />
          <rect x="112" y="308" width="34" height="95" rx="14" fill={skinColor} style={SMOOTH} />
          <rect x="154" y="308" width="34" height="95" rx="14" fill={skinColor} style={SMOOTH} />
          <rect x="116" y="400" width="27" height="85" rx="10" fill={skinColor} style={SMOOTH} />
          <rect x="157" y="400" width="27" height="85" rx="10" fill={skinColor} style={SMOOTH} />
          <ellipse cx="132" cy="494" rx="20" ry="10" fill={skinColor} style={SMOOTH} />
          <ellipse cx="168" cy="494" rx="20" ry="10" fill={skinColor} style={SMOOTH} />

          {/* Layer 2 — Internal organs */}
          <g style={{ ...SMOOTH, opacity: vesselOpacity }} stroke="#c0392b" strokeWidth="1.2" fill="none">
            <path d="M 150 140 L 150 300" />
            <path d="M 150 175 Q 125 185 118 210" />
            <path d="M 150 175 Q 175 185 182 210" />
            <path d="M 150 220 Q 130 235 120 260" />
            <path d="M 150 220 Q 170 235 180 260" />
          </g>

          <ellipse cx="121" cy="192" rx="20" ry="32" fill="rgba(180,100,90,0.4)"
            style={{ transformOrigin: '121px 208px', animation: 'breathe 3s ease-in-out infinite' }} />
          <ellipse cx="179" cy="192" rx="20" ry="32" fill="rgba(180,100,90,0.4)"
            style={{ transformOrigin: '179px 208px', animation: 'breathe 3s ease-in-out infinite 0.15s' }} />

          <path d={HEART_PATH} fill={heartColor} filter="url(#organ-glow)"
            style={{ ...SMOOTH, transformOrigin: '150px 185px', animation: heartAnim }} />

          <ellipse cx="172" cy="237" rx="26" ry="16" fill={liverColor}
            style={{ ...SMOOTH, animation: liverAnim }}
            opacity={astAlt > 3 ? 1 : 0.75}
            filter={astAlt > 2 ? 'url(#organ-glow)' : undefined} />

          <ellipse cx="130" cy="238" rx="18" ry="14"
            fill={`rgba(180,140,60,${stomachOpacity})`}
            style={warnSigns >= 2 ? { ...SMOOTH, animation: 'organFlash 1.8s ease-in-out infinite' } : SMOOTH} />

          {/* Layer 3 — Petechiae */}
          {PETECHIAE.map((dot, i) => {
            const visible = dot.tier <= pTier;
            if (!visible) return null;
            const isBleed = pTier >= 4;
            const delay = (i * 0.13) % 2;
            return (
              <circle key={i} cx={dot.x} cy={dot.y} r={2.5} fill="#e24b4a"
                opacity={isBleed ? 0.85 : dot.tier === 1 ? 0.4 : 0.65}
                style={isBleed ? { animation: `petechaieBleed 2s ease-in-out ${delay}s infinite` } : {}} />
            );
          })}

          {/* Layer 4 — Warning badges */}
          {ns1 > 0.5 && (
            <g>
              <circle cx="120" cy="118" r="8" fill="rgba(197,121,232,0.25)" stroke="#c579e8" strokeWidth="1.5">
                <animate attributeName="r" values="6;9;6" dur="2s" repeatCount="indefinite" />
              </circle>
              <text x="120" y="122" textAnchor="middle" fontSize="7" fill="#c579e8" fontWeight="bold">NS1</text>
            </g>
          )}
          {warnSigns >= 1 && (
            <g>
              <circle cx="192" cy="42" r="10" fill="rgba(232,147,58,0.2)" stroke="#E8933A" strokeWidth="1.5" />
              <text x="192" y="40" textAnchor="middle" fontSize="9" fill="#E8933A">⚡</text>
              <text x="192" y="50" textAnchor="middle" fontSize="6" fill="#E8933A">head</text>
            </g>
          )}
          {warnSigns >= 3 && (
            <g>
              <circle cx="107" cy="250" r="10" fill="rgba(226,75,74,0.2)" stroke="#E24B4A" strokeWidth="1.5">
                <animate attributeName="opacity" values="0.8;1;0.8" dur="1.5s" repeatCount="indefinite" />
              </circle>
              <text x="107" y="248" textAnchor="middle" fontSize="9" fill="#E24B4A">!</text>
              <text x="107" y="257" textAnchor="middle" fontSize="6" fill="#E24B4A">abd</text>
            </g>
          )}

          <text x="150" y="520" textAnchor="middle" fontSize="11" fill="#8b8d97">
            Day {dayOfIllness}
          </text>
        </svg>

        {/* Right badges */}
        <div className={styles.badgesRight}>
          <div className={`${styles.vitalBadge} ${ppClass}`}>
            <div className={styles.badgeLabel}>Pulse Press</div>
            <div className={styles.badgeValue}>{Math.round(pulsePres)}</div>
            <div className={styles.badgeLabel}>mmHg</div>
          </div>
          <div className={`${styles.vitalBadge} ${astClass}`}>
            <div className={styles.badgeLabel}>AST/ALT</div>
            <div className={styles.badgeValue}>{Number(astAlt).toFixed(1)}</div>
          </div>
          <div className={`${styles.vitalBadge} ${warnSigns >= 3 ? styles.critical : warnSigns >= 1 ? styles.warning : styles.normal}`}>
            <div className={styles.badgeLabel}>Warn Signs</div>
            <div className={styles.badgeValue}>{warnSigns}/5</div>
          </div>
        </div>
      </div>

      {/* ── ECG Waveform Strip ────────────────────────────────────────── */}
      <div className={styles.ecgWrap}>
        <ECGStrip bpm={ecgBpm} color={ecgColor} critical={pulsePres < 20} />
      </div>

      {/* Day label */}
      <div className={styles.dayLabel}>Day of illness: {dayOfIllness}</div>

      {/* ── Interactive Sliders ────────────────────────────────────────── */}
      <div className={styles.sliderSection}>
        <button
          className={styles.sliderToggle}
          onClick={() => setSlidersOpen(v => !v)}
        >
          {slidersOpen ? '▲ Hide' : '▼ Show'} Live Controls
        </button>

        {slidersOpen && (
          <div className={styles.sliderGrid}>
            <VitalSlider label="Platelets" value={platelets} min={5} max={400} step={1}
              onChange={setOv('Platelets')} unit="×10³" dangerLow={50} />
            <VitalSlider label="Temperature" value={tempLag1} min={36} max={41} step={0.1}
              onChange={setOv('Temp_lag1')} unit="°C" dangerHigh={39} />
            <VitalSlider label="Pulse Pressure" value={pulsePres} min={5} max={80} step={1}
              onChange={setOv('pulse_pressure')} unit="mmHg" dangerLow={20} />
            <VitalSlider label="AST/ALT Ratio" value={astAlt} min={0.5} max={8} step={0.1}
              onChange={setOv('AST_ALT_ratio')} dangerHigh={3} />
            <VitalSlider label="Warning Signs" value={warnSigns} min={0} max={5} step={1}
              onChange={setOv('warning_signs')} dangerHigh={3} />
          </div>
        )}

        {Object.keys(overrides).length > 0 && (
          <button className={styles.resetBtn} onClick={() => setOverrides({})}>
            Reset to patient values
          </button>
        )}
      </div>
    </div>
  );
}
