import { describe, expect, it } from "vitest";
import { formatAuthError } from "../auth-errors";

describe("formatAuthError", () => {
  it("traduit la limite d'envoi d'emails par code", () => {
    expect(
      formatAuthError({
        code: "over_email_send_rate_limit",
        message: "email rate limit exceeded",
      }),
    ).toMatch(/Limite d'envoi d'emails/);
  });

  it("traduit la limite d'envoi d'emails par message", () => {
    expect(
      formatAuthError({ message: "email rate limit exceeded" }),
    ).toMatch(/Limite d'envoi d'emails/);
  });

  it("retourne un message générique pour les erreurs inconnues", () => {
    expect(formatAuthError({ message: "something weird happened" })).toBe(
      "Une erreur est survenue. Réessayez dans quelques instants.",
    );
  });
});
