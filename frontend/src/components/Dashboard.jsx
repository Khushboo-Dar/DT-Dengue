import { useState, useCallback, useEffect, useRef } from 'react';
import DriftAlertBanner     from './DriftAlertBanner.jsx';
import PatientCard          from './PatientCard.jsx';
import TrajectoryChart      from './TrajectoryChart.jsx';
import CounterfactualPanel  from './CounterfactualPanel.jsx';
import SEIRStatus           from './SEIRStatus.jsx';
import ForecastChart        from './ForecastChart.jsx';
import SHAPChart            from './SHAPChart.jsx';
import HospitalPanel        from './HospitalPanel.jsx';
import MetricsPanel         from './MetricsPanel.jsx';
import PatientAdmissionForm from './PatientAdmissionForm.jsx';
import HumanTwin            from './HumanTwin.jsx';
import GuidedTour           from './GuidedTour.jsx';
import ThemeToggle          from './ThemeToggle.jsx';
import LanguageSelector     from './LanguageSelector.jsx';
import RoleSelector, { ROLES } from './RoleSelector.jsx';
import { useLanguage }      from '../i18n/LanguageContext.jsx';
import PatientReport        from './PatientReport.jsx';
import PatientTimeline      from './PatientTimeline.jsx';
import { predict, runDemoScenario } from '../api/client.js';
import styles from './Dashboard.module.css';

const TAB_KEYS = [
  { key: 'Patients', i18n: 'dash.patients' },
  { key: 'Hospital', i18n: 'dash.hospital' },
  { key: 'Model Metrics', i18n: 'dash.metrics' },
];

function DemoScenarioBar({ onDemoRun }) {
  const [running, setRunning] = useState(null);
  const SCENARIOS = [
    { id: 'classic_deterioration', label: 'Deterioration', color: '#E24B4A' },
    { id: 'treatment_response',    label: 'Treatment',     color: '#1D9E75' },
    { id: 'outbreak_surge',        label: 'Outbreak Surge',color: '#E8933A' },
    { id: 'drift_retrain',         label: 'Drift+Retrain', color: '#c579e8' },
  ];

  async function run(id) {
    setRunning(id);
    try {
      const result = await runDemoScenario(id);
      onDemoRun(result);
    } catch (e) {
      console.error('Demo failed', e);
    } finally {
      setRunning(null);
    }
  }

  return (
    <div className={styles.demoBar}>
      <span className={styles.demoLabel}>Demo</span>
      {SCENARIOS.map(s => (
        <button
          key={s.id}
          className={styles.demoBtn}
          style={{ borderColor: s.color, color: running === s.id ? s.color : 'var(--text-dim)' }}
          onClick={() => run(s.id)}
          disabled={!!running}
        >
          {running === s.id ? '●' : '▶'} {s.label}
        </button>
      ))}
    </div>
  );
}

