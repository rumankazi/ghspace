import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const TAG_BYTES = 16;

let cachedKey: Buffer | undefined;

/**
 * Reads `ENCRYPTION_KEY` straight from the environment rather than through
 * `env()`. Encryption depends on exactly one variable, and routing it through
 * the full schema would mean every unrelated required setting — a GitHub App
 * slug, a database URL — becomes a prerequisite for encrypting a string.
 *
 * `env()` still lists `ENCRYPTION_KEY`, so a misconfigured deployment is caught
 * at startup either way.
 */
function key(): Buffer {
  if (cachedKey) return cachedKey;

  const configured = process.env.ENCRYPTION_KEY;
  if (!configured) {
    throw new Error(
      "ENCRYPTION_KEY is not set. Generate one with: openssl rand -base64 32",
    );
  }

  const raw = Buffer.from(configured, "base64");
  if (raw.length !== 32) {
    throw new Error(
      `ENCRYPTION_KEY must decode to 32 bytes, got ${raw.length}. Generate one with: openssl rand -base64 32`,
    );
  }
  cachedKey = raw;
  return cachedKey;
}

/**
 * Encrypts a GitHub token for storage. Layout is `iv || authTag || ciphertext`
 * in a single buffer so the database column stays one opaque `bytea` and there
 * is no way to persist the ciphertext while losing the tag that authenticates it.
 */
export function encrypt(plaintext: string): Buffer {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]);
}

/**
 * Throws if the payload was tampered with or was encrypted under a different
 * key. Callers should treat a throw as "credentials unusable, re-authorise"
 * rather than retrying.
 */
export function decrypt(payload: Buffer): string {
  if (payload.length <= IV_BYTES + TAG_BYTES) {
    throw new Error("Encrypted payload is too short to be valid");
  }
  const iv = payload.subarray(0, IV_BYTES);
  const tag = payload.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
  const ciphertext = payload.subarray(IV_BYTES + TAG_BYTES);

  const decipher = createDecipheriv(ALGORITHM, key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}
