import axios, { AxiosError } from 'axios';
import { useAuthStore } from '../store/auth-store';
import { resolveOfflineRequest } from './offline-store';

export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  withCredentials: true,
});

apiClient.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

let refreshPromise: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  try {
    const response = await axios.post(
      `${import.meta.env.VITE_API_BASE_URL || '/api'}/auth/refresh`,
      {},
      { withCredentials: true },
    );
    const { accessToken, user } = response.data;
    useAuthStore.getState().setSession(accessToken, user);
    return accessToken;
  } catch {
    useAuthStore.getState().clearSession();
    return null;
  }
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as (typeof error.config & { _retry?: boolean }) | undefined;

    if (error.response?.status === 401 && originalRequest && !originalRequest._retry) {
      originalRequest._retry = true;

      if (!refreshPromise) {
        refreshPromise = refreshAccessToken().finally(() => {
          refreshPromise = null;
        });
      }
      const newToken = await refreshPromise;
      if (newToken) {
        originalRequest.headers = originalRequest.headers ?? {};
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        return apiClient(originalRequest);
      }
    }

    // No real backend reachable — serve the request from the local offline store instead of
    // failing outright, so the app stays usable without Docker/Postgres. This must NOT trigger
    // when a real backend responded with a business-rule error (400/403/422/...): the app's
    // HttpExceptionFilter always shapes those as `{ success: false, message, ... }`, so that
    // shape is the signal that a *real* backend actually rejected the request — as opposed to no
    // response at all, or Vite's dev proxy answering with its own 500 because nothing is
    // listening on :3000 (still "no real backend", just wrapped in an HTTP response by the
    // proxy). Real rejections (e.g. "insufficient stock", "selling below cost requires
    // permission") must still surface to the user instead of being masked by a fake offline
    // success.
    // /auth/* is excluded: login has its own explicit offline-password check, and logout
    // already clears the session locally regardless of the API result.
    const path = (originalRequest?.url ?? '').split('?')[0].replace(/^\/+/, '');
    const responseData = error.response?.data as { success?: boolean } | undefined;
    const isRealBackendRejection =
      responseData !== null && typeof responseData === 'object' && responseData?.success === false;
    if (originalRequest && !path.startsWith('auth/') && !isRealBackendRejection) {
      try {
        const method = (originalRequest.method ?? 'get').toLowerCase() as 'get' | 'post' | 'patch' | 'delete';
        const body = typeof originalRequest.data === 'string' ? JSON.parse(originalRequest.data || '{}') : (originalRequest.data ?? {});
        const data = resolveOfflineRequest(method, path, originalRequest.params ?? {}, body);
        return Promise.resolve({
          data: { success: true, data },
          status: 200,
          statusText: 'OK (offline)',
          headers: {},
          config: originalRequest,
        });
      } catch (offlineError) {
        return Promise.reject(offlineError);
      }
    }

    return Promise.reject(error);
  },
);

/** Unwraps the { success, data } envelope the backend's TransformResponseInterceptor adds. */
export function unwrap<T>(promise: Promise<{ data: { data: T } }>): Promise<T> {
  return promise.then((res) => res.data.data);
}
