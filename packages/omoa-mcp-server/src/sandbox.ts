import fs from "node:fs";
import path from "node:path";

export function resolveSandboxedPath(
  requested: string,
  roots: string[],
): string {
  if (roots.length === 0) {
    throw new Error(
      "Aucune source liée — liez un dossier ou un dépôt Git dans le Host OwnMyOwnAI.",
    );
  }

  const requestedPath = path.resolve(requested);

  for (const root of roots) {
    const rootResolved = path.resolve(root);
    const candidate = path.isAbsolute(requested)
      ? requestedPath
      : path.resolve(rootResolved, requested);

    let rootCanon = rootResolved;
    let resolved = candidate;
    try {
      rootCanon = fs.realpathSync(rootResolved);
      resolved = fs.realpathSync(candidate);
    } catch {
      // keep unresolved paths for clearer errors below
    }

    const rootPrefix = rootCanon.endsWith(path.sep)
      ? rootCanon
      : rootCanon + path.sep;
    if (resolved === rootCanon || resolved.startsWith(rootPrefix)) {
      return resolved;
    }
  }

  throw new Error(`Chemin hors périmètre autorisé : ${requested}`);
}
