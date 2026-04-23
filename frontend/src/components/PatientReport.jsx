import { useState } from 'react';
import styles from './PatientReport.module.css';

/**
 * Generates a downloadable PDF clinical report for a patient.
 * Uses jspdf + jspdf-autotable (lazy-loaded on click).
 */
export default function PatientReport({ patient, history, forecast }) {
  const [generating, setGenerating] = useState(false);

  if (!patient) return null;

  async function generatePDF() {
    setGenerating(true);
    try {
      const { jsPDF } = await import('jspdf');
      await import('jspdf-autotable');

      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      let y = 20;

      // ── Header ────────────────────────────────────────────────────────────
      doc.setFillColor(10, 13, 20);
      doc.rect(0, 0, pageWidth, 40, 'F');
      doc.setTextColor(74, 158, 255);
      doc.setFontSize(22);
      doc.setFont('helvetica', 'bold');
      doc.text('D3T Clinical Report', 14, y);
      doc.setFontSize(10);
      doc.setTextColor(139, 141, 151);
      doc.text('Dynamic Dengue Digital Twin', 14, y + 8);
      doc.text(`Generated: ${new Date().toLocaleString()}`, 14, y + 14);
      y = 50;

      // ── Patient Info ──────────────────────────────────────────────────────
      doc.setTextColor(232, 233, 238);
      doc.setFillColor(20, 23, 32);
      doc.rect(0, y - 6, pageWidth, 30, 'F');
      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(232, 233, 238);
      doc.text(`Patient: ${patient.patient_id}`, 14, y + 4);

      const sevColor = {
        mild: [29, 158, 117],
        moderate: [232, 147, 58],
        severe: [226, 75, 74],
      }[patient.severity_label] || [136, 135, 128];

      doc.setFillColor(...sevColor);
      doc.roundedRect(pageWidth - 50, y - 4, 36, 14, 3, 3, 'F');
      doc.setFontSize(10);
      doc.setTextColor(255, 255, 255);
      doc.text(patient.severity_label.toUpperCase(), pageWidth - 47, y + 5);
      y = 82;

      // ── Severity Probabilities ────────────────────────────────────────────
      doc.setFontSize(13);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(74, 158, 255);
      doc.text('Severity Assessment', 14, y);
      y += 8;

      doc.autoTable({
        startY: y,
        head: [['Class', 'Probability', 'Status']],
        body: [
          ['Mild', `${((patient.PSOS?.mild ?? 0) * 100).toFixed(1)}%`,
            patient.severity_label === 'mild' ? 'PREDICTED' : ''],
          ['Moderate', `${((patient.PSOS?.moderate ?? 0) * 100).toFixed(1)}%`,
            patient.severity_label === 'moderate' ? 'PREDICTED' : ''],
          ['Severe', `${((patient.PSOS?.severe ?? 0) * 100).toFixed(1)}%`,
            patient.severity_label === 'severe' ? 'PREDICTED' : ''],
        ],
        theme: 'grid',
        headStyles: { fillColor: [20, 23, 32], textColor: [74, 158, 255], fontStyle: 'bold' },
        bodyStyles: { fillColor: [15, 17, 23], textColor: [232, 233, 238] },
        alternateRowStyles: { fillColor: [20, 23, 32] },
        styles: { fontSize: 10, cellPadding: 4 },
        margin: { left: 14, right: 14 },
      });
      y = doc.lastAutoTable.finalY + 12;

      // ── Clinical Values ───────────────────────────────────────────────────
      if (patient.inputs) {
        doc.setFontSize(13);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(74, 158, 255);
        doc.text('Clinical Values at Admission', 14, y);
        y += 8;

        const inp = patient.inputs;
        doc.autoTable({
          startY: y,
          head: [['Parameter', 'Value', 'Reference Range']],
          body: [
            ['WBC (x10\u00B3/\u03BCL)', inp.WBC ?? '-', '4.0 - 10.0'],
            ['Platelets (x10\u00B3/\u03BCL)', inp.Platelets ?? '-', '150 - 400'],
            ['Hematocrit (%)', inp.Hematocrit ?? '-', '36 - 48'],
            ['NS1 Antigen', inp.NS1_antigen === 1 ? 'Positive' : 'Negative', '-'],
            ['AST/ALT Ratio', inp.AST_ALT_ratio ?? '-', '< 2.0'],
            ['Pulse Pressure (mmHg)', inp.pulse_pressure ?? '-', '> 20'],
            ['Warning Signs', inp.warning_signs ?? '-', '0'],
            ['Day of Illness', inp.day_of_illness ?? '-', '-'],
          ],
          theme: 'grid',
          headStyles: { fillColor: [20, 23, 32], textColor: [74, 158, 255], fontStyle: 'bold' },
          bodyStyles: { fillColor: [15, 17, 23], textColor: [232, 233, 238] },
          alternateRowStyles: { fillColor: [20, 23, 32] },
          styles: { fontSize: 10, cellPadding: 4 },
          margin: { left: 14, right: 14 },
        });
        y = doc.lastAutoTable.finalY + 12;
      }

      // ── EKF State ─────────────────────────────────────────────────────────
      if (patient.ekf_state) {
        doc.setFontSize(13);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(74, 158, 255);
        doc.text('Kalman Filter State (EKF)', 14, y);
        y += 8;

        doc.autoTable({
          startY: y,
          head: [['Parameter', 'Value']],
          body: [
            ['Platelet Trend', `${patient.ekf_state.platelet_trend?.toFixed(2) ?? '-'} /day`],
            ['WBC Trend', `${patient.ekf_state.WBC_trend?.toFixed(2) ?? '-'} /day`],
            ['Days Tracked', `${patient.ekf_state.days_tracked?.toFixed(0) ?? '-'}`],
          ],
          theme: 'grid',
          headStyles: { fillColor: [20, 23, 32], textColor: [74, 158, 255], fontStyle: 'bold' },
          bodyStyles: { fillColor: [15, 17, 23], textColor: [232, 233, 238] },
          alternateRowStyles: { fillColor: [20, 23, 32] },
          styles: { fontSize: 10, cellPadding: 4 },
          margin: { left: 14, right: 14 },
        });
        y = doc.lastAutoTable.finalY + 12;
      }

      // ── SHAP Explanation ──────────────────────────────────────────────────
      if (patient.shap?.length) {
        if (y > 230) { doc.addPage(); y = 20; }

        doc.setFontSize(13);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(74, 158, 255);
        doc.text('AI Explanation (SHAP Feature Attribution)', 14, y);
        y += 8;

        doc.autoTable({
          startY: y,
          head: [['Feature', 'Value', 'SHAP Contribution', 'Direction']],
          body: patient.shap.map(s => [
            s.feature,
            typeof s.value === 'number' ? s.value.toFixed(2) : s.value,
            s.shap.toFixed(4),
            s.shap > 0 ? 'Increases risk' : 'Decreases risk',
          ]),
          theme: 'grid',
          headStyles: { fillColor: [20, 23, 32], textColor: [74, 158, 255], fontStyle: 'bold' },
          bodyStyles: { fillColor: [15, 17, 23], textColor: [232, 233, 238] },
          alternateRowStyles: { fillColor: [20, 23, 32] },
          styles: { fontSize: 10, cellPadding: 4 },
          margin: { left: 14, right: 14 },
        });
        y = doc.lastAutoTable.finalY + 12;
      }

      // ── 7-Day Forecast Summary ────────────────────────────────────────────
      if (forecast?.days) {
        if (y > 200) { doc.addPage(); y = 20; }

        doc.setFontSize(13);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(74, 158, 255);
        doc.text('7-Day Severity Forecast', 14, y);
        y += 8;

        doc.autoTable({
          startY: y,
          head: [['Day', 'P(Severe) Low', 'P(Severe) Median', 'P(Severe) High']],
          body: forecast.days.map((day, i) => [
            `Day +${day}`,
            `${(forecast.p_severe_p5[i] * 100).toFixed(1)}%`,
            `${(forecast.p_severe_p50[i] * 100).toFixed(1)}%`,
            `${(forecast.p_severe_p95[i] * 100).toFixed(1)}%`,
          ]),
          theme: 'grid',
          headStyles: { fillColor: [20, 23, 32], textColor: [74, 158, 255], fontStyle: 'bold' },
          bodyStyles: { fillColor: [15, 17, 23], textColor: [232, 233, 238] },
          alternateRowStyles: { fillColor: [20, 23, 32] },
          styles: { fontSize: 10, cellPadding: 4 },
          margin: { left: 14, right: 14 },
        });
        y = doc.lastAutoTable.finalY + 12;
      }

      // ── Footer ────────────────────────────────────────────────────────────
      const pageCount = doc.internal.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(139, 141, 151);
        doc.text(
          `D3T Clinical Report | ${patient.patient_id} | Page ${i} of ${pageCount}`,
          pageWidth / 2, doc.internal.pageSize.getHeight() - 10,
          { align: 'center' }
        );
      }

      doc.save(`D3T_Report_${patient.patient_id}_${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch (err) {
      console.error('PDF generation failed:', err);
    } finally {
      setGenerating(false);
    }
  }

  return (
    <button
      className={styles.reportBtn}
      onClick={generatePDF}
      disabled={generating}
      title="Download clinical report as PDF"
    >
      {generating ? 'Generating...' : 'Export PDF Report'}
    </button>
  );
}
