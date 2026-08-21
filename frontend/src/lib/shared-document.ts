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
  // No explicit Content-Type here — a multipart body needs its boundary parameter in that header
  // (e.g. "multipart/form-data; boundary=..."), which only the browser/axios can generate from the
  // actual FormData contents. Setting the header manually without one produces a body the server
  // can't parse; some browsers silently patch in the boundary anyway (masking the bug in testing),
  // but not all of them do.
  //
  // A bounded timeout matters here specifically: this call has no synchronous fallback like the
  // canShare() checks around it — a stalled mobile connection would otherwise hang the "مشاركة"
  // button (and, until a separate fix, the whole page's visible content) indefinitely, with no
  // error ever surfacing to trigger the plain-download fallback in the caller's catch block.
  const { id } = await unwrap<{ id: string }>(
    apiClient.post('/shared-documents', formData, { timeout: 30000 }),
  );
  return `${window.location.origin}/api/shared-documents/${id}`;
}
