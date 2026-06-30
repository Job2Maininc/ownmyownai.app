import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import type { OmoaConfig } from "./config.js";

const MAX_READ_BYTES = 32_768;

export function buildFtsQuery(userQuery: string): string | null {
  const terms = userQuery
    .split(/\s+/)
    .filter((t) => t.length > 0)
    .map((t) => `"${t.replaceAll('"', '""')}"`);
  return terms.length > 0 ? terms.join(" ") : null;
}

function openDb(dbPath: string): Database.Database {
  if (!fs.existsSync(dbPath)) {
    throw new Error(
      `Base contexte introuvable : ${dbPath}. Lancez le Host OwnMyOwnAI pour déchiffrer context.db.`,
    );
  }
  return new Database(dbPath, { readonly: true, fileMustExist: true });
}

export function listEnabledRoots(dbPath: string): string[] {
  const db = openDb(dbPath);
  try {
    const rows = db
      .prepare(
        "SELECT path FROM context_links WHERE enabled = 1 ORDER BY path",
      )
      .all() as Array<{ path: string }>;
    return rows.map((r) => r.path);
  } finally {
    db.close();
  }
}

function listAllKnowledgeBaseIds(dbPath: string): string[] {
  const db = openDb(dbPath);
  try {
    const rows = db
      .prepare("SELECT id FROM knowledge_bases ORDER BY created_at DESC")
      .all() as Array<{ id: string }>;
    return rows.map((r) => r.id);
  } finally {
    db.close();
  }
}

function resolveKbIds(config: OmoaConfig): string[] {
  if (config.contextIds.length > 0) {
    return config.contextIds;
  }
  return listAllKnowledgeBaseIds(config.contextDbPath);
}

export function searchChunks(
  config: OmoaConfig,
  query: string,
): { query: string; chunks: Array<{ index: number; content: string }>; message?: string } {
  const kbIds = resolveKbIds(config);
  if (kbIds.length === 0) {
    return {
      query,
      chunks: [],
      message: "Aucune base de contexte disponible",
    };
  }

  const ftsQuery = buildFtsQuery(query);
  if (!ftsQuery) {
    return { query, chunks: [] };
  }

  const placeholders = kbIds.map(() => "?").join(", ");
  const sql = `SELECT content FROM chunks_fts
    WHERE knowledge_base_id IN (${placeholders})
    AND chunks_fts MATCH ?
    ORDER BY bm25(chunks_fts)
    LIMIT ?`;

  const db = openDb(config.contextDbPath);
  try {
    const rows = db
      .prepare(sql)
      .all(...kbIds, ftsQuery, config.ragTopK) as Array<{ content: string }>;
    return {
      query,
      chunks: rows.map((row, i) => ({ index: i + 1, content: row.content })),
    };
  } finally {
    db.close();
  }
}

export function readFile(
  filePath: string,
  offset = 0,
  limit = 200,
): {
  path: string;
  offset: number;
  lines: string[];
  totalLines: number;
  truncated: boolean;
} {
  const content = fs.readFileSync(filePath, "utf8");
  const lines = content.split(/\r?\n/);
  const slice =
    offset >= lines.length
      ? []
      : lines.slice(offset, Math.min(lines.length, offset + limit));
  const stat = fs.statSync(filePath);
  return {
    path: filePath,
    offset,
    lines: slice,
    totalLines: lines.length,
    truncated: stat.size > MAX_READ_BYTES,
  };
}

export function listDir(dirPath: string): {
  path: string;
  entries: Array<{ name: string; isDir: boolean; size: number }>;
} {
  const entries = fs
    .readdirSync(dirPath, { withFileTypes: true })
    .map((entry) => {
      const full = path.join(dirPath, entry.name);
      const stat = fs.statSync(full);
      return {
        name: entry.name,
        isDir: entry.isDirectory(),
        size: stat.size,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  return { path: dirPath, entries };
}
