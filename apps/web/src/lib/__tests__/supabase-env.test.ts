import { afterEach, describe, expect, it } from "vitest";
import { getSupabasePublicEnv } from "../supabase/env";

describe("getSupabasePublicEnv", () => {
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const originalKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  afterEach(() => {
    if (originalUrl === undefined) {
      delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    } else {
      process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    }
    if (originalKey === undefined) {
      delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    } else {
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalKey;
    }
  });

  it("returns null when env vars are missing", () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    expect(getSupabasePublicEnv()).toBeNull();
  });

  it("returns null when env vars are blank", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "  ";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "";
    expect(getSupabasePublicEnv()).toBeNull();
  });

  it("returns trimmed values when configured", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = " https://example.supabase.co ";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = " anon-key ";
    expect(getSupabasePublicEnv()).toEqual({
      url: "https://example.supabase.co",
      anonKey: "anon-key",
    });
  });
});
