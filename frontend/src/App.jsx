import { useEffect, useRef, useState, useCallback } from 'react';
import Dashboard from './components/Dashboard.jsx';
import LandingPage from './components/LandingPage.jsx';
import { WS_URL } from './api/client.js';

export default function App() {
  const [showDashboard, setShowDashboard] = useState(false);
  const [patients,        setPatients]        = useState([]);
  const [patientHistory,  setPatientHistory]  = useState({});
  const [patientForecasts,setPatientForecasts]= useState({});
  const [driftAlerts,     setDriftAlerts]     = useState([]);
  const [seir,            setSeir]            = useState({});
  const [hospitalData,    setHospitalData]    = useState(null);
  const wsRef = useRef(null);

  // ── WebSocket ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!showDashboard) return;

    function connect() {
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          if (msg.type === 'drift' || msg.type === 'retrain') {
            setDriftAlerts(prev => [msg, ...prev].slice(0, 20));
          }
        } catch { /* ignore malformed frames */ }
      };

      ws.onclose = () => setTimeout(connect, 3000);

      ws.onopen = () => {
        const ping = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) ws.send('ping');
          else clearInterval(ping);
        }, 25000);
      };
    }

    connect();
    return () => wsRef.current?.close();
  }, [showDashboard]);

  // ── Callback: new prediction result ──────────────────────────────────────
  const handleNewPatient = useCallback((result, dayOfIllness, formPayload) => {
    const entry = { ...result, inputs: formPayload ?? null, dayOfIllness };
    setPatients(prev => {
      const exists = prev.findIndex(p => p.patient_id === result.patient_id);
      if (exists >= 0) {
        const next = [...prev];
        next[exists] = entry;
        return next;
      }
      return [entry, ...prev];
    });

    setPatientHistory(prev => {
      const existing = prev[result.patient_id] ?? [];
      return {
        ...prev,
        [result.patient_id]: [
          ...existing,
          {
            day:      dayOfIllness,
            mild:     result.PSOS.mild,
            moderate: result.PSOS.moderate,
            severe:   result.PSOS.severe,
          },
        ],
      };
    });
  }, []);

  // ── Callback: forecast updated ───────────────────────────────────────────
  const handleForecastUpdate = useCallback((patientId, forecastData) => {
    setPatientForecasts(prev => ({ ...prev, [patientId]: forecastData }));
  }, []);

  // ── Callback: SEIR update ────────────────────────────────────────────────
  const handleSeirUpdate = useCallback((stats) => {
    setSeir(stats);
  }, []);

  // ── Callback: hospital data update ──────────────────────────────────────
  const handleHospitalUpdate = useCallback((data) => {
    setHospitalData(data);
  }, []);

  if (!showDashboard) {
    return <LandingPage onEnter={() => setShowDashboard(true)} />;
  }

  return (
    <Dashboard
      patients={patients}
      patientHistory={patientHistory}
      patientForecasts={patientForecasts}
      driftAlerts={driftAlerts}
      seir={seir}
      hospitalData={hospitalData}
      onNewPatient={handleNewPatient}
      onForecastUpdate={handleForecastUpdate}
      onSeirUpdate={handleSeirUpdate}
      onHospitalUpdate={handleHospitalUpdate}
    />
  );
}
