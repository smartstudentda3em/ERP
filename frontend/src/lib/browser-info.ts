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
