import { useState, useEffect } from 'react';
import styles from './RoleSelector.module.css';

export const ROLES = {
  doctor: {
    label: 'Doctor',
    icon: '\u{1FA7A}',
    desc: 'Patient detail, digital twin, treatment simulation',
    tabs: ['Patients'],
    defaultTab: 'Patients',
  },
  admin: {
    label: 'Hospital Admin',
    icon: '\u{1F3E5}',
    desc: 'Severity census, ICU demand, risk queue',
    tabs: ['Patients', 'Hospital'],
    defaultTab: 'Hospital',
  },
  epidemiologist: {
    label: 'Epidemiologist',
    icon: '\u{1F310}',
    desc: 'SEIR model, outbreak level, model metrics',
    tabs: ['Patients', 'Hospital', 'Model Metrics'],
    defaultTab: 'Patients',
  },
  all: {
    label: 'Full Access',
    icon: '\u{1F511}',
    desc: 'All tabs and features',
    tabs: ['Patients', 'Hospital', 'Model Metrics'],
    defaultTab: 'Patients',
  },
};

export default function RoleSelector({ role, onRoleChange }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function close(e) {
      if (!e.target.closest(`.${styles.wrap}`)) setOpen(false);
    }
    if (open) document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [open]);

  const current = ROLES[role];

  return (
    <div className={styles.wrap}>
      <button
        className={styles.trigger}
        onClick={() => setOpen(o => !o)}
        title={`Role: ${current.label}`}
      >
        <span>{current.icon}</span>
        <span className={styles.roleLabel}>{current.label}</span>
        <span className={styles.arrow}>{open ? '\u25B2' : '\u25BC'}</span>
      </button>

      {open && (
        <div className={styles.dropdown}>
          {Object.entries(ROLES).map(([key, r]) => (
            <button
              key={key}
              className={`${styles.option} ${key === role ? styles.active : ''}`}
              onClick={() => { onRoleChange(key); setOpen(false); }}
            >
              <span className={styles.optIcon}>{r.icon}</span>
              <div>
                <div className={styles.optLabel}>{r.label}</div>
                <div className={styles.optDesc}>{r.desc}</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
