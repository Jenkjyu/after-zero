const crypto = require("crypto");
const https = require("https");

const APPLE_ISSUER = "https://appleid.apple.com";
const APPLE_KEYS_URL = "https://appleid.apple.com/auth/keys";
const MAX_TOKEN_BYTES = 32 * 1024;
const KEY_CACHE_MS = 60 * 60 * 1000;

let cachedKeys = null;
let cachedKeysAt = 0;

function base64urlDecode(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]+$/.test(value)) {
    throw authError("TOKEN_MALFORMED", "Apple 身份令牌格式无效");
  }
  return Buffer.from(value, "base64url");
}

function parseJSONSegment(value) {
  try {
    return JSON.parse(base64urlDecode(value).toString("utf8"));
  } catch (error) {
    if (error && error.code) throw error;
    throw authError("TOKEN_MALFORMED", "Apple 身份令牌格式无效");
  }
}

function authError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function sha256Hex(value) {
  return crypto.createHash("sha256").update(String(value), "utf8").digest("hex");
}

function httpGetJSON(url) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, { timeout: 5000 }, (response) => {
      if (response.statusCode !== 200) {
        response.resume();
        reject(authError("APPLE_KEYS_UNAVAILABLE", `Apple 公钥服务返回 ${response.statusCode || "未知状态"}`));
        return;
      }
      let size = 0;
      const chunks = [];
      response.on("data", (chunk) => {
        size += chunk.length;
        if (size > MAX_TOKEN_BYTES) {
          request.destroy(authError("APPLE_KEYS_UNAVAILABLE", "Apple 公钥响应过大"));
          return;
        }
        chunks.push(chunk);
      });
      response.on("end", () => {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
        } catch (error) {
          reject(authError("APPLE_KEYS_UNAVAILABLE", "Apple 公钥响应无效"));
        }
      });
    });
    request.on("timeout", () => request.destroy(authError("APPLE_KEYS_UNAVAILABLE", "Apple 公钥请求超时")));
    request.on("error", reject);
  });
}

async function getAppleKeys(fetchKeys = () => httpGetJSON(APPLE_KEYS_URL), nowMs = Date.now()) {
  if (cachedKeys && nowMs - cachedKeysAt < KEY_CACHE_MS) return cachedKeys;
  const result = await fetchKeys();
  if (!result || !Array.isArray(result.keys) || result.keys.length === 0) {
    throw authError("APPLE_KEYS_UNAVAILABLE", "Apple 未返回可用公钥");
  }
  cachedKeys = result.keys;
  cachedKeysAt = nowMs;
  return cachedKeys;
}

function verifySignature(algorithm, signingInput, signature, jwk) {
  let key;
  try {
    key = crypto.createPublicKey({ key: jwk, format: "jwk" });
  } catch (error) {
    throw authError("TOKEN_SIGNATURE_INVALID", "Apple 公钥格式无效");
  }
  if (algorithm === "RS256") {
    return crypto.verify("RSA-SHA256", Buffer.from(signingInput), key, signature);
  }
  if (algorithm === "ES256") {
    return crypto.verify(
      "sha256",
      Buffer.from(signingInput),
      { key, dsaEncoding: "ieee-p1363" },
      signature
    );
  }
  return false;
}

async function verifyAppleIdentityToken(identityToken, rawNonce, clientId, options = {}) {
  if (typeof identityToken !== "string" || identityToken.length === 0 || identityToken.length > MAX_TOKEN_BYTES) {
    throw authError("TOKEN_MALFORMED", "Apple 身份令牌缺失或过大");
  }
  if (typeof rawNonce !== "string" || rawNonce.length < 32 || rawNonce.length > 256) {
    throw authError("NONCE_INVALID", "Apple 登录 nonce 无效");
  }
  if (typeof clientId !== "string" || !clientId) {
    throw authError("SERVER_CONFIG_INVALID", "Apple 登录服务未配置 client id");
  }

  const parts = identityToken.split(".");
  if (parts.length !== 3) throw authError("TOKEN_MALFORMED", "Apple 身份令牌格式无效");
  const header = parseJSONSegment(parts[0]);
  const claims = parseJSONSegment(parts[1]);
  const signature = base64urlDecode(parts[2]);

  if (!header || !header.kid || (header.alg !== "RS256" && header.alg !== "ES256")) {
    throw authError("TOKEN_ALGORITHM_INVALID", "Apple 身份令牌算法无效");
  }
  const keys = options.keys || await getAppleKeys(options.fetchKeys, options.nowMs);
  const jwk = keys.find((item) => item && item.kid === header.kid && (!item.alg || item.alg === header.alg));
  if (!jwk || !verifySignature(header.alg, `${parts[0]}.${parts[1]}`, signature, jwk)) {
    throw authError("TOKEN_SIGNATURE_INVALID", "Apple 身份令牌签名无效");
  }

  const nowSeconds = Math.floor((options.nowMs ?? Date.now()) / 1000);
  const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (claims.iss !== APPLE_ISSUER) throw authError("TOKEN_ISSUER_INVALID", "Apple 身份令牌签发方无效");
  if (!audience.includes(clientId)) throw authError("TOKEN_AUDIENCE_INVALID", "Apple 身份令牌 audience 无效");
  if (!Number.isFinite(claims.exp) || nowSeconds >= claims.exp) {
    throw authError("TOKEN_EXPIRED", "Apple 身份令牌已过期");
  }
  if (Number.isFinite(claims.iat) && claims.iat > nowSeconds + 300) {
    throw authError("TOKEN_IAT_INVALID", "Apple 身份令牌签发时间无效");
  }
  if (claims.nonce !== sha256Hex(rawNonce)) {
    throw authError("NONCE_MISMATCH", "Apple 登录 nonce 校验失败");
  }
  if (typeof claims.sub !== "string" || claims.sub.length === 0 || claims.sub.length > 255) {
    throw authError("TOKEN_SUB_INVALID", "Apple 身份标识无效");
  }
  return claims;
}

function resetKeyCacheForTests() {
  cachedKeys = null;
  cachedKeysAt = 0;
}

module.exports = {
  APPLE_ISSUER,
  authError,
  resetKeyCacheForTests,
  sha256Hex,
  verifyAppleIdentityToken,
};
