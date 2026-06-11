import { describe, expect, it } from "vitest";
import { formatApiError, formatDownloadError, formatRelayError } from "../user-errors";

describe("formatApiError", () => {
  it("traduit les erreurs non authentifiées", () => {
    expect(formatApiError({ code: "unauthorized", message: "JWT expired" }).message).toMatch(
      /connecté/,
    );
  });

  it("évite le jargon technique", () => {
    expect(formatApiError(new Error("TypeError: fetch failed")).message).toMatch(/réseau/i);
  });
});

describe("formatDownloadError", () => {
  it("propose une action pour les téléchargements indisponibles", () => {
    const err = formatDownloadError("installer_unavailable");
    expect(err.message).toMatch(/pas encore disponible/i);
    expect(err.actionHref).toBe("/download");
  });
});

describe("formatRelayError", () => {
  it("guide vers la mise à jour du Host", () => {
    const err = formatRelayError("Host obsolète — installez la v0.2.1+");
    expect(err.actionHref).toBe("/download");
  });
});
