import { describe, it, expect } from "vitest";
import { parseNodeKeys } from "@/server/commitParser";

describe("Commit Parser Unit Tests (Task 06.3)", () => {
  describe("Single node ID extraction", () => {
    it("extracts node key from start of commit title", () => {
      const keys = parseNodeKeys("[01.1] Initial project setup");
      expect(keys).toEqual(["01.1"]);
    });

    it("extracts node key from within conventional commit prefix", () => {
      const keys = parseNodeKeys("feat: [02.3] Add user authentication");
      expect(keys).toEqual(["02.3"]);
    });

    it("extracts node key at the end of message line", () => {
      const keys = parseNodeKeys("Refactor database schema for [10.5]");
      expect(keys).toEqual(["10.5"]);
    });

    it("extracts node key with up to 3 task digits", () => {
      const keys = parseNodeKeys("feat: [05.123] High node index");
      expect(keys).toEqual(["05.123"]);
    });
  });

  describe("Multiple node IDs extraction", () => {
    it("extracts multiple node keys in order of appearance", () => {
      const keys = parseNodeKeys("[01.1] [01.2] Implement base utilities");
      expect(keys).toEqual(["01.1", "01.2"]);
    });

    it("extracts interleaved multiple node keys", () => {
      const keys = parseNodeKeys(
        "feat: [01.1] setup and [02.1] database connection",
      );
      expect(keys).toEqual(["01.1", "02.1"]);
    });

    it("extracts 4+ node keys on a single line", () => {
      const keys = parseNodeKeys("[01.1] [01.2] [02.1] [03.1] Global refactor");
      expect(keys).toEqual(["01.1", "01.2", "02.1", "03.1"]);
    });
  });

  describe("Deduplication & uniqueness", () => {
    it("deduplicates repeated node keys preserving first appearance order", () => {
      const keys = parseNodeKeys(
        "[01.1] update [01.2] and re-apply [01.1] fixes",
      );
      expect(keys).toEqual(["01.1", "01.2"]);
    });

    it("handles multiple identical tokens", () => {
      const keys = parseNodeKeys("[05.1] [05.1] [05.1]");
      expect(keys).toEqual(["05.1"]);
    });
  });

  describe("First line restriction (multiline commits)", () => {
    it("only parses node keys from the first line and ignores subsequent lines", () => {
      const message =
        "[01.1] Main header\n[02.1] Sub-task description\n[03.1] Another note";
      expect(parseNodeKeys(message)).toEqual(["01.1"]);
    });

    it("ignores node keys when first line has none, even if body has them", () => {
      const message =
        "Regular commit title without IDs\n\n[01.1] Mentioned in body paragraph";
      expect(parseNodeKeys(message)).toEqual([]);
    });

    it("handles Windows CRLF line breaks correctly", () => {
      const message = "[04.2] Windows style commit\r\n\r\n[05.1] Ignored body";
      expect(parseNodeKeys(message)).toEqual(["04.2"]);
    });
  });

  describe("Malformed tokens and non-matching formats", () => {
    it("ignores tokens with single-digit phase", () => {
      expect(parseNodeKeys("[1.1] Invalid single digit phase")).toEqual([]);
    });

    it("ignores tokens with sub-sub-node notation", () => {
      expect(parseNodeKeys("[01.1.2] Invalid sub-level")).toEqual([]);
    });

    it("ignores non-numeric bracketed tokens", () => {
      expect(parseNodeKeys("[feat] [WIP] [core] Regular tags")).toEqual([]);
    });

    it("ignores tokens without closing brackets", () => {
      expect(parseNodeKeys("[01.1 Unclosed bracket")).toEqual([]);
    });

    it("ignores tokens without opening brackets", () => {
      expect(parseNodeKeys("01.1] Unopened bracket")).toEqual([]);
    });

    it("ignores tokens with parentheses or braces", () => {
      expect(parseNodeKeys("(01.1) {01.1} Wrong bracket types")).toEqual([]);
    });

    it("ignores tokens with more than 3 task digits", () => {
      expect(parseNodeKeys("[01.1234] Exceeds 3 digits")).toEqual([]);
    });
  });

  describe("Edge cases and robust inputs", () => {
    it("returns empty array for empty string", () => {
      expect(parseNodeKeys("")).toEqual([]);
    });

    it("returns empty array for whitespace-only string", () => {
      expect(parseNodeKeys("   \t  \n  ")).toEqual([]);
    });

    it("returns empty array for non-string inputs safely", () => {
      expect(parseNodeKeys(null as unknown as string)).toEqual([]);
      expect(parseNodeKeys(undefined as unknown as string)).toEqual([]);
      expect(parseNodeKeys(123 as unknown as string)).toEqual([]);
    });

    it("handles unicode and emojis around bracketed tokens", () => {
      const keys = parseNodeKeys("✨ feat: [01.1] Add 🚀 rocket support");
      expect(keys).toEqual(["01.1"]);
    });
  });
});
