import { useState, useEffect } from 'react';
import { getWeatherLags } from '../api/client.js';
import styles from './PatientAdmissionForm.module.css';

const DEFAULT_FORM = {
  patient_id: '',
  day_of_illness: '3',
  WBC: '',
  Platelets: '',
  Hematocrit: '40',
  NS1_antigen: '0',
  AST_ALT_ratio: '1.0',
  pulse_pressure: '38',
  warning_signs: '0',
  Temp_lag1: '37.5', Temp_lag2: '37.5', Temp_lag3: '37.5',
  Temp_lag4: '37.2', Temp_lag5: '37.0', Temp_lag6: '36.9',
  Rain_lag1: '60', Rain_lag2: '60', Rain_lag3: '55',
  Rain_lag4: '50', Rain_lag5: '45', Rain_lag6: '40',
};

function generateId() {
  return `PT-${String(Date.now()).slice(-5)}`;
}

/**
 * Clinical patient admission form — structured input for real patient data.
 * Validates required fields; shows WHO warning signs checklist.
 */
export default function PatientAdmissionForm({ onSubmit, loading }) {
  const [form, setForm] = useState({ ...DEFAULT_FORM, patient_id: generateId() });
  const [errors, setErrors] = useState({});
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [weatherStatus, setWeatherStatus] = useState(''); // '' | 'loading' | 'done' | 'error'

  // Auto-fetch real weather data on mount
  useEffect(() => {
    setWeatherStatus('loading');
    getWeatherLags()
      .then(data => {
        setForm(prev => ({
          ...prev,
          ...Object.fromEntries(
            Object.entries(data).map(([k, v]) => [k, String(v)])
          ),
        }));
        setWeatherStatus('done');
      })
      .catch(() => setWeatherStatus('error'));
  }, []);

  function set(field, value) {
    setForm(prev => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors(prev => { const e = {...prev}; delete e[field]; return e; });
  }

  function validate() {
    const e = {};
    if (!form.patient_id.trim()) e.patient_id = 'Required';
    if (!form.WBC || isNaN(form.WBC) || +form.WBC < 0 || +form.WBC > 20) e.WBC = '0–20 ×10³/μL';
    if (!form.Platelets || isNaN(form.Platelets) || +form.Platelets < 1 || +form.Platelets > 400)
      e.Platelets = '1–400 ×10³/μL';
    if (+form.Hematocrit < 20 || +form.Hematocrit > 65) e.Hematocrit = '20–65%';
    return e;
  }

  function handleSubmit(e) {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    const payload = {};
    for (const [k, v] of Object.entries(form)) {
      payload[k] = k === 'patient_id' ? v : parseFloat(v);
    }
    payload.patient_id = form.patient_id;
    onSubmit(payload);
    setForm({ ...DEFAULT_FORM, patient_id: generateId() });
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit} noValidate>
      {/* ── Identity ──────────────────────────────────────────────────── */}
      <div className={styles.sectionLabel}>Patient Identity</div>
      <div className={styles.row}>
        <Field label="Patient ID" error={errors.patient_id}>
          <input value={form.patient_id} onChange={e => set('patient_id', e.target.value)}
            placeholder="PT-00001" />
        </Field>
        <Field label="Day of Illness" hint="Since first symptom">
          <input type="number" min="1" max="14" value={form.day_of_illness}
            onChange={e => set('day_of_illness', e.target.value)} />
        </Field>
      </div>

      {/* ── Blood counts ──────────────────────────────────────────────── */}
      <div className={styles.sectionLabel}>Blood Counts</div>
      <div className={styles.row}>
        <Field label="WBC (×10³/μL)" error={errors.WBC} hint="Normal: 4–10">
          <input type="number" step="0.1" min="0" max="20" value={form.WBC}
            onChange={e => set('WBC', e.target.value)} placeholder="e.g. 3.5" />
        </Field>
        <Field label="Platelets (×10³/μL)" error={errors.Platelets} hint="Critical: &lt;20">
          <input type="number" step="1" min="1" max="400" value={form.Platelets}
            onChange={e => set('Platelets', e.target.value)} placeholder="e.g. 85" />
        </Field>
        <Field label="Hematocrit (%)" error={errors.Hematocrit} hint="↑20% from baseline = plasma leak">
          <input type="number" step="0.1" min="20" max="65" value={form.Hematocrit}
            onChange={e => set('Hematocrit', e.target.value)} />
        </Field>
        <Field label="NS1 Antigen Test">
          <select value={form.NS1_antigen} onChange={e => set('NS1_antigen', e.target.value)}>
            <option value="0">Negative</option>
            <option value="1">Positive</option>
          </select>
        </Field>
      </div>

      {/* ── Clinical markers ──────────────────────────────────────────── */}
      <div className={styles.sectionLabel}>Clinical Markers</div>
      <div className={styles.row}>
        <Field label="AST/ALT Ratio" hint=">2 = hepatic involvement">
          <input type="number" step="0.1" min="0.5" max="10" value={form.AST_ALT_ratio}
            onChange={e => set('AST_ALT_ratio', e.target.value)} />
        </Field>
        <Field label="Pulse Pressure (mmHg)" hint="&lt;20 = impending shock">
          <input type="number" step="1" min="5" max="80" value={form.pulse_pressure}
            onChange={e => set('pulse_pressure', e.target.value)} />
        </Field>
        <Field label="Warning Signs (0–5)" hint="Count of WHO criteria present">
          <input type="number" step="1" min="0" max="5" value={form.warning_signs}
            onChange={e => set('warning_signs', e.target.value)} />
        </Field>
      </div>

      {/* WHO Warning Signs checklist reference */}
      {+form.warning_signs > 0 && (
        <div className={styles.warnRef}>
          <span className={styles.warnTitle}>WHO Warning Signs:</span>
          abdominal pain · persistent vomiting · fluid accumulation · mucosal bleed ·
          lethargy/restlessness · liver ›2cm · rapid platelet drop + rising HCT
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
        <button type="button" className={styles.advToggle}
          onClick={() => setShowAdvanced(v => !v)}>
          {showAdvanced ? '\u25B2 Hide' : '\u25BC Show'} temperature &amp; rainfall lags
        </button>
        {weatherStatus === 'done' && (
          <span style={{ fontSize: 11, color: 'var(--mild)' }}>
            Real weather data loaded (Open-Meteo)
          </span>
        )}
        {weatherStatus === 'loading' && (
          <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>Fetching weather...</span>
        )}
      </div>

      {showAdvanced && (
        <div className={styles.lagsGrid}>
          {[1,2,3,4,5,6].map(i => (
            <Field key={`T${i}`} label={`Temp lag-${i} (°C)`}>
              <input type="number" step="0.1" value={form[`Temp_lag${i}`]}
                onChange={e => set(`Temp_lag${i}`, e.target.value)} />
            </Field>
          ))}
          {[1,2,3,4,5,6].map(i => (
            <Field key={`R${i}`} label={`Rain lag-${i} (mm)`}>
              <input type="number" step="1" value={form[`Rain_lag${i}`]}
                onChange={e => set(`Rain_lag${i}`, e.target.value)} />
            </Field>
          ))}
        </div>
      )}

      <button type="submit" className={`${styles.submitBtn} btn-primary`} disabled={loading}>
        {loading ? 'Running inference…' : '+ Admit Patient & Predict'}
      </button>
    </form>
  );
}

function Field({ label, children, error, hint }) {
  return (
    <div className={styles.field}>
      <label className={styles.fieldLabel}>
        {label}
        {hint && <span className={styles.hint}> · {hint}</span>}
      </label>
      {children}
      {error && <span className={styles.error}>{error}</span>}
    </div>
  );
}
