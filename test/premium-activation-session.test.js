const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const host = fs.readFileSync("www/index.html", "utf8");

function hostFunction(name, nextMarker, context) {
  const start = host.indexOf("  function " + name + "(");
  const end = host.indexOf(nextMarker, start);
  assert.ok(start >= 0 && end > start, name + " should exist in the Web host");
  vm.runInNewContext(host.slice(start, end), context);
  return context[name];
}

function activationHarness(options = {}) {
  const calls = [];
  const context = {
    account: options.account === undefined ? { userId: "wechat-user" } : options.account,
    cbAuth: () => ({
      getLoginState: () => Promise.resolve(options.loginState === undefined ? null : options.loginState),
      getCredentials: () => options.credentialsError
        ? Promise.reject(options.credentialsError)
        : Promise.resolve(options.credentials === undefined ? null : options.credentials),
    }),
    currentPlatform: () => "android",
    requestCloudLogin: (purpose, force) => {
      calls.push(["login", purpose, force]);
      return Promise.resolve(options.loginResult === undefined ? true : options.loginResult);
    },
    callPremiumEntitlement: (data) => {
      calls.push(["activate", data.action, data.code]);
      return Promise.resolve({ active: true });
    },
    toast: (message) => calls.push(["toast", message]),
  };
  return { activate: hostFunction("activatePremiumCode", "\n  // ===== AI 债务助手", context), calls };
}

test("本机有账户但云端凭证丢失时，先重新微信登录再激活", async () => {
  const { activate, calls } = activationHarness();
  assert.equal(await activate("0000"), true);
  assert.deepEqual(calls.slice(0, 2), [
    ["login", "激活 Premium", true],
    ["activate", "activateAndroidCode", "0000"],
  ]);
});

test("匿名垫底凭证和读取凭证异常都不能直接激活", async () => {
  for (const options of [
    { loginState: {}, credentials: { scope: "anonymous" } },
    { loginState: {}, credentialsError: new TypeError("Cannot read properties of null (reading 'scope')") },
  ]) {
    const { activate, calls } = activationHarness(options);
    assert.equal(await activate("0000"), true);
    assert.deepEqual(calls[0], ["login", "激活 Premium", true]);
  }
});

test("有效自定义登录直接激活；取消重新登录不消耗激活码", async () => {
  const valid = activationHarness({ loginState: {}, credentials: { scope: "custom" } });
  assert.equal(await valid.activate("0000"), true);
  assert.deepEqual(valid.calls[0], ["activate", "activateAndroidCode", "0000"]);

  const cancelled = activationHarness({ loginResult: false });
  assert.equal(await cancelled.activate("0000"), false);
  assert.ok(!cancelled.calls.some((call) => call[0] === "activate"));
});

test("强制重登时即使本机有账户也展示登录门和原因", async () => {
  const purpose = { textContent: "", hidden: true };
  const gate = { attributes: {}, setAttribute(key, value) { this.attributes[key] = value; }, classList: { add() {} } };
  const nodes = { loginPurpose: purpose, appleLoginBtn: {}, wxLoginBtn: {}, loginGate: gate };
  const context = {
    account: { userId: "wechat-user" },
    pendingLoginPromise: null,
    pendingLoginResolve: null,
    refreshPremiumAccess: () => Promise.resolve(true),
    $: (id) => nodes[id],
    currentPlatform: () => "android",
    lockScroll() {},
  };
  const requestLogin = hostFunction("requestCloudLogin", "\n  function finishStartupSplash", context);
  const pending = requestLogin("激活 Premium", true);
  assert.equal(purpose.hidden, false);
  assert.match(purpose.textContent, /重新登录/);
  assert.equal(gate.attributes["aria-hidden"], "false");
  context.pendingLoginResolve(true);
  assert.equal(await pending, true);
});
