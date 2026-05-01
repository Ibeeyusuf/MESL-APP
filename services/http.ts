import AsyncStorage from '@react-native-async-storage/async-storage';

const API_BASE_URL =
  'https://api.meslfoundationoutreach.org/api/v1';

const ACCESS_TOKEN_KEY = 'carereach_access_token';
const REFRESH_TOKEN_KEY = 'carereach_refresh_token';

// In-memory cache for fast access during a session
let _accessToken: string | null = null;
let _refreshToken: string | null = null;

export async function loadTokensFromStorage() {
  try {
    _accessToken = await AsyncStorage.getItem(ACCESS_TOKEN_KEY);
    _refreshToken = await AsyncStorage.getItem(REFRESH_TOKEN_KEY);
  } catch (error) {
    console.error('Failed to load tokens from storage:', error);
  }
}

export function getAccessToken() {
  return _accessToken;
}

export async function setAccessToken(token: string) {
  _accessToken = token;
  try {
    await AsyncStorage.setItem(ACCESS_TOKEN_KEY, token);
  } catch (error) {
    console.error('Failed to save access token:', error);
  }
}

export async function setRefreshToken(token: string) {
  _refreshToken = token;
  try {
    await AsyncStorage.setItem(REFRESH_TOKEN_KEY, token);
  } catch (error) {
    console.error('Failed to save refresh token:', error);
  }
}

export async function clearAuthTokens() {
  _accessToken = null;
  _refreshToken = null;
  try {
    await AsyncStorage.multiRemove([ACCESS_TOKEN_KEY, REFRESH_TOKEN_KEY]);
  } catch (error) {
    console.error('Failed to clear auth tokens:', error);
  }
}

// ── Auth expired listener ──
type AuthExpiredCallback = () => void;
let _authExpiredCallback: AuthExpiredCallback | null = null;

export function setAuthExpiredCallback(cb: AuthExpiredCallback | null) {
  _authExpiredCallback = cb;
}

// ── Refresh logic ──
let refreshRequest: Promise<string | null> | null = null;

async function parseErrorMessage(response: Response): Promise<string> {
  let message = `Request failed with status ${response.status}`;
  try {
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      const json = (await response.json()) as { message?: string | string[]; error?: string };
      if (Array.isArray(json.message)) message = json.message.join(', ');
      else if (json.message) message = json.message;
      else if (json.error) message = json.error;
    } else {
      const text = await response.text();
      if (text && text.length > 0) message = text;
    }
  } catch (e) {
    // If we can't parse error details, use the standard message
    console.error('Error parsing error response:', e);
  }
  return message;
}

async function refreshAccessToken(): Promise<string | null> {
  if (refreshRequest) return refreshRequest;
  if (!_refreshToken) return null;

  refreshRequest = (async () => {
    const res = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: _refreshToken }),
    });
    if (!res.ok) throw new Error(await parseErrorMessage(res));
    const json = (await res.json()) as { accessToken: string; refreshToken?: string };
    await setAccessToken(json.accessToken);
    if (json.refreshToken) await setRefreshToken(json.refreshToken);
    return json.accessToken;
  })().finally(() => {
    refreshRequest = null;
  });

  return refreshRequest;
}

// ── Main request function ──
export async function apiRequest<T>(
  path: string,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  body?: unknown,
  useAuth = true,
  hasRetried = false,
): Promise<T> {
  const isFormData = body instanceof FormData;
  const headers: Record<string, string> = isFormData ? {} : { 'Content-Type': 'application/json' };

  if (useAuth && _accessToken) {
    headers.Authorization = `Bearer ${_accessToken}`;
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : isFormData ? (body as FormData) : JSON.stringify(body),
    });
  } catch (e) {
    const networkError = e instanceof Error ? e.message : 'Network request failed';
    console.error(`API request failed for ${method} ${path}:`, networkError);
    throw new Error(`Network error: ${networkError}`);
  }

  if (response.status === 401 && useAuth && !hasRetried) {
    try {
      const newToken = await refreshAccessToken();
      if (newToken) return apiRequest<T>(path, method, body, useAuth, true);
    } catch {}

    await clearAuthTokens();
    _authExpiredCallback?.();
    throw new Error('Unauthorized - please login again');
  }

  if (!response.ok) {
    const errorMsg = await parseErrorMessage(response);
    console.error(`API error for ${method} ${path}:`, response.status, errorMsg);
    throw new Error(errorMsg);
  }

  if (response.status === 204) return {} as T;
  
  try {
    const data = (await response.json()) as T;
    return data;
  } catch (e) {
    console.error(`Failed to parse response from ${method} ${path}:`, e);
    throw new Error('Invalid response format from server');
  }
}
