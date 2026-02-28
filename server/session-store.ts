/**
 * Session store: AES-256-GCM encrypted key storage backed by a JSON file.
 * No external dependencies — uses built-in node:crypto and node:fs.
 *
 * Encryption key: set KEY_ENCRYPTION_KEY env var to a 64-char hex string (32 bytes).
 * If not set, a deterministic dev key is derived from a fixed string (dev mode only).
 */

import { randomUUID, createCipheriv, createDecipheriv, randomBytes, createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const STORE_PATH = path.join(process.cwd(), 'sessions.json');
const SESSION_TTL_MS = 90 * 24 * 60 * 60 * 1000; // 90 days

interface EncryptedValue {
  iv: string;
  tag: string;
  data: string;
}

interface SessionData {
  createdAt: number;
  lastSeen: number;
  keys: Record<string, EncryptedValue>;
}

interface Store {
  sessions: Record<string, SessionData>;
}

function getEncryptionKey(): Buffer {
  const raw = process.env.KEY_ENCRYPTION_KEY || '';
  if (raw.length === 64) {
    // Treat as 32-byte hex key
    return Buffer.from(raw, 'hex');
  }
  // Derive 32-byte key from arbitrary string via SHA-256
  const seed = raw || 'nodelings-dev-only-not-for-production';
  if (!raw) {
    console.warn('[session-store] KEY_ENCRYPTION_KEY not set — using insecure dev key. Set this in .env for production!');
  }
  return createHash('sha256').update(seed).digest();
}

let _store: Store | null = null;

function loadStore(): Store {
  if (_store) return _store;
  if (existsSync(STORE_PATH)) {
    try {
      _store = JSON.parse(readFileSync(STORE_PATH, 'utf8')) as Store;
      return _store;
    } catch {
      // Corrupt store — start fresh
    }
  }
  _store = { sessions: {} };
  return _store;
}

function saveStore(store: Store) {
  _store = store;
  try {
    writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), 'utf8');
  } catch (err) {
    console.error('[session-store] Failed to write sessions.json:', err);
  }
}

function encrypt(value: string): EncryptedValue {
  const key = getEncryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    iv: iv.toString('hex'),
    tag: tag.toString('hex'),
    data: encrypted.toString('hex'),
  };
}

function decrypt(enc: EncryptedValue): string {
  const key = getEncryptionKey();
  const decipher = createDecipheriv(
    'aes-256-gcm',
    key,
    Buffer.from(enc.iv, 'hex'),
  );
  decipher.setAuthTag(Buffer.from(enc.tag, 'hex'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(enc.data, 'hex')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}

function pruneExpired(store: Store) {
  const now = Date.now();
  for (const [id, session] of Object.entries(store.sessions)) {
    if (now - session.lastSeen > SESSION_TTL_MS) {
      delete store.sessions[id];
    }
  }
}

/** Create a new anonymous session. Returns the session token (UUID). */
export function createSession(): string {
  const id = randomUUID();
  const store = loadStore();
  pruneExpired(store);
  store.sessions[id] = { createdAt: Date.now(), lastSeen: Date.now(), keys: {} };
  saveStore(store);
  return id;
}

/** Touch a session's lastSeen timestamp. Returns false if session doesn't exist. */
export function touchSession(id: string): boolean {
  const store = loadStore();
  const session = store.sessions[id];
  if (!session) return false;
  session.lastSeen = Date.now();
  saveStore(store);
  return true;
}

/** Validate that a session exists (and update its lastSeen). */
export function sessionExists(id: string): boolean {
  return touchSession(id);
}

/**
 * Encrypt and store key(s) for a session.
 * Pass empty string to remove a key.
 */
export function setKeys(sessionId: string, keys: Record<string, string>): boolean {
  const store = loadStore();
  const session = store.sessions[sessionId];
  if (!session) return false;
  for (const [service, value] of Object.entries(keys)) {
    if (value) {
      session.keys[service] = encrypt(value);
    } else {
      delete session.keys[service];
    }
  }
  session.lastSeen = Date.now();
  saveStore(store);
  return true;
}

/** Remove a specific key from a session. */
export function clearKey(sessionId: string, service: string): boolean {
  const store = loadStore();
  const session = store.sessions[sessionId];
  if (!session) return false;
  delete session.keys[service];
  saveStore(store);
  return true;
}

/** Retrieve a decrypted key. Returns null if not found or decryption fails. */
export function getKey(sessionId: string, service: string): string | null {
  const store = loadStore();
  const session = store.sessions[sessionId];
  if (!session || !session.keys[service]) return null;
  try {
    return decrypt(session.keys[service]);
  } catch {
    return null;
  }
}

/** Return which services have keys stored (without exposing the key values). */
export function getKeyStatus(sessionId: string): Record<string, boolean> {
  const store = loadStore();
  const session = store.sessions[sessionId];
  if (!session) return {};
  const result: Record<string, boolean> = {};
  for (const service of Object.keys(session.keys)) {
    result[service] = true;
  }
  return result;
}
