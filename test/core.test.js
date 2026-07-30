const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("../core.js");

test("escapeHtml escapes markup and quotes", () => {
  assert.equal(
    core.escapeHtml(`<img src=x onerror="alert('x')">`),
    "&lt;img src=x onerror=&quot;alert(&#039;x&#039;)&quot;&gt;"
  );
});

test("safeImageUrl accepts HTTPS and rejects executable URLs", () => {
  assert.equal(
    core.safeImageUrl("https://ik.imagekit.io/farm/photo.jpg"),
    "https://ik.imagekit.io/farm/photo.jpg"
  );
  assert.equal(core.safeImageUrl("javascript:alert(1)"), "");
  assert.equal(core.safeImageUrl("data:image/svg+xml,<svg/>"), "");
});

test("imageTransformUrl preserves an existing query string", () => {
  assert.equal(
    core.imageTransformUrl("https://example.com/a.jpg?v=1", 64, 64),
    "https://example.com/a.jpg?v=1&tr=w-64,h-64,fo-auto"
  );
});

test("filterRows searches only requested fields", () => {
  const rows = [
    { assetName: "ปั๊มน้ำ", note: "โรงเรือน A", private: "secret" },
    { assetName: "รถไถ", note: "แปลง 2", private: "ปั๊มน้ำ" },
  ];
  assert.deepEqual(core.filterRows(rows, "ปั๊ม", ["assetName", "note"]), [
    rows[0],
  ]);
});

test("summarize calculates the farm overview", () => {
  assert.deepEqual(
    core.summarize({
      Expenses: [{ amount: 100 }, { amount: "50.5" }],
      Assets: [{ condition: "ดี" }, { condition: "ต้องซ่อม" }],
      Livestock: [{}, {}, {}],
    }),
    {
      expenseTotal: 150.5,
      expenseCount: 2,
      assetCount: 2,
      repairCount: 1,
      livestockCount: 3,
    }
  );
});

test("validateFile rejects non-images and large images", () => {
  assert.deepEqual(core.validateFile({ size: 10, type: "text/plain" }), {
    valid: false,
    message: "รองรับเฉพาะไฟล์รูปภาพ",
  });
  assert.equal(
    core.validateFile({ size: 9 * 1024 * 1024, type: "image/jpeg" }).valid,
    false
  );
  assert.equal(
    core.validateFile({ size: 1024, type: "image/jpeg" }).valid,
    true
  );
});
