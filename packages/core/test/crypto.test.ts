import { beforeAll, describe, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";

// crypto.ts reads ENCRYPTION_KEY on first use and depends on nothing else, so
// this is the entire setup the module needs.
process.env.ENCRYPTION_KEY = randomBytes(32).toString("base64");

let encrypt: (s: string) => Buffer;
let decrypt: (b: Buffer) => string;

beforeAll(async () => {
  ({ encrypt, decrypt } = await import("../src/lib/crypto.ts"));
});

describe("token encryption", () => {
  test("round-trips a token", () => {
    const token = "ghu_" + randomBytes(24).toString("hex");
    expect(decrypt(encrypt(token))).toBe(token);
  });

  test("never emits the plaintext in the ciphertext", () => {
    const token = "ghu_supersecretvalue";
    expect(encrypt(token).toString("utf8")).not.toContain(token);
  });

  test("uses a fresh IV, so the same token encrypts differently each time", () => {
    const token = "ghu_repeated";
    expect(encrypt(token).equals(encrypt(token))).toBe(false);
  });

  test("rejects a tampered payload rather than returning garbage", () => {
    const payload = encrypt("ghu_tampered");
    payload[payload.length - 1] ^= 0xff;
    expect(() => decrypt(payload)).toThrow();
  });

  test("rejects a truncated payload", () => {
    expect(() => decrypt(Buffer.alloc(8))).toThrow(/too short/i);
  });
});

describe("encryption key validation", () => {
  test("rejects a key that is not 32 bytes", async () => {
    const original = process.env.ENCRYPTION_KEY;
    try {
      process.env.ENCRYPTION_KEY = randomBytes(16).toString("base64");
      // A fresh import is required: the key is cached after first use.
      const fresh = await import(`../src/lib/crypto.ts?short-key`);
      expect(() => fresh.encrypt("x")).toThrow(/32 bytes/);
    } finally {
      process.env.ENCRYPTION_KEY = original;
    }
  });

  test("reports a missing key clearly rather than failing deep in node:crypto", async () => {
    const original = process.env.ENCRYPTION_KEY;
    try {
      delete process.env.ENCRYPTION_KEY;
      const fresh = await import(`../src/lib/crypto.ts?absent-key`);
      expect(() => fresh.encrypt("x")).toThrow(/ENCRYPTION_KEY is not set/);
    } finally {
      process.env.ENCRYPTION_KEY = original;
    }
  });
});
