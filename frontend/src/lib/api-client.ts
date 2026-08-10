import axios, { AxiosError } from 'axios';
import { useAuthStore } from '../store/auth-store';

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
    const { accessToken, user } = response.data.data;
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

    return Promise.reject(error);
  },
);

/** Unwraps the { success, data } envelope the backend's TransformResponseInterceptor adds. */
export function unwrap<T>(promise: Promise<{ data: { data: T } }>): Promise<T> {
  return promise.then((res) => res.data.data);
}

/**
 * Extracts a displayable message from a failed API call for use in toast.error(...). class-validator
 * (via Nest's ValidationPipe) returns `message` as an array of per-field strings on 400s, while
 * ConflictException/NotFoundException etc. return a single string — this normalizes both to one
 * line so every mutation's onError can use it without re-deriving the same array check.
 */
export function getErrorMessage(err: unknown, fallback: string): string {
  const message = (err as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
  if (Array.isArray(message)) return message.join(' — ');
  return message ?? fallback;
}
