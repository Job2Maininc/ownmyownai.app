import { describe, expect, it } from "vitest";
import { sanitizeRedirectPath } from "../auth-redirect";

describe("sanitizeRedirectPath", () => {
  it("retourne le chemin valide", () => {
    expect(sanitizeRedirectPath("/chat/abc")).toBe("/chat/abc");
  });

  it("rejette les redirections externes", () => {
    expect(sanitizeRedirectPath("//evil.com")).toBe("/dashboard");
    expect(sanitizeRedirectPath("https://evil.com")).toBe("/dashboard");
  });

  it("utilise le fallback pour les valeurs vides", () => {
    expect(sanitizeRedirectPath(null)).toBe("/dashboard");
    expect(sanitizeRedirectPath(undefined, "/login")).toBe("/login");
  });
});
