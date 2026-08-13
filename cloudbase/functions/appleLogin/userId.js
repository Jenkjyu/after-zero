const crypto = require("crypto");

const CUSTOM_USER_ID_RE = /^[A-Za-z0-9_\-#@(){}\[\]:.,<>+#~]{4,32}$/;

function isValidCustomUserId(userId) {
  return typeof userId === "string" && CUSTOM_USER_ID_RE.test(userId);
}

function newAppleUserId() {
  return `a_${crypto.randomBytes(15).toString("hex")}`;
}

function migratedAppleUserId(appleSub) {
  return `a_${crypto.createHash("sha256").update(`apple-user:${appleSub}`, "utf8").digest("hex").slice(0, 30)}`;
}

module.exports = { isValidCustomUserId, newAppleUserId, migratedAppleUserId };
