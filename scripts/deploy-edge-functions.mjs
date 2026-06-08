#!/usr/bin/env node
/**
 * Bundles edge functions for Supabase MCP deploy.
 * Run via agent or: node scripts/deploy-edge-functions.mjs
 */
import { readFileSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..", "supabase", "functions");

const shared = ["cors.ts", "crypto.ts", "jwt.ts", "supabase.ts"].map((f) => ({
  name: `_shared/${f}`,
  content: readFileSync(join(root, "_shared", f), "utf8"),
}));

const functions = [
  { name: "create-pairing-code", verify_jwt: true },
  { name: "complete-pairing", verify_jwt: false },
  { name: "runner-heartbeat", verify_jwt: false },
  { name: "mint-relay-token", verify_jwt: true },
  { name: "runner-mint-relay-token", verify_jwt: false },
  { name: "create-conversation-share", verify_jwt: true },
  { name: "get-conversation-share", verify_jwt: false },
];

for (const fn of functions) {
  let index = readFileSync(join(root, fn.name, "index.ts"), "utf8");
  index = index.replaceAll("../_shared/", "./_shared/");
  const files = [{ name: "index.ts", content: index }, ...shared];
  console.log(JSON.stringify({ fn: fn.name, verify_jwt: fn.verify_jwt, fileCount: files.length }));
}
