import { describe, expect, it } from "vitest";
import {
  creativeKindLabel,
  filterMediaCreatives,
  formatCreativeBytes,
  isMediaCreative,
  matchesGalleryFilter,
} from "../creatives";
import type { CreativeSummary } from "@ownmyownai/protocol";

function creative(kind: CreativeSummary["kind"], id = "1"): CreativeSummary {
  return {
    id,
    title: "Test",
    kind,
    filename: "file.bin",
    savedAt: "2026-01-01T00:00:00Z",
  };
}

describe("creatives gallery helpers", () => {
  it("labels creative kinds in French", () => {
    expect(creativeKindLabel("markdown")).toBe("Document");
    expect(creativeKindLabel("image")).toBe("Image");
    expect(creativeKindLabel("audio")).toBe("Audio");
    expect(creativeKindLabel("video")).toBe("Vidéo");
  });

  it("filters gallery items by media type", () => {
    expect(matchesGalleryFilter("image", "images")).toBe(true);
    expect(matchesGalleryFilter("markdown", "images")).toBe(false);
    expect(matchesGalleryFilter("audio", "all")).toBe(true);
  });

  it("formats byte sizes", () => {
    expect(formatCreativeBytes(512)).toBe("512 o");
    expect(formatCreativeBytes(2048)).toBe("2.0 Ko");
    expect(formatCreativeBytes(5 * 1024 * 1024)).toBe("5.0 Mo");
  });

  it("filtre les créations média", () => {
    const items = [
      creative("markdown", "md"),
      creative("image", "img"),
      creative("audio", "aud"),
      creative("video", "vid"),
      creative("other", "oth"),
    ];
    expect(filterMediaCreatives(items).map((i) => i.id)).toEqual(["img", "aud", "vid"]);
    expect(isMediaCreative(creative("image"))).toBe(true);
    expect(isMediaCreative(creative("markdown"))).toBe(false);
  });
});
