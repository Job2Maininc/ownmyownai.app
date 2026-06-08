import { describe, expect, it } from "vitest";
import { formatShortcutLabel, isEditableTarget, matchesShortcut } from "../keyboard-shortcuts";

function keyEvent(
  key: string,
  options: { ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean; altKey?: boolean } = {},
) {
  return {
    key,
    ctrlKey: options.ctrlKey ?? false,
    metaKey: options.metaKey ?? false,
    shiftKey: options.shiftKey ?? false,
    altKey: options.altKey ?? false,
  } as KeyboardEvent;
}

describe("matchesShortcut", () => {
  it("matches mod+k", () => {
    expect(matchesShortcut(keyEvent("k", { ctrlKey: true }), { key: "k", mod: true })).toBe(true);
    expect(matchesShortcut(keyEvent("k", { metaKey: true }), { key: "k", mod: true })).toBe(true);
    expect(matchesShortcut(keyEvent("k"), { key: "k", mod: true })).toBe(false);
  });

  it("matches ctrl+enter", () => {
    expect(
      matchesShortcut(keyEvent("Enter", { ctrlKey: true }), { key: "Enter", mod: true }),
    ).toBe(true);
    expect(matchesShortcut(keyEvent("Enter"), { key: "Enter", mod: true })).toBe(false);
  });

  it("is case-insensitive for letter keys", () => {
    expect(matchesShortcut(keyEvent("K", { ctrlKey: true }), { key: "k", mod: true })).toBe(true);
  });
});

describe("formatShortcutLabel", () => {
  it("formats ctrl+k on non-mac platforms", () => {
    const original = navigator.platform;
    Object.defineProperty(navigator, "platform", {
      configurable: true,
      value: "Win32",
    });

    expect(formatShortcutLabel({ key: "k", mod: true })).toBe("Ctrl+K");

    Object.defineProperty(navigator, "platform", {
      configurable: true,
      value: original,
    });
  });
});
