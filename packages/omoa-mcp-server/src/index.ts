#!/usr/bin/env node
import fs from "node:fs";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { loadConfig } from "./config.js";
import {
  listDir,
  listEnabledRoots,
  readFile,
  searchChunks,
} from "./context-db.js";
import { resolveSandboxedPath } from "./sandbox.js";

function textResult(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  };
}

function errorResult(message: string) {
  return {
    isError: true as const,
    content: [{ type: "text" as const, text: message }],
  };
}

async function main(): Promise<void> {
  const config = loadConfig();
  const server = new McpServer(
    {
      name: "omoa-context",
      version: "0.1.0",
    },
    {
      capabilities: {
        tools: {},
      },
    },
  );

  server.tool(
    "search_chunks",
    "Recherche full-text dans les bases de contexte OwnMyOwnAI (RAG indexé)",
    {
      query: z.string().describe("Requête de recherche"),
    },
    async ({ query }) => {
      try {
        return textResult(searchChunks(config, query));
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return errorResult(message);
      }
    },
  );

  server.tool(
    "list_dir",
    "Liste le contenu d'un dossier sous les sources liées OwnMyOwnAI",
    {
      path: z.string().describe("Chemin du dossier"),
    },
    async ({ path: requestedPath }) => {
      try {
        const roots = listEnabledRoots(config.contextDbPath);
        const dir = resolveSandboxedPath(requestedPath, roots);
        if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
          return errorResult(`Pas un dossier : ${requestedPath}`);
        }
        return textResult(listDir(dir));
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return errorResult(message);
      }
    },
  );

  server.tool(
    "read_file",
    "Lit un fichier texte (lignes paginées) sous les sources liées OwnMyOwnAI",
    {
      path: z.string().describe("Chemin du fichier"),
      offset: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe("Ligne de départ (0-based)"),
      limit: z
        .number()
        .int()
        .min(1)
        .optional()
        .describe("Nombre de lignes max"),
    },
    async ({ path: requestedPath, offset, limit }) => {
      try {
        const roots = listEnabledRoots(config.contextDbPath);
        const filePath = resolveSandboxedPath(requestedPath, roots);
        if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
          return errorResult(`Pas un fichier : ${requestedPath}`);
        }
        return textResult(readFile(filePath, offset ?? 0, limit ?? 200));
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return errorResult(message);
      }
    },
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
