import axios from 'axios';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

const api = axios.create({ baseURL: BASE_URL, timeout: 15000 });

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

export const WS_URL =
  (import.meta.env.VITE_API_URL || 'http://localhost:8000')
    .replace(/^http/, 'ws') + '/ws/alerts';
