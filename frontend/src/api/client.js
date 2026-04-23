import axios from 'axios';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

const api = axios.create({ baseURL: BASE_URL, timeout: 30000 });

export async function predict(payload) {
  const { data } = await api.post('/predict', payload);
  return data;
}

export async function simulate(payload) {
  const { data } = await api.post('/simulate/counterfactual', payload);
  return data;
}

export async function updateSEIR(payload) {
  const { data } = await api.post('/seir/update', payload);
  return data;
}

export async function submitOutcome(payload) {
  const { data } = await api.post('/outcome', payload);
  return data;
}

export async function getDashboardSummary() {
  const { data } = await api.get('/dashboard/summary');
  return data;
}

export async function getForecast(patientId) {
  const { data } = await api.get(`/forecast/${patientId}`);
  return data;
}

export async function getModelMetrics() {
  const { data } = await api.get('/model/metrics');
  return data;
}

export async function getHospitalForecast() {
  const { data } = await api.get('/hospital/forecast');
  return data;
}

export async function getDemoScenarios() {
  const { data } = await api.get('/demo/scenarios');
  return data;
}

export async function runDemoScenario(scenarioId) {
  const { data } = await api.post(`/demo/run/${scenarioId}`);
  return data;
}

export async function getWeatherLags(lat, lon) {
  const params = {};
  if (lat != null) params.lat = lat;
  if (lon != null) params.lon = lon;
  const { data } = await api.get('/weather/lags', { params });
  return data;
}

export const WS_URL =
  (import.meta.env.VITE_API_URL || 'http://localhost:8000')
    .replace(/^http/, 'ws') + '/ws/alerts';
