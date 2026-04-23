import { useState, useEffect, useCallback } from 'react';
import styles from './GuidedTour.module.css';

const STEPS = [
  {
    target: '[data-tour="sidebar"]',
    title: 'Patient List',
    content: 'All admitted patients appear here. Click any patient to view their digital twin and clinical analysis.',
    position: 'right',
  },
  {
    target: '[data-tour="admit-btn"]',
    title: 'Admit a Patient',
    content: 'Click here to enter clinical values (WBC, Platelets, Hematocrit, etc.) and run AI inference to predict severity.',
    position: 'right',
  },
  {
    target: '[data-tour="twin-pane"]',
    title: 'Animated Human Twin',
    content: 'The living digital twin reacts to clinical values in real-time — skin color changes with fever, petechiae appear as platelets drop, heart rate responds to pulse pressure.',
    position: 'left',
  },
  {
    target: '[data-tour="detail-pane"]',
    title: 'Clinical Analysis',
    content: 'View 7-day severity forecasts, patient trajectory, treatment simulations, and SHAP explainability for each patient.',
    position: 'left',
  },
  {
    target: '[data-tour="demo-bar"]',
    title: 'Demo Scenarios',
    content: 'Run pre-scripted clinical scenarios: patient deterioration, treatment response, outbreak surge, and drift detection + auto-retraining.',
    position: 'bottom',
  },
  {
    target: '[data-tour="tabs"]',
    title: 'Dashboard Tabs',
    content: 'Switch between Patient view, Hospital Command Centre (severity census, ICU demand), and Model Metrics (accuracy, calibration, confusion matrix).',
    position: 'bottom',
  },
];

export default function GuidedTour({ active, onClose }) {
  const [step, setStep] = useState(0);
  const [highlight, setHighlight] = useState(null);

  const updateHighlight = useCallback(() => {
    const target = document.querySelector(STEPS[step]?.target);
    if (target) {
      const rect = target.getBoundingClientRect();
      setHighlight({
        top: rect.top - 6,
        left: rect.left - 6,
        width: rect.width + 12,
        height: rect.height + 12,
      });
    } else {
      setHighlight(null);
    }
  }, [step]);

  useEffect(() => {
    if (!active) return;
    updateHighlight();
    window.addEventListener('resize', updateHighlight);
    return () => window.removeEventListener('resize', updateHighlight);
  }, [active, step, updateHighlight]);

  if (!active) return null;

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  // Position tooltip relative to highlight
  let tooltipStyle = {};
  if (highlight) {
    switch (current.position) {
      case 'right':
        tooltipStyle = {
          top: highlight.top + highlight.height / 2,
          left: highlight.left + highlight.width + 16,
          transform: 'translateY(-50%)',
        };
        break;
      case 'left':
        tooltipStyle = {
          top: highlight.top + highlight.height / 2,
          right: window.innerWidth - highlight.left + 16,
          transform: 'translateY(-50%)',
        };
        break;
      case 'bottom':
        tooltipStyle = {
          top: highlight.top + highlight.height + 16,
          left: highlight.left + highlight.width / 2,
          transform: 'translateX(-50%)',
        };
        break;
      default:
        tooltipStyle = {
          top: highlight.top - 16,
          left: highlight.left + highlight.width / 2,
          transform: 'translate(-50%, -100%)',
        };
    }
  }

  return (
    <div className={styles.overlay}>
      {/* Spotlight cutout */}
      {highlight && (
        <div
          className={styles.spotlight}
          style={{
            top: highlight.top,
            left: highlight.left,
            width: highlight.width,
            height: highlight.height,
          }}
        />
      )}

      {/* Tooltip */}
      <div className={styles.tooltip} style={tooltipStyle}>
        <div className={styles.tooltipHeader}>
          <span className={styles.stepCounter}>{step + 1}/{STEPS.length}</span>
          <h3 className={styles.tooltipTitle}>{current.title}</h3>
          <button className={styles.closeBtn} onClick={onClose}>&#10005;</button>
        </div>
        <p className={styles.tooltipContent}>{current.content}</p>
        <div className={styles.tooltipActions}>
          {step > 0 && (
            <button className={styles.backBtn} onClick={() => setStep(s => s - 1)}>
              Back
            </button>
          )}
          <button
            className={styles.nextBtn}
            onClick={() => isLast ? onClose() : setStep(s => s + 1)}
          >
            {isLast ? 'Finish Tour' : 'Next'}
          </button>
        </div>
        {/* Progress dots */}
        <div className={styles.dots}>
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={`${styles.dot} ${i === step ? styles.dotActive : ''} ${i < step ? styles.dotDone : ''}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