export default function Dashboard({
  patients, patientHistory, patientForecasts,
  driftAlerts, seir, hospitalData,
  onNewPatient, onForecastUpdate, onSeirUpdate, onHospitalUpdate,
}) {
  const [activeTab,   setActiveTab]   = useState('Patients');
  const [selectedId,  setSelectedId]  = useState(null);
  const [showForm,    setShowForm]    = useState(false);
  const [adding,      setAdding]      = useState(false);
  const [addError,    setAddError]    = useState('');
  const [detailTab,   setDetailTab]   = useState('forecast'); // 'forecast' | 'trajectory' | 'cf' | 'shap'
  const [autoLoading, setAutoLoading] = useState(false);
  const [showTour,    setShowTour]    = useState(false);
  const [role,        setRole]        = useState('all');
  const autoLoadedRef = useRef(false);
  const { t } = useLanguage();

  const visibleTabs = TAB_KEYS.filter(tab => ROLES[role].tabs.includes(tab.key));

  const selected = patients.find(p => p.patient_id === selectedId);

  // ── Auto-load demo data on first mount ──────────────────────────────────
  useEffect(() => {
    if (autoLoadedRef.current || patients.length > 0) return;
    autoLoadedRef.current = true;
    setAutoLoading(true);

    (async () => {
      try {
        // Run the deterioration demo to get a patient with history
        const det = await runDemoScenario('classic_deterioration');
        det.results.forEach(r => onNewPatient(r, r.ekf_state?.days_tracked ?? 3, null));

        // Run outbreak surge for 3 more patients
        const outbreak = await runDemoScenario('outbreak_surge');
        outbreak.results.forEach(r => onNewPatient(r, r.ekf_state?.days_tracked ?? 3, null));

        // Select the first patient
        if (det.results.length) setSelectedId(det.results[det.results.length - 1].patient_id);
      } catch {
        // Backend not ready — user can manually admit patients
      } finally {
        setAutoLoading(false);
      }
    })();
  }, []);

  async function handleAdmit(payload) {
    setAdding(true);
    setAddError('');
    try {
      const result = await predict(payload);
      onNewPatient(result, payload.day_of_illness, payload);
      setSelectedId(result.patient_id);
      setShowForm(false);
    } catch (e) {
      setAddError('Could not reach backend — is the server running?');
    } finally {
      setAdding(false);
    }
  }

  function handleDemoRun(result) {
    result.results.forEach((r, i) => {
      onNewPatient(r, result.results[i]?.PSOS ? 3 : 3, null);
    });
    if (result.results.length) {
      setSelectedId(result.results[0].patient_id);
    }
  }

  return (
    <div className={styles.root}>
      {/* ── Top bar ──────────────────────────────────────────────────────── */}
      <header className={styles.topbar}>
        <div className={styles.brand}>
          <span className={styles.brandIcon}>⬡</span>
          <span className={styles.brandName}>D3T</span>
          <span className={styles.brandSub}>Dynamic Dengue Digital Twin</span>
        </div>
        <div data-tour="demo-bar"><DemoScenarioBar onDemoRun={handleDemoRun} /></div>
        <RoleSelector role={role} onRoleChange={(r) => { setRole(r); setActiveTab(ROLES[r].defaultTab); }} />
        <LanguageSelector />
        <ThemeToggle />
        <button className={styles.tourBtn} onClick={() => setShowTour(true)} title="Guided Tour">?</button>
        <div className={styles.tabRow} data-tour="tabs">
          {visibleTabs.map(tab => (
            <button
              key={tab.key}
              className={`${styles.tab} ${activeTab === tab.key ? styles.tabActive : ''}`}
              onClick={() => setActiveTab(tab.key)}
            >
              {t(tab.i18n)}
            </button>
          ))}
        </div>
      </header>

      {/* ── Drift alert ──────────────────────────────────────────────────── */}
      <DriftAlertBanner alerts={driftAlerts} />

      {/* ══ TAB: Patients ══════════════════════════════════════════════════ */}
      {activeTab === 'Patients' && (
        <div className={styles.patientsLayout}>
          {/* ── Col 1: Sidebar ─────────────────────────────────────────── */}
          <aside className={styles.sidebar} data-tour="sidebar">
            <div className={styles.sideHeader}>
              <h2>Patients <span className={styles.count}>{patients.length}</span></h2>
              <button
                className={`${styles.admitBtn} btn-primary`}
                data-tour="admit-btn"
                onClick={() => setShowForm(true)}
              >
                {t('dash.admit')}
              </button>
            </div>

            {patients.length === 0 && (
              <p className={styles.empty}>
                {autoLoading ? t('dash.loading') : t('dash.empty')}
              </p>
            )}

            <div className={styles.patientList}>
              {patients.map(p => (
                <PatientCard
                  key={p.patient_id}
                  patient={p}
                  selected={p.patient_id === selectedId}
                  onClick={() => setSelectedId(id => id === p.patient_id ? null : p.patient_id)}
                />
              ))}
            </div>

            <SEIRStatus seir={seir} onUpdate={onSeirUpdate} />
          </aside>

          {/* ── Col 2: Animated Human Twin ─────────────────────────────── */}
          <div className={styles.twinPane} data-tour="twin-pane">
            <HumanTwin patient={selected ?? null} />
          </div>

          {/* ── Col 3: Charts / Details ────────────────────────────────── */}
          <main className={styles.detail} data-tour="detail-pane">
            {!selected ? (
              <div className={styles.placeholder}>
                <div className={styles.placeholderIcon}>⬡</div>
                <p>{t('dash.selectPatient')}</p>
                <p className={styles.placeholderSub}>{t('dash.selectSub')}</p>
              </div>
            ) : (
              <div className="fade-in">
                {/* Patient header */}
                <div className={styles.detailHeader}>
                  <div className={styles.detailLeft}>
                    <h1>{selected.patient_id}</h1>
                    <span className={`sev-chip ${selected.severity_label}`}>
                      {selected.severity_label}
                    </span>
                    {selected.drift_alert && (
                      <span className={styles.driftChip}>⚠ Drift</span>
                    )}
                  </div>
                  <div className={styles.detailMeta}>
                    <MetaChip label="Day" value={selected.ekf_state?.days_tracked?.toFixed(0) ?? '?'} />
                    <MetaChip label="P(sv)" value={`${((selected.PSOS?.severe??0)*100).toFixed(1)}%`}
                      color={selected.PSOS?.severe > 0.5 ? 'var(--severe)' :
                             selected.PSOS?.severe > 0.3 ? 'var(--moderate)' : 'var(--mild)'} />
                    <MetaChip label="Inference" value={`${selected.inference_ms}ms`} />
                    <PatientReport
                      patient={selected}
                      history={patientHistory[selectedId]}
                      forecast={patientForecasts[selectedId]}
                    />
                  </div>
                </div>

                {/* Inner tab bar */}
                <div className={styles.innerTabs}>
                  {[
                    ['forecast',    t('tab.forecast')],
                    ['timeline',    t('tab.timeline')],
                    ['trajectory',  t('tab.trajectory')],
                    ['cf',          t('tab.treatment')],
                    ['shap',        t('tab.shap')],
                  ].map(([key, label]) => (
                    <button
                      key={key}
                      className={`${styles.innerTab} ${detailTab === key ? styles.innerTabActive : ''}`}
                      onClick={() => setDetailTab(key)}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {detailTab === 'forecast' && (
                  <ForecastChart
                    patientId={selectedId}
                    forecast={patientForecasts[selectedId]}
                    onForecastLoaded={onForecastUpdate}
                  />
                )}
                {detailTab === 'timeline' && (
                  <PatientTimeline
                    history={patientHistory[selectedId] ?? []}
                    patient={selected}
                  />
                )}
                {detailTab === 'trajectory' && (
                  <TrajectoryChart history={patientHistory[selectedId] ?? []} />
                )}
                {detailTab === 'cf' && (
                  <CounterfactualPanel patientId={selectedId} />
                )}
                {detailTab === 'shap' && (
                  <SHAPChart
                    shap={selected.shap}
                    severityLabel={selected.severity_label}
                  />
                )}
              </div>
            )}
          </main>
        </div>
      )}

      {/* ══ TAB: Hospital ══════════════════════════════════════════════════ */}
      {activeTab === 'Hospital' && (
        <div className={styles.singlePane}>
          <HospitalPanel onUpdate={onHospitalUpdate} />
        </div>
      )}

      {/* ══ TAB: Model Metrics ═════════════════════════════════════════════ */}
      {activeTab === 'Model Metrics' && (
        <div className={styles.singlePane}>
          <MetricsPanel />
        </div>
      )}

      {/* ══ Patient Admission Modal ═════════════════════════════════════════ */}
      {showForm && (
        <div className={styles.modalOverlay} onClick={() => setShowForm(false)}>
          <div className={`${styles.modal} fade-in`} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div>
                <h2>{t('form.title')}</h2>
                <p className={styles.modalSub}>{t('form.subtitle')}</p>
              </div>
              <button className={styles.modalClose} onClick={() => setShowForm(false)}>✕</button>
            </div>
            <div className={styles.modalBody}>
              <PatientAdmissionForm onSubmit={handleAdmit} loading={adding} />
              {addError && <p className={styles.addErr}>{addError}</p>}
            </div>
          </div>
        </div>
      )}

      <GuidedTour active={showTour} onClose={() => setShowTour(false)} />
    </div>
  );
}

function MetaChip({ label, value, color }) {
  return (
    <div className={styles.metaChip}>
      <span className={styles.metaLabel}>{label}</span>
      <span className={styles.metaValue} style={color ? { color } : {}}>{value}</span>
    </div>
  );
}
