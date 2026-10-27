import { api } from "./api";

export const authService = {
  register: (payload) => api.post("/auth/register", payload).then(r => r.data),
  login: (payload) => api.post("/auth/login", payload).then(r => r.data),
  refresh: (payload) => api.post("/auth/refresh", payload).then(r => r.data),
  me: () => api.get("/auth/me").then(r => r.data),
  logout: () => api.post("/auth/logout").then(r => r.data),
  forgotPassword: (payload) => api.post("/auth/forgot-password", payload).then(r => r.data),
  resetPassword: (payload) => api.post("/auth/reset-password", payload).then(r => r.data),
};
