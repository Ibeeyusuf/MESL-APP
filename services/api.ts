import { apiRequest, setAccessToken, setRefreshToken, clearAuthTokens } from './http';
import type { MobileRole } from '@/types';

export interface LoginPayload {
  email: string;
  password: string;
  signInAs?: string;  // UI role name (Doctor, Surgeon, etc.) - will be transformed to API format
  centreId?: string;
}

// Send UI role format directly - backend expects the UI format names
export function mapUiRoleToApiRole(role: string): string {
  // Backend expects the UI format directly (e.g., "Doctor" not "DOCTOR")
  return role;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    fullName: string;
    email: string;
    role: string;
    centreId: string;
    centre?: { id: string; code: string; name: string };
  };
}

export interface LoginOptionsResponse {
  signInAs: string[];
  catchmentAreas: { id: string; code: string; name: string }[];
}

export const api = {
  auth: {
    loginOptions: () =>
      apiRequest<LoginOptionsResponse>('/auth/login-options', 'GET', undefined, false),

    login: async (payload: LoginPayload) => {
      // Transform UI role to API-expected format (e.g., "Doctor" -> "DOCTOR")
      const transformedPayload = {
        ...payload,
        signInAs: payload.signInAs ? mapUiRoleToApiRole(payload.signInAs) : undefined,
      };
      const res = await apiRequest<LoginResponse>('/auth/login', 'POST', transformedPayload, false);
      await setAccessToken(res.accessToken);
      await setRefreshToken(res.refreshToken);
      return res;
    },

    logout: async () => {
      try { await apiRequest('/auth/logout', 'POST'); } finally { await clearAuthTokens(); }
    },
  },

  centres: {
    list: (includeInactive = false) =>
      apiRequest(`/centres?includeInactive=${String(includeInactive)}`, 'GET'),
  },

  users: {
    list: (query = 'includeInactive=false&page=1&limit=100') =>
      apiRequest(`/users?${query}`, 'GET'),
  },

  patients: {
    checkDuplicates: (params: string) =>
      apiRequest(`/patients/duplicates/check?${params}`, 'GET'),
    list: (params = 'page=1&limit=20') =>
      apiRequest(`/patients?${params}`, 'GET'),
    getById: (id: string) =>
      apiRequest(`/patients/${id}`, 'GET'),
    create: (payload: FormData | Record<string, unknown>) =>
      apiRequest('/patients', 'POST', payload),
    update: (id: string, payload: FormData | Record<string, unknown>) =>
      apiRequest(`/patients/${id}`, 'PATCH', payload),
  },

  visualAcuity: {
    list: (patientId: string) =>
      apiRequest(`/patients/${patientId}/visual-acuity`, 'GET'),
    create: (patientId: string, payload: Record<string, unknown>) =>
      apiRequest(`/patients/${patientId}/visual-acuity`, 'POST', payload),
  },

  consultations: {
    list: (patientId: string) =>
      apiRequest(`/patients/${patientId}/consultations`, 'GET'),
    create: (patientId: string, payload: Record<string, unknown>) =>
      apiRequest(`/patients/${patientId}/consultations`, 'POST', payload),
  },

  surgeries: {
    list: (patientId: string) =>
      apiRequest(`/patients/${patientId}/surgeries`, 'GET'),
    create: (patientId: string, payload: Record<string, unknown>) =>
      apiRequest(`/patients/${patientId}/surgeries`, 'POST', payload),
  },

  postOps: {
    list: (surgeryId: string) =>
      apiRequest(`/surgeries/${surgeryId}/post-ops`, 'GET'),
    create: (surgeryId: string, payload: Record<string, unknown>) =>
      apiRequest(`/surgeries/${surgeryId}/post-ops`, 'POST', payload),
  },

  preSurgeries: {
    list: (patientId: string) =>
      apiRequest(`/patients/${patientId}/pre-surgeries`, 'GET'),
    create: (patientId: string, payload: Record<string, unknown>) =>
      apiRequest(`/patients/${patientId}/pre-surgeries`, 'POST', payload),
  },

  drugs: {
    list: (params = 'page=1&limit=100') =>
      apiRequest(`/drugs?${params}`, 'GET'),
    updateStock: (drugId: string, payload: Record<string, unknown>) =>
      apiRequest(`/drugs/${drugId}`, 'PATCH', payload),
  },

  prescriptions: {
    list: (patientId: string) =>
      apiRequest(`/patients/${patientId}/prescriptions`, 'GET'),
    create: (patientId: string, payload: Record<string, unknown>) =>
      apiRequest(`/patients/${patientId}/prescriptions`, 'POST', payload),
  },

  eyeglasses: {
    listItems: (params = 'page=1&limit=100') =>
      apiRequest(`/eyeglasses/items?${params}`, 'GET'),
    listIssuances: (patientId: string) =>
      apiRequest(`/eyeglasses/patients/${patientId}/issuances`, 'GET'),
    createIssuance: (patientId: string, payload: Record<string, unknown>) =>
      apiRequest(`/eyeglasses/patients/${patientId}/issuances`, 'POST', payload),
  },

  reports: {
    demographics: (params = '') =>
      apiRequest(`/reports/demographics${params ? `?${params}` : ''}`, 'GET'),
    surgeryOutcomes: (params = '') =>
      apiRequest(`/reports/surgery-outcomes${params ? `?${params}` : ''}`, 'GET'),
    vaOutcomes: (params = '') =>
      apiRequest(`/reports/va-outcomes${params ? `?${params}` : ''}`, 'GET'),
    followUpCompliance: (params = '') =>
      apiRequest(`/reports/follow-up-compliance${params ? `?${params}` : ''}`, 'GET'),
    drugsInventory: (params = '') =>
      apiRequest(`/reports/drugs-inventory${params ? `?${params}` : ''}`, 'GET'),
    glassesInventory: (params = '') =>
      apiRequest(`/reports/glasses-inventory${params ? `?${params}` : ''}`, 'GET'),
  },
};