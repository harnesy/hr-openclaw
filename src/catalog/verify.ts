// Signature checks of the catalog: Ed25519 over the exact bytes of feed.json, and the compact JWS that signs a
// bundle's manifest. Node's built-in crypto does the mathematics.
import { createHash, createPublicKey, verify } from "node:crypto";
import { decodeClaims, obj, parseJSON, str } from "./decode.ts";
import type { Claims, Key } from "./types.ts";
import { Refusal } from "./types.ts";
import { clip } from "./grammar.ts";
import { trimSpace } from "../gotext.ts";

/** The SHA-256 of b in hex. */
export function hexSum(b: Uint8Array): string {
  return createHash("sha256").update(b).digest("hex");
}

// The fixed head of an Ed25519 public key in SubjectPublicKeyInfo form; the raw 32 bytes follow it.
const SPKI_HEAD = Buffer.from("302a300506032b6570032100", "hex");

function ed25519Verify(pub: Uint8Array, message: Uint8Array, sig: Uint8Array): boolean {
  if (pub.length !== 32 || sig.length !== 64) return false;
  try {
    const key = createPublicKey({ key: Buffer.concat([SPKI_HEAD, pub]), format: "der", type: "spki" });
    return verify(null, message, key, sig);
  } catch {
    return false;
  }
}

/** Standard base64 with padding, as it is written; null when the text is anything else. */
export function base64Std(s: string): Buffer | null {
  s = s.replace(/[\r\n]/g, "");
  if (s.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(s)) return null;
  return Buffer.from(s, "base64");
}

/** URL-safe base64 without padding, as a JWS writes it; null when the text is anything else. */
function base64Url(s: string): Buffer | null {
  s = s.replace(/[\r\n]/g, "");
  if (s.length % 4 === 1 || !/^[A-Za-z0-9_-]*$/.test(s)) return null;
  return Buffer.from(s, "base64url");
}

/** Reads feed.json.sig ({"kid","sig"}) far enough to say which key signed the feed. */
export function feedSigKid(sig: Uint8Array): string {
  return str(obj(parseJSON(sig, "feed.json.sig"), "feed.json.sig"), "kid", "feed.json.sig");
}

/**
 * Checks feed.json.sig ({"kid","sig"}): sig is the Ed25519 signature of the exact bytes of feed.json, in standard
 * base64, by the key the signature names.
 */
export function verifyFeedSig(key: Key, feed: Uint8Array, sig: Uint8Array): void {
  const s = obj(parseJSON(sig, "feed.json.sig"), "feed.json.sig");
  const kid = str(s, "kid", "feed.json.sig");
  if (kid !== key.kid) throw new Refusal(`feed.json.sig: kid ${clip(kid)}, want ${clip(key.kid)}`);
  const raw = base64Std(str(s, "sig", "feed.json.sig"));
  if (raw === null || !ed25519Verify(key.pub, feed, raw)) throw new Refusal("feed.json.sig does not verify");
}

/** Checks signatures/catalog.jws, a compact JWS signed with EdDSA by the catalog key, and returns its claims. */
export function verifyJWS(key: Key, token: Uint8Array | undefined): Claims {
  // The token is read as bytes: the signature covers the first two parts exactly as they are written.
  const parts = Buffer.from(token ?? new Uint8Array()).toString("latin1").split(".");
  if (parts.length !== 3) throw new Refusal("catalog.jws: not a compact JWS");
  const [head, payload, sig] = parts.map(base64Url);
  if (!head || !payload || !sig) throw new Refusal("catalog.jws: not base64url");
  let alg = "", kid = "";
  try {
    const h = obj(parseJSON(head, "catalog.jws header"), "catalog.jws header");
    alg = str(h, "alg", "catalog.jws header");
    kid = str(h, "kid", "catalog.jws header");
  } catch {
    throw new Refusal("catalog.jws: header is not read");
  }
  if (alg !== "EdDSA" || kid !== key.kid) throw new Refusal(`catalog.jws: header alg ${clip(alg)}, kid ${clip(kid)}`);
  if (!ed25519Verify(key.pub, Buffer.from(`${parts[0]}.${parts[1]}`, "latin1"), sig)) {
    throw new Refusal("catalog.jws does not verify");
  }
  return decodeClaims(payload);
}

/** Reads a catalog public key as it is handed out: the base64 of the raw 32-byte Ed25519 key. */
export function parseKey(kid: string, b64: string): Key {
  const pub = base64Std(trimSpace(b64));
  if (pub === null || pub.length !== 32 || kid === "") {
    throw new Refusal("catalog key: want a kid and the base64 of the raw 32-byte Ed25519 public key");
  }
  return { kid, pub };
}
