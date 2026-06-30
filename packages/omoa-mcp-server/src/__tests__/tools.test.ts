import { describe, expect, it } from "vitest";
import { buildFtsQuery } from "../context-db.js";
import { resolveSandboxedPath } from "../sandbox.js";

describe("buildFtsQuery", () => {
  it("quote chaque terme", () => {
    expect(buildFtsQuery("contrat 2024")).toBe('"contrat" "2024"');
  });

  it("échappe les guillemets", () => {
    expect(buildFtsQuery('foo"bar')).toBe('"foo""bar"');
  });

  it("retourne null pour requête vide", () => {
    expect(buildFtsQuery("   ")).toBeNull();
  });
});

describe("resolveSandboxedPath", () => {
  it("rejette un chemin hors racines", () => {
    const roots = ["C:\\linked_only"];
    expect(() => resolveSandboxedPath("C:\\other\\secret.txt", roots)).toThrow(
      /hors périmètre/,
    );
  });

  it("accepte un chemin relatif sous la racine", () => {
    const root = process.cwd();
    const resolved = resolveSandboxedPath("package.json", [root]);
    expect(resolved.endsWith("package.json")).toBe(true);
  });
});
