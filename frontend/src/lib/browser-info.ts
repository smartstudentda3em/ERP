/**
 * Best-effort label for which browser engine is actually rendering the page — used only to show a
 * short hint in the share-fallback toast so a report like "share isn't working" comes with a
 * concrete engine name instead of requiring another guess. A TWA-installed app is still Chrome
 * *if* Android handed the Trusted Web Activity to Chrome, but on Samsung devices it can just as
 * easily be handed to Samsung Internet instead — which has much weaker Web Share API file support —
 * and there is no way to tell which one happened without asking the browser itself.
 */
export function shareEngineHint(): string {
  const ua = navigator.userAgent;
  if (/SamsungBrowser/i.test(ua)) return 'Samsung Internet';
  if (/EdgA/i.test(ua)) return 'Edge';
  if (/FxiOS|Firefox/i.test(ua)) return 'Firefox';
  if (/Chrome\//i.test(ua)) return 'Chrome';
  return 'غير معروف';
}

/**
 * Confirmed on the actual device this matters for: Samsung Internet hosts the installed TWA and
 * canShare({files}) is false there — no file-sharing support at all. Before sinking real effort
 * into a bigger fix (server-hosted PDFs + sharing a link instead of the file itself, since a link
 * is Level 1 Web Share — much more broadly supported than file sharing), this checks whether even
 * that narrower capability exists here. If canShareUrl also comes back false, Level 1 share is a
 * dead end on this browser too and there's nothing left in the Web Share API worth pursuing.
 */
export function shareCapabilityHint(): string {
  const hasShare = typeof navigator.share === 'function';
  const canShareUrl = !!(navigator.canShare && navigator.canShare({ url: 'https://example.com' }));
  return `share=${hasShare ? 1 : 0} url=${canShareUrl ? 1 : 0}`;
}
