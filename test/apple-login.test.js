const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");

const {
  APPLE_ISSUER,
  sha256Hex,
  verifyAppleIdentityToken,
} = require("../cloudbase/functions/appleLogin/verifyAppleToken");
const { consumeNonceOnce } = require("../cloudbase/functions/appleLogin/replayGuard");

const clientId = "io.github.jenkjyu.afterzero";
const nowMs = Date.parse("2026-08-12T10:00:00.000Z");
const rawNonce = "nonce-value-that-is-longer-than-thirty-two-characters";
const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
const publicJwk = { ...publicKey.export({ format: "jwk" }), kid: "test-key", alg: "RS256", use: "sig" };

function encode(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function makeToken(claimOverrides = {}, signingKey = privateKey) {
  const header = encode({ kid: "test-key", alg: "RS256", typ: "JWT" });
  const payload = encode({
    iss: APPLE_ISSUER,
    aud: clientId,
    exp: Math.floor(nowMs / 1000) + 300,
    iat: Math.floor(nowMs / 1000),
    sub: "apple-user-123",
    nonce: sha256Hex(rawNonce),
    email: "relay@example.com",
    ...claimOverrides,
  });
  const signature = crypto.sign("RSA-SHA256", Buffer.from(`${header}.${payload}`), signingKey).toString("base64url");
  return `${header}.${payload}.${signature}`;
}

test("Apple token校验通过签名、issuer、audience、过期时间和nonce后只返回服务端claims", async () => {
  const claims = await verifyAppleIdentityToken(makeToken(), rawNonce, clientId, {
    keys: [publicJwk],
    nowMs,
  });
  assert.equal(claims.sub, "apple-user-123");
  assert.equal(claims.email, "relay@example.com");
});

test("Apple token拒绝伪造签名", async () => {
  const forged = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
  await assert.rejects(
    verifyAppleIdentityToken(makeToken({}, forged.privateKey), rawNonce, clientId, { keys: [publicJwk], nowMs }),
    (error) => error.code === "TOKEN_SIGNATURE_INVALID"
  );
});

test("Apple token拒绝过期token", async () => {
  await assert.rejects(
    verifyAppleIdentityToken(makeToken({ exp: Math.floor(nowMs / 1000) - 1 }), rawNonce, clientId, { keys: [publicJwk], nowMs }),
    (error) => error.code === "TOKEN_EXPIRED"
  );
});

test("Apple token拒绝错误audience", async () => {
  await assert.rejects(
    verifyAppleIdentityToken(makeToken({ aud: "com.example.other" }), rawNonce, clientId, { keys: [publicJwk], nowMs }),
    (error) => error.code === "TOKEN_AUDIENCE_INVALID"
  );
});

test("Apple token拒绝错误nonce", async () => {
  await assert.rejects(
    verifyAppleIdentityToken(makeToken({ nonce: sha256Hex("different-nonce-value-that-is-long-enough") }), rawNonce, clientId, { keys: [publicJwk], nowMs }),
    (error) => error.code === "NONCE_MISMATCH"
  );
});

test("Apple token拒绝错误issuer", async () => {
  await assert.rejects(
    verifyAppleIdentityToken(makeToken({ iss: "https://example.com" }), rawNonce, clientId, { keys: [publicJwk], nowMs }),
    (error) => error.code === "TOKEN_ISSUER_INVALID"
  );
});

test("同一Apple token nonce只能消费一次，重放会被原子事务拒绝", async () => {
  const documents = new Map();
  const db = {
    runTransaction: async (callback) => callback({
      collection: (name) => ({
        doc: (id) => ({
          get: async () => ({ data: documents.has(`${name}/${id}`) ? [documents.get(`${name}/${id}`)] : [] }),
          set: async (value) => { documents.set(`${name}/${id}`, value); },
        }),
      }),
    }),
  };
  const claims = { sub: "apple-user-123", exp: Math.floor(nowMs / 1000) + 300 };
  await consumeNonceOnce(db, claims, rawNonce, "u_internal", nowMs);
  await assert.rejects(
    consumeNonceOnce(db, claims, rawNonce, "u_internal", nowMs + 1),
    (error) => error.code === "TOKEN_REPLAYED"
  );
  assert.equal([...documents.values()][0].userId, "u_internal");
});
