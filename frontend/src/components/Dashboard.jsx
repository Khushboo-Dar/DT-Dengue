import { useState } from 'react';
import DriftAlertBanner   from './DriftAlertBanner.jsx';
import PatientCard        from './PatientCard.jsx';
import TrajectoryChart    from './TrajectoryChart.jsx';
import CounterfactualPanel from './CounterfactualPanel.jsx';
import SEIRStatus         from './SEIRStatus.jsx';
import { predict }        from '../api/client.js';
import styles             from './Dashboard.module.css';

function randomRange(min, max, decimals = 1) {
  return parseFloat((Math.random() * (max - min) + min).toFixed(decimals));
}

function generateTestPatient() {
  const id = `P-${String(Date.now()).slice(-6)}`;
  return {
    patient_id:    id,
    day_of_illness: Math.floor(Math.random() * 6) + 1,
    WBC:            randomRange(2, 12),
    Platelets:      randomRange(20, 270, 0),
    Temp_lag1: randomRange(36, 40), Temp_lag2: randomRange(36, 40),
    Temp_lag3: randomRange(36, 40), Temp_lag4: randomRange(36, 40),
    Temp_lag5: randomRange(36, 40), Temp_lag6: randomRange(36, 40),
    Rain_lag1: randomRange(0, 150, 0), Rain_lag2: randomRange(0, 150, 0),
    Rain_lag3: randomRange(0, 150, 0), Rain_lag4: randomRange(0, 150, 0),
    Rain_lag5: randomRange(0, 150, 0), Rain_lag6: randomRange(0, 150, 0),
  };
}

/**
 * Master two-column dashboard.
 * Left : DriftAlertBanner + scrollable patient list + SEIRStatus
 * Right: TrajectoryChart + CounterfactualPanel for selected patient
 */
export default function Dashboard({ patients, patientHistory, driftAlerts, seir, onNewPatient, onSeirUpdate }) {
  const [selectedId, setSelectedId] = useState(null);
  const [adding,     setAdding]     = useState(false);
  const [addError,   setAddError]   = useState('');

  const selected = patients.find(p => p.patient_id === selectedId);

  async function handleAddPatient() {
    setAdding(true);
    setAddError('');
    try {
      const payload = generateTestPatient();
      const result  = await predict(payload);
      onNewPatient(result, payload.day_of_illness);
      setSelectedId(result.patient_id);
    } catch (e) {
      setAddError('Could not reach backend — is the server running?');
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className={styles.root}>
      {/* Full-width alert banner */}
      <div className={styles.bannerRow}>
        <DriftAlertBanner alerts={driftAlerts} />
      </div>

      <div className={styles.grid}>
        {/* ── Left column ─────────────────────────────────── */}
        <aside className={styles.sidebar}>
          <div className={styles.sideHeader}>
            <h2>Patients ({patients.length})</h2>
            <button
              className={styles.addBtn}
              onClick={handleAddPatient}
              disabled={adding}
            >
              {adding ? '…' : '+ Add Test Patient'}
            </button>
          </div>

          {addError && <p className={styles.addErr}>{addError}</p>}

          <div className={styles.patientList}>
            {patients.length === 0 && (
              <p className={styles.empty}>
                No patients yet. Click "Add Test Patient" to begin.
              </p>
            )}
            {patients.map(p => (
              <PatientCard
                key={p.patient_id}
                patient={p}
                selected={p.patient_id === selectedId}
                onClick={() => setSelectedId(
                  p.patient_id === selectedId ? null : p.patient_id
                )}
              />
            ))}
          </div>

          <SEIRStatus seir={seir} onUpdate={onSeirUpdate} />
        </aside>

        {/* ── Right column ────────────────────────────────── */}
        <main className={styles.detail}>
          {!selected ? (
            <div className={styles.placeholder}>
              <p>Select a patient to view their trajectory and treatment simulations.</p>
            </div>
          ) : (
            <>
              <div className={styles.detailHeader}>
                <h2>{selected.patient_id}</h2>
                <span
                  className={styles.sevPill}
                  style={{ background: `var(--${selected.severity_label})` }}
                >
                  {selected.severity_label}
                </span>
                <span className={styles.meta}>
                  Day {selected.ekf_state?.days_tracked?.toFixed(0) ?? '?'} &bull;{' '}
                  {selected.inference_ms}ms inference
                </span>
              </div>

              <TrajectoryChart history={patientHistory[selectedId] ?? []} />
              <CounterfactualPanel patientId={selectedId} />
            </>
          )}
        </main>
      </div>
    </div>
  );
}
