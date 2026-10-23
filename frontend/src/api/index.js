import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000/api';

const api = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
});

// Attach JWT token to every request automatically
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Handle 401 globally — clear auth + redirect
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      if (!window.location.pathname.startsWith('/login') && !window.location.pathname.startsWith('/register')) {
        window.location.href = '/login';
      }
    }
    return Promise.reject(err);
  }
);

// ========================
// Auth API
// ========================
export const authAPI = {
  register:       (name, email, password) => api.post('/auth/register', { name, email, password }),
  login:          (email, password)       => api.post('/auth/login', { email, password }),
  getMe:          ()                      => api.get('/auth/me'),
  updateProfile:  (data)                  => api.put('/auth/me', data),
  changePassword: (currentPassword, newPassword) =>
    api.put('/auth/me/password', { current_password: currentPassword, new_password: newPassword }),
};

// ========================
// Reports API
// ========================
export const reportsAPI = {
  /** Generate a new report from an uploaded image with optional patient context */
  generateReport: (file, imageType = 'chest_xray', patientData = {}) => {
    const form = new FormData();
    form.append('file', file);
    form.append('image_type', imageType);
    if (patientData.patient_id) form.append('patient_id', patientData.patient_id);
    if (patientData.patient_name) form.append('patient_name', patientData.patient_name);
    if (patientData.patient_age) form.append('patient_age', String(patientData.patient_age));
    if (patientData.patient_gender) form.append('patient_gender', patientData.patient_gender);
    if (patientData.clinical_indication) form.append('clinical_indication', patientData.clinical_indication);

    return api.post('/report/generate', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 180_000,   // 3 min — model inference on CPU can be slow
    });
  },

  /** Paginated list — optional image_type, urgency_level, and status filter */
  listReports: (page = 1, perPage = 10, imageType = null, urgencyLevel = null, status = null) => {
    const params = { page, per_page: perPage };
    if (imageType) params.image_type = imageType;
    if (urgencyLevel) params.urgency_level = urgencyLevel;
    if (status) params.status = status;
    return api.get('/reports', { params });
  },

  /** Full-text search across filename, findings, impression */
  searchReports: (q, page = 1, perPage = 10) =>
    api.get('/reports/search', { params: { q, page, per_page: perPage } }),

  /** Single report by ID */
  getReport: (id) => api.get(`/reports/${id}`),

  /** Update / sign-off report */
  updateReport: (id, data) => api.put(`/reports/${id}`, data),

  /** Compare current report against prior report */
  compareReports: (id, priorId) => api.get(`/reports/${id}/compare/${priorId}`),

  /** Delete a single report */
  deleteReport: (id) => api.delete(`/reports/${id}`),

  /** Bulk delete — pass array of IDs */
  bulkDelete: (ids) => api.post('/reports/bulk-delete', { report_ids: ids }),

  /** Download a report as a .txt file */
  exportReport: (id) => {
    return api
      .get(`/reports/${id}/export`, { responseType: 'blob' })
      .then((res) => {
        const url = URL.createObjectURL(res.data);
        const a   = document.createElement('a');
        a.href = url;
        a.download = `medreport_${id}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      });
  },

  /** Get empathetic plain-English summary for patients */
  getPatientSummary: (id) => api.get(`/reports/${id}/patient-summary`),

  /** Ask interactive clinical question to AI Radiologist Copilot */
  askCopilot: (id, message) => api.post(`/reports/${id}/copilot`, { message }),

  /** Get interactive anatomical finding regions with coordinates */
  getInteractiveRegions: (id) => api.get(`/reports/${id}/interactive-regions`),

  /** Download complete archive of reports as CSV */
  exportAllCSV: () => {
    return api
      .get('/reports/export/all', { responseType: 'blob' })
      .then((res) => {
        const url = URL.createObjectURL(res.data);
        const a   = document.createElement('a');
        a.href = url;
        a.download = `radiology_archive_${Date.now()}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      });
  },

  /** Dashboard stats */
  getDashboard: () => api.get('/dashboard'),
};

// ========================
// Health & System API
// ========================
export const healthAPI = {
  check:       () => api.get('/health'),
  warmModel:   () => api.post('/model/warm'),
  getMetrics:  () => api.get('/system/metrics'),
  getGlossary: (q = '') => api.get('/glossary', { params: q ? { q } : {} }),
};

export default api;
