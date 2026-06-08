const STORAGE_KEY = "ownmyownai:last-email";

export function getRememberedEmail(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(STORAGE_KEY);
}

export function rememberEmail(email: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, email.trim().toLowerCase());
}
