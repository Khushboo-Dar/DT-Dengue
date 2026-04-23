export const LANGUAGES = {
  en: { label: 'EN', name: 'English' },
  ms: { label: 'BM', name: 'Bahasa Melayu' },
  es: { label: 'ES', name: 'Español' },
};

const translations = {
  en: {
    // Landing
    'landing.badge': 'Clinical Decision Support System',
    'landing.subtitle': 'Dynamic Dengue Digital Twin',
    'landing.tagline': 'Real-time AI-powered clinical monitoring that creates a living digital copy of each dengue patient — predicting deterioration before it happens, explaining why, and simulating treatment outcomes.',
    'landing.enter': 'Enter Dashboard',
    'landing.footer': 'Built with FastAPI + XGBoost + SHAP + React · WHO 2009 Dengue Classification',

    // Dashboard
    'dash.patients': 'Patients',
    'dash.hospital': 'Hospital',
    'dash.metrics': 'Model Metrics',
    'dash.admit': '+ Admit Patient',
    'dash.empty': 'Click "Admit Patient" or run a demo scenario to begin.',
    'dash.loading': 'Loading demo patients...',
    'dash.selectPatient': 'Select a patient to view charts & analysis.',
    'dash.selectSub': '7-day forecast · Treatment simulation · SHAP explainability',

    // Detail tabs
    'tab.forecast': '7-Day Forecast',
    'tab.timeline': 'Timeline',
    'tab.trajectory': 'Trajectory',
    'tab.treatment': 'Treatment Sim',
    'tab.shap': 'SHAP Why?',

    // Severity
    'sev.mild': 'Mild',
    'sev.moderate': 'Moderate',
    'sev.severe': 'Severe',

    // Form
    'form.title': 'Admit New Patient',
    'form.subtitle': 'Enter clinical values — press Run Inference to predict severity',
    'form.patientId': 'Patient Identity',
    'form.bloodCounts': 'Blood Counts',
    'form.clinical': 'Clinical Markers',
    'form.submit': '+ Admit Patient & Predict',
    'form.running': 'Running inference…',

    // Report
    'report.export': 'Export PDF Report',
    'report.generating': 'Generating...',
  },

  ms: {
    'landing.badge': 'Sistem Sokongan Keputusan Klinikal',
    'landing.subtitle': 'Kembar Digital Denggi Dinamik',
    'landing.tagline': 'Pemantauan klinikal berkuasa AI masa nyata yang mencipta salinan digital hidup setiap pesakit denggi — meramalkan kemerosotan sebelum ia berlaku, menerangkan sebab, dan mensimulasikan hasil rawatan.',
    'landing.enter': 'Masuk Papan Pemuka',
    'landing.footer': 'Dibina dengan FastAPI + XGBoost + SHAP + React · Klasifikasi Denggi WHO 2009',

    'dash.patients': 'Pesakit',
    'dash.hospital': 'Hospital',
    'dash.metrics': 'Metrik Model',
    'dash.admit': '+ Terima Pesakit',
    'dash.empty': 'Klik "Terima Pesakit" atau jalankan senario demo untuk bermula.',
    'dash.loading': 'Memuatkan pesakit demo...',
    'dash.selectPatient': 'Pilih pesakit untuk melihat carta & analisis.',
    'dash.selectSub': 'Ramalan 7 hari · Simulasi rawatan · Kebolehjelasan SHAP',

    'tab.forecast': 'Ramalan 7 Hari',
    'tab.timeline': 'Garis Masa',
    'tab.trajectory': 'Trajektori',
    'tab.treatment': 'Sim Rawatan',
    'tab.shap': 'Kenapa SHAP?',

    'sev.mild': 'Ringan',
    'sev.moderate': 'Sederhana',
    'sev.severe': 'Teruk',

    'form.title': 'Terima Pesakit Baru',
    'form.subtitle': 'Masukkan nilai klinikal — tekan Jalankan Inferens untuk meramalkan keterukan',
    'form.patientId': 'Identiti Pesakit',
    'form.bloodCounts': 'Kiraan Darah',
    'form.clinical': 'Penanda Klinikal',
    'form.submit': '+ Terima Pesakit & Ramal',
    'form.running': 'Menjalankan inferens…',

    'report.export': 'Eksport Laporan PDF',
    'report.generating': 'Menjana...',
  },

  es: {
    'landing.badge': 'Sistema de Apoyo a Decisiones Clínicas',
    'landing.subtitle': 'Gemelo Digital Dinámico del Dengue',
    'landing.tagline': 'Monitoreo clínico en tiempo real impulsado por IA que crea una copia digital viva de cada paciente con dengue — prediciendo el deterioro antes de que ocurra, explicando por qué y simulando resultados de tratamiento.',
    'landing.enter': 'Entrar al Panel',
    'landing.footer': 'Construido con FastAPI + XGBoost + SHAP + React · Clasificación del Dengue OMS 2009',

    'dash.patients': 'Pacientes',
    'dash.hospital': 'Hospital',
    'dash.metrics': 'Métricas del Modelo',
    'dash.admit': '+ Admitir Paciente',
    'dash.empty': 'Haga clic en "Admitir Paciente" o ejecute un escenario demo para comenzar.',
    'dash.loading': 'Cargando pacientes demo...',
    'dash.selectPatient': 'Seleccione un paciente para ver gráficos y análisis.',
    'dash.selectSub': 'Pronóstico 7 días · Simulación de tratamiento · Explicabilidad SHAP',

    'tab.forecast': 'Pronóstico 7 Días',
    'tab.timeline': 'Línea de Tiempo',
    'tab.trajectory': 'Trayectoria',
    'tab.treatment': 'Sim Tratamiento',
    'tab.shap': '¿Por qué SHAP?',

    'sev.mild': 'Leve',
    'sev.moderate': 'Moderado',
    'sev.severe': 'Grave',

    'form.title': 'Admitir Nuevo Paciente',
    'form.subtitle': 'Ingrese valores clínicos — presione Ejecutar Inferencia para predecir severidad',
    'form.patientId': 'Identidad del Paciente',
    'form.bloodCounts': 'Conteo Sanguíneo',
    'form.clinical': 'Marcadores Clínicos',
    'form.submit': '+ Admitir Paciente y Predecir',
    'form.running': 'Ejecutando inferencia…',

    'report.export': 'Exportar Informe PDF',
    'report.generating': 'Generando...',
  },
};

export default translations;
