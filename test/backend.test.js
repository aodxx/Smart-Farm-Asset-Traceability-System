const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const vm = require("node:vm");

function loadBackend() {
  const context = {
    console,
    Date,
    JSON,
    Math,
    Number,
    Object,
    String,
    Error,
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (key) =>
          key === "IMAGEKIT_PRIVATE_KEY" ? "private_test_key" : "",
      }),
    },
    Utilities: {
      MacAlgorithm: { HMAC_SHA_1: "sha1" },
      getUuid: () => "test-token",
      computeHmacSignature: (algorithm, value, key) =>
        [...crypto.createHmac(algorithm, key).update(value).digest()].map(
          (byte) => (byte > 127 ? byte - 256 : byte)
        ),
      formatDate: (value) => value.toISOString(),
    },
    Session: {
      getScriptTimeZone: () => "Asia/Bangkok",
    },
    module: { exports: {} },
  };
  vm.createContext(context);
  const source = fs.readFileSync("Code.gs", "utf8");
  vm.runInContext(
    `${source}
module.exports = {
  getImageKitAuthParams,
  validateRecord,
  sanitizeRecord,
  bytesToHex
};`,
    context
  );
  return context.module.exports;
}

test("ImageKit authentication uses a valid HMAC-SHA1 hex signature", () => {
  const backend = loadBackend();
  const params = backend.getImageKitAuthParams();
  const expected = crypto
    .createHmac("sha1", "private_test_key")
    .update(`test-token${params.expire}`)
    .digest("hex");

  assert.equal(params.token, "test-token");
  assert.equal(params.signature, expected);
  assert.match(params.signature, /^[a-f0-9]{40}$/);
});

test("expense validation rejects a zero amount", () => {
  const backend = loadBackend();
  assert.throws(
    () =>
      backend.validateRecord("Expenses", {
        date: "2026-07-30",
        category: "ค่ายา",
        amount: 0,
      }),
    /จำนวนเงินต้องมากกว่า 0/
  );
});

test("record sanitization ignores protected fields", () => {
  const backend = loadBackend();
  const record = backend.sanitizeRecord("Assets", {
    id: "attacker-controlled",
    deletedAt: "2026-01-01",
    assetName: "  ปั๊มน้ำ  ",
    acquiredDate: "2026-07-30",
    condition: "ดี",
  });

  assert.equal(record.id, undefined);
  assert.equal(record.deletedAt, undefined);
  assert.equal(record.assetName, "ปั๊มน้ำ");
});
