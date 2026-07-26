type GtagCommand = "event";

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (command: GtagCommand, eventName: string, parameters?: Record<string, string | number | boolean>) => void;
    clarity?: (command: "event", eventName: string) => void;
  }
}

/**
 * Records a successful sign-in without sending the access code, email address,
 * or another identifier to either analytics provider.
 */
export function trackSuccessfulLogin(method: string): void {
  if (typeof window === "undefined") return;

  window.gtag?.("event", "login", { method });
  window.clarity?.("event", "login");
}

