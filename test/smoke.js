const { chromium } = require("playwright");
const assert = require("node:assert/strict");

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
  });
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto(process.env.TEST_URL || "http://127.0.0.1:4173", {
    waitUntil: "networkidle",
  });

  assert.equal(await page.locator("h1").textContent(), "นิพนธ์ ฟาร์ม");
  assert.equal(await page.locator(".tab-panel").count(), 3);
  assert.equal(await page.locator("#summaryExpense").count(), 1);
  assert.equal(await page.locator("#settingsModal").count(), 1);
  assert.deepEqual(pageErrors, []);

  await page.screenshot({
    path: process.env.SCREENSHOT_PATH || "/tmp/smart-farm-mobile.png",
    fullPage: true,
  });
  await browser.close();
  console.log("Smoke test passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
