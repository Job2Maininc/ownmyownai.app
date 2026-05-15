const encoder = new TextEncoder();

function base64UrlDecode(str: string): Uint8Array {
  const padded = str + "=".repeat((4 - (str.length % 4)) % 4);
  const base64 = padded.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

async function importKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
}

export interface RelayClaims {
  sub: string;
  host_id: string;
  role: "web" | "runner";
  exp: number;
}

export async function verifyRelayJwt(
  token: string,
  secret: string,
): Promise<RelayClaims | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [header, body, sig] = parts;
  const data = `${header}.${body}`;
  const key = await importKey(secret);
  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    base64UrlDecode(sig),
    encoder.encode(data),
  );
  if (!valid) return null;
  try {
    const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(body))) as RelayClaims;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    if (!payload.host_id || !payload.role) return null;
    return payload;
  } catch {
    return null;
  }
}
