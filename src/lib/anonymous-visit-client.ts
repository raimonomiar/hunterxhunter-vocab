const VISIT_SESSION_FLAG = "hxh-vocab-anonymous-visit-counted";

type SessionFlagStorage = Pick<Storage, "getItem" | "setItem">;

/** Marks the current tab session before sending, so rerenders, navigation, and retries do not resend. */
export function recordAnonymousVisitOnce(storage: SessionFlagStorage, send: () => void): void {
  try {
    if (storage.getItem(VISIT_SESSION_FLAG) === "1") return;
    storage.setItem(VISIT_SESSION_FLAG, "1");
    send();
  } catch {
    // Analytics is optional. If browser storage is unavailable, browsing still works.
  }
}

export function recordAnonymousVisitForSession(): void {
  if (typeof window === "undefined") return;

  try {
    recordAnonymousVisitOnce(window.sessionStorage, () => {
      void fetch("/api/analytics/visit", {
        method: "POST",
        keepalive: true,
        cache: "no-store",
      }).catch(() => {
        // The request is best-effort and deliberately not retried without a tracking ID.
      });
    });
  } catch {
    // Access to sessionStorage itself can be disabled by the browser.
  }
}
