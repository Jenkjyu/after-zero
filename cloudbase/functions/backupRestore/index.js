const cloudbase = require("@cloudbase/node-sdk");

const app = cloudbase.init({ env: cloudbase.SYMBOL_CURRENT_ENV });
const db = app.database();

// 不信任客户端传来的openid——身份来自已认证会话，doc本身归属谁靠这里显式核对
// record.openid === customUserId，而不是假设"能传对id就有权限看"（备份记录的_id
// 本身不是私密凭证，必须在服务端二次校验归属）。
exports.main = async (event) => {
  const auth = app.auth();
  const { customUserId } = auth.getUserInfo();
  if (!customUserId) return { ok: false, error: "未登录，无法恢复备份" };

  const { backupId } = event;
  if (!backupId) return { ok: false, error: "缺少backupId" };

  const backups = db.collection("backups");
  const result = await backups.doc(backupId).get();
  if (!result.data || !result.data.length) return { ok: false, error: "备份记录不存在" };
  const record = result.data[0];
  if (record.openid !== customUserId) return { ok: false, error: "无权访问该备份" };

  let files = [];
  if (Array.isArray(record.files) && record.files.length) {
    const fileList = record.files.map((f) => f.fileID).filter(Boolean);
    let urlMap = {};
    if (fileList.length) {
      const r = await app.getTempFileURL({ fileList });
      (r.fileList || []).forEach((f) => {
        urlMap[f.fileID] = f.tempFileURL;
      });
    }
    files = record.files.map((f) => ({ id: f.id, name: f.name, mime: f.mime, tempURL: urlMap[f.fileID] || "" }));
  }

  return {
    ok: true,
    data: {
      createdAt: record.createdAt || 0,
      debts: record.debts || [],
      docs: record.docs || [],
      notify: record.notify || { enabled: false, rules: [] },
      premium: record.premium || { premium: null, premiumPlus: null },
      files,
    },
  };
};
