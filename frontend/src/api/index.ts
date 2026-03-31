import axios from 'axios';

const api = axios.create({ baseURL: '/api' });

api.interceptors.request.use(config => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  res => res,
  err => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export const authApi = {
  login: (email: string, password: string) =>
    api.post('/auth/login', { email, password }).then(r => r.data),
  me: () => api.get('/auth/me').then(r => r.data),
};

export const employeesApi = {
  list: () => api.get('/employees').then(r => r.data),
  get: (id: number) => api.get(`/employees/${id}`).then(r => r.data),
  create: (data: any) => api.post('/employees', data).then(r => r.data),
  update: (id: number, data: any) => api.put(`/employees/${id}`, data).then(r => r.data),
  delete: (id: number) => api.delete(`/employees/${id}`).then(r => r.data),
};

export const timeEntriesApi = {
  list: (year?: number, month?: number) => {
    const params: any = {};
    if (year) params.year = year;
    if (month) params.month = month;
    return api.get('/time-entries', { params }).then(r => r.data);
  },
  upsert: (data: { year: number; month: number; hours: number }) =>
    api.post('/time-entries', data).then(r => r.data),
  submit: (id: number) => api.post(`/time-entries/${id}/submit`).then(r => r.data),
  approve: (id: number) => api.post(`/time-entries/${id}/approve`).then(r => r.data),
  byUser: (userId: number) => api.get(`/time-entries/user/${userId}`).then(r => r.data),
};

export const salarySlipsApi = {
  list: () => api.get('/salary-slips').then(r => r.data),
  generate: (data: { userId: number; year: number; month: number; paymentDate: string }) =>
    api.post('/salary-slips/generate', data).then(r => r.data),
  pdfUrl: (id: number) => `/api/salary-slips/${id}/pdf`,
};

export const expensesApi = {
  list: (params?: { year?: number; month?: number; userId?: number }) =>
    api.get('/expenses', { params }).then(r => r.data),
  create: (data: any) => api.post('/expenses', data).then(r => r.data),
  update: (id: number, data: any) => api.put(`/expenses/${id}`, data).then(r => r.data),
  delete: (id: number) => api.delete(`/expenses/${id}`).then(r => r.data),
  extract: (file: File) => {
    const form = new FormData();
    form.append('receipt', file);
    return api.post('/expenses/extract', form, { headers: { 'Content-Type': 'multipart/form-data' } }).then(r => r.data);
  },
  receiptUrl: (filename: string) => `/api/expenses/receipt/${filename}`,
  exportUrl: (params: { year?: number; month?: number; userId?: number }) => {
    const q = new URLSearchParams();
    if (params.year)   q.set('year',   String(params.year));
    if (params.month)  q.set('month',  String(params.month));
    if (params.userId) q.set('userId', String(params.userId));
    return `/api/expenses/export?${q}`;
  },
  receiptsZipUrl: (params: { year?: number; month?: number; userId?: number }) => {
    const q = new URLSearchParams();
    if (params.year)   q.set('year',   String(params.year));
    if (params.month)  q.set('month',  String(params.month));
    if (params.userId) q.set('userId', String(params.userId));
    return `/api/expenses/receipts-zip?${q}`;
  },
};

export default api;
