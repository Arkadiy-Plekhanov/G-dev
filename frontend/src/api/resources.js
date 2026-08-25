import { get, post, patch, del, setTokens, clearTokens, apiFetch } from './client'

export const authApi = {
  async loginWithGoogle(idToken) {
    const pair = await apiFetch('/auth/google', { method: 'POST', body: JSON.stringify({ id_token: idToken }) })
    setTokens(pair)
    return pair
  },
  me: () => get('/me'),
  async logout() {
    const raw = localStorage.getItem('qualities_refresh_token')
    if (raw) {
      try { await post('/auth/logout', { refresh_token: raw }) } catch { /* best effort */ }
    }
    clearTokens()
  },
  exportAccount: () => get('/me/export'),
  deleteAccount: () => del('/me'),
}

export const catalogApi = {
  qualities: () => get('/catalog/qualities'),
  ideals: () => get('/catalog/ideals'),
  ideal: (id) => get(`/catalog/ideals/${id}`),
}

export const onboardingApi = {
  adoptIdeal: (idealId) => post('/onboarding/adopt-ideal', { ideal_id: idealId }),
}

export const goalsApi = {
  list: () => get('/goals'),
  get: (id) => get(`/goals/${id}`),
  overview: (id) => get(`/goals/${id}/overview`),
  create: (data) => post('/goals', data),
  update: (id, data) => patch(`/goals/${id}`, data),
  remove: (id) => del(`/goals/${id}`),
}

export const qualitiesApi = {
  list: () => get('/qualities'),
  get: (id) => get(`/qualities/${id}`),
  overview: (id) => get(`/qualities/${id}/overview`),
  adopt: (data) => post('/qualities', data),
  update: (id, data) => patch(`/qualities/${id}`, data),
  remove: (id) => del(`/qualities/${id}`),
}

export const actionsApi = {
  list: (params = {}) => {
    const qs = new URLSearchParams(params).toString()
    return get(`/actions${qs ? `?${qs}` : ''}`)
  },
  get: (id) => get(`/actions/${id}`),
  createWithQualities: (data) => post('/actions/with-qualities', data),
  expressions: (actionId) => get(`/actions/${actionId}/expressions`),
}

export const cyclesApi = {
  list: () => get('/cycles'),
  get: (id) => get(`/cycles/${id}`),
  create: (data) => post('/cycles', data),
  update: (id, data) => patch(`/cycles/${id}`, data),
  remove: (id) => del(`/cycles/${id}`),
}

export const reflectionsApi = {
  list: () => get('/reflections'),
  get: (id) => get(`/reflections/${id}`),
  create: (data) => post('/reflections', data),
  update: (id, data) => patch(`/reflections/${id}`, data),
  remove: (id) => del(`/reflections/${id}`),
}

export const analyticsApi = {
  currentFocus: () => get('/analytics/current-focus'),
  dataQualityAlerts: () => get('/analytics/data-quality-alerts'),
}
