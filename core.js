(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.FarmCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const ALLOWED_IMAGE_PROTOCOLS = new Set(["https:"]);

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function safeImageUrl(value) {
    if (!value) return "";
    try {
      const url = new URL(String(value));
      return ALLOWED_IMAGE_PROTOCOLS.has(url.protocol) ? url.href : "";
    } catch {
      return "";
    }
  }

  function imageTransformUrl(value, width = 100, height = 100) {
    const safe = safeImageUrl(value);
    if (!safe) return "";
    const separator = safe.includes("?") ? "&" : "?";
    return `${safe}${separator}tr=w-${width},h-${height},fo-auto`;
  }

  function formatMoney(value) {
    return Number(value || 0).toLocaleString("th-TH", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  function todayLocal(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function filterRows(rows, query, fields) {
    const needle = String(query || "").trim().toLocaleLowerCase("th");
    if (!needle) return [...rows];
    return rows.filter((row) =>
      fields.some((field) =>
        String(row[field] || "")
          .toLocaleLowerCase("th")
          .includes(needle)
      )
    );
  }

  function summarize(data) {
    const expenses = data.Expenses || [];
    const assets = data.Assets || [];
    const livestock = data.Livestock || [];
    return {
      expenseTotal: expenses.reduce(
        (sum, row) => sum + (Number(row.amount) || 0),
        0
      ),
      expenseCount: expenses.length,
      assetCount: assets.length,
      repairCount: assets.filter((row) => row.condition === "ต้องซ่อม").length,
      livestockCount: livestock.length,
    };
  }

  function validateFile(file, maxBytes = 8 * 1024 * 1024) {
    if (!file || !file.size) return { valid: true };
    if (!String(file.type || "").startsWith("image/")) {
      return { valid: false, message: "รองรับเฉพาะไฟล์รูปภาพ" };
    }
    if (file.size > maxBytes) {
      return { valid: false, message: "รูปภาพต้องมีขนาดไม่เกิน 8 MB" };
    }
    return { valid: true };
  }

  function normalizeImageKitAuth(value) {
    const token = String(value?.token || "").trim();
    const signature = String(value?.signature || "").trim().toLowerCase();
    const expire = Number(value?.expire);
    const valid =
      Boolean(token) &&
      /^[a-f0-9]{40}$/.test(signature) &&
      Number.isInteger(expire) &&
      expire > 0;

    return valid
      ? { valid: true, token, signature, expire }
      : {
          valid: false,
          message:
            "ข้อมูลยืนยัน ImageKit ไม่สมบูรณ์ กรุณาตรวจสอบ Apps Script Deployment",
        };
  }

  return {
    escapeHtml,
    safeImageUrl,
    imageTransformUrl,
    formatMoney,
    todayLocal,
    filterRows,
    summarize,
    validateFile,
    normalizeImageKitAuth,
  };
});
