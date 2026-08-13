const cloudbase = require("@cloudbase/node-sdk");

const app = cloudbase.init({ env: cloudbase.SYMBOL_CURRENT_ENV });
const db = app.database();

async function isMergedSession(userId) {
  const result = await db.collection("users").where({ userId }).limit(1).get();
  const user = result.data && result.data[0];
  return Boolean(user && user.mergedInto);
}

// 云备份现在是"手动创建一条、可以单独恢复"的多条记录模型，不是自动同步覆盖单一文档——
// 每次调用这个函数都会新增一条独立的备份记录（db.add()，不是update单个doc）。
// 二进制文件由backupUploadFile单独上传，这里只接收上传成功后返回的{id,name,mime,size,fileID}
// 元数据列表，不接收base64。
// 每用户配额：最多保留MAX_BACKUPS条、总大小不超过MAX_TOTAL_BYTES——写入新记录后，
// 从最老的开始自动清掉超出配额的部分（含清对应的Storage文件）。
const MAX_BACKUPS = 20;
const MAX_TOTAL_BYTES = 300 * 1024 * 1024; // 300MB

exports.main = async (event) => {
  const auth = app.auth();
  const { customUserId: userId } = auth.getUserInfo();
  if (!userId) return { ok: false, error: "未登录，无法备份" };
  if (await isMergedSession(userId)) return { ok: false, code: "ACCOUNT_MERGED_RELOGIN_REQUIRED", error: "该账号已合并，请重新登录后继续使用" };

  const debts = Array.isArray(event.debts) ? event.debts : [];
  const docs = Array.isArray(event.docs) ? event.docs : [];
  const notify = event.notify || { enabled: false, rules: [] };
  const premium = event.premium || { premium: null, premiumPlus: null };
  const files = Array.isArray(event.files) ? event.files : [];

  const jsonBytes = Buffer.byteLength(JSON.stringify({ debts, docs, notify, premium }), "utf8");
  const filesBytes = files.reduce((s, f) => s + (f.size || 0), 0);
  const totalSizeBytes = jsonBytes + filesBytes;
  if (totalSizeBytes > MAX_TOTAL_BYTES) {
    return { ok: false, error: "这份备份内容超过云备份总容量上限，无法保存" };
  }

  const backups = db.collection("backups");
  const now = Date.now();
  const addResult = await backups.add({
    userId,
    createdAt: now,
    debts,
    docs,
    notify,
    premium,
    files,
    totalSizeBytes,
    debtsCount: debts.length,
    filesCount: files.length,
  });

  // 配额清理：按创建时间正序取出这个用户的全部备份，超过条数/总字节数就从最老的开始删。
  const current = await backups.where({ userId }).orderBy("createdAt", "asc").get();
  const legacy = await backups.where({ openid: userId }).orderBy("createdAt", "asc").get();
  const seen = new Set();
  let list = [...(current.data || []), ...(legacy.data || [])]
    .filter((record) => record && !seen.has(record._id) && seen.add(record._id))
    .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  let totalBytes = list.reduce((s, r) => s + (r.totalSizeBytes || 0), 0);
  while (list.length > MAX_BACKUPS || totalBytes > MAX_TOTAL_BYTES) {
    const oldest = list.shift();
    if (!oldest) break;
    const fileIDs = (oldest.files || []).map((f) => f.fileID).filter(Boolean);
    if (fileIDs.length) {
      try {
        await app.deleteFile({ fileList: fileIDs });
      } catch (e) {
        // 文件可能已经不在了，忽略，不阻塞配额清理
      }
    }
    await backups.doc(oldest._id).remove();
    totalBytes -= oldest.totalSizeBytes || 0;
  }

  return { ok: true, backupId: addResult.id };
};
