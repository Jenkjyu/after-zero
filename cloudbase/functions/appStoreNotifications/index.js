const fs = require("fs");
const path = require("path");
const cloudbase = require("@cloudbase/node-sdk");
const { Environment, SignedDataVerifier } = require("@apple/app-store-server-library");
const { BUNDLE_ID, handleHttpNotification } = require("./notificationService");

const app = cloudbase.init({ env: cloudbase.SYMBOL_CURRENT_ENV });
const db = app.database();

function rootCertificates() {
  const certDir = path.join(__dirname, "certs");
  return ["AppleRootCA-G2.cer", "AppleRootCA-G3.cer", "AppleComputerRootCertificate.cer"]
    .map((name) => fs.readFileSync(path.join(certDir, name)));
}

function verifierFor(environment) {
  const appleEnvironment = environment === "Sandbox" ? Environment.SANDBOX : Environment.PRODUCTION;
  const appAppleId = appleEnvironment === Environment.PRODUCTION ? Number(process.env.APPLE_APP_STORE_ID) : undefined;
  if (appleEnvironment === Environment.PRODUCTION && !Number.isFinite(appAppleId)) {
    const error = new Error("服务端尚未配置 App Store 应用 ID");
    error.code = "STOREKIT_SERVER_CONFIG_INVALID";
    throw error;
  }
  return new SignedDataVerifier(rootCertificates(), true, appleEnvironment, BUNDLE_ID, appAppleId);
}

exports.main = async (event) => handleHttpNotification(event, { db, verifierFor });
