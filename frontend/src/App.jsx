import { useEffect, useRef, useState, useCallback } from 'react';
import Dashboard from './components/Dashboard.jsx';
import { WS_URL } from './api/client.js';

/**
 * Root application component.
 *
 * Global state:
 *   patients       – array of the latest prediction result per patient
 *   patientHistory – { patientId: [{day, mild, moderate, severe}, …] }
 *   driftAlerts    – array of WebSocket drift/retrain events
 *   seir           – most recent SEIR particle-filter stats
 *
 * WebSocket is managed with a useRef to avoid triggering re-renders on
 * connect/disconnect and to ensure a stable reconnect reference.
 */
export default function App() {
  const [patients,       setPatients]       = useState([]);
  const [patientHistory, setPatientHistory] = useState({});
  const [driftAlerts,    setDriftAlerts]    = useState([]);
  const [seir,           setSeir]           = useState({});
  const wsRef = useRef(null);

  // ── WebSocket connection ────────────────────────────────────────────────
  useEffect(() => {
    function connect() {
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          if (msg.type === 'drift' || msg.type === 'retrain') {
            setDriftAlerts(prev => [msg, ...prev].slice(0, 20)); // cap at 20
          }
        } catch { /* ignore malformed frames */ }
      };

      ws.onclose = () => {
        // Reconnect after 3 s if not intentionally closed
        setTimeout(connect, 3000);
      };

      // Send periodic keepalive pings
      ws.onopen = () => {
        const ping = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) ws.send('ping');
          else clearInterval(ping);
        }, 25000);
      };
    }

    connect();
    return () => wsRef.current?.close();
  }, []);

  // ── Callback: new prediction result ────────────────────────────────────
  const handleNewPatient = useCallback((result, dayOfIllness) => {
    setPatients(prev => {
      const exists = prev.findIndex(p => p.patient_id === result.patient_id);
      if (exists >= 0) {
        const next = [...prev];
        next[exists] = result;
        return next;
      }
      return [result, ...prev];
    });

    setPatientHistory(prev => {
      const existing = prev[result.patient_id] ?? [];
      const newPoint = {
        day:      dayOfIllness,
        mild:     result.PSOS.mild,
        moderate: result.PSOS.moderate,
        severe:   result.PSOS.severe,
      };
      return {
        ...prev,
        [result.patient_id]: [...existing, newPoint],
      };
    });
  }, []);

  // ── Callback: SEIR update ──────────────────────────────────────────────
  const handleSeirUpdate = useCallback((stats) => {
    setSeir(stats);
  }, []);

  return (
    <Dashboard
      patients={patients}
      patientHistory={patientHistory}
      driftAlerts={driftAlerts}
      seir={seir}
      onNewPatient={handleNewPatient}
      onSeirUpdate={handleSeirUpdate}
    />
  );
}
