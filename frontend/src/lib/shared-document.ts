import { apiClient, unwrap } from './api-client';

/**
 * Uploads a generated PDF to the backend and returns its public, unauthenticated URL — used by the
 * "مشاركة" share-fallback when the browser can share a link (Level 1 Web Share,
 * canShare({url})) but not an attached file (Level 2, canShare({files})). Samsung Internet hosting
 * an installed TWA is the confirmed real case: it supports the former but not the latter.
 *
 * Built from window.location.origin rather than the axios client's configured baseURL — the
 * frontend's own origin is always where nginx proxies /api/ through to the backend (see
 * frontend/nginx.conf), in both local dev and production, so this is correct regardless of how
 * VITE_API_BASE_URL happens to be set.
 */
export async function uploadSharedPdf(blob: Blob, filename: string): Promise<string> {
  const formData = new FormData();
  formData.append('file', blob, filename);
  const { id } = await unwrap<{ id: string }>(
    apiClient.post('/shared-documents', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
  );
  return `${window.location.origin}/api/shared-documents/${id}`;
}
