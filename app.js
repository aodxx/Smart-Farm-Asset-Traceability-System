/* =====================================================================
   Smart Farm Asset & Traceability System — app.js
   นิพนธ์ ฟาร์ม
   =====================================================================
   ตั้งค่า Environment Variables ของคุณในส่วน CONFIG ด้านล่าง
   ดูวิธีตั้งค่าโดยละเอียดใน README.md
   ===================================================================== */

const CONFIG = {
  // URL ของ Google Apps Script Web App (จาก Deploy > New deployment)
  API_URL: "https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec",

  // ImageKit.io credentials (Dashboard > Developer Options)
  IMAGEKIT_PUBLIC_KEY: "public_YOUR_IMAGEKIT_PUBLIC_KEY",
  IMAGEKIT_URL_ENDPOINT: "https://ik.imagekit.io/YOUR_IMAGEKIT_ID",

  // Endpoint ที่คืนค่า signature/token/expire สำหรับ ImageKit authentication
  // ใช้ Web App URL เดียวกันกับ API_URL แค่เติม ?action=imagekitAuth (ดู Code.gs)
  get IMAGEKIT_AUTH_ENDPOINT() {
    return `${this.API_URL}?action=imagekitAuth`;
  },
};

/* ---------------------------------------------------------------------
   ImageKit client
   --------------------------------------------------------------------- */
const imagekit = new ImageKit({
  publicKey: CONFIG.IMAGEKIT_PUBLIC_KEY,
  urlEndpoint: CONFIG.IMAGEKIT_URL_ENDPOINT,
  authenticationEndpoint: CONFIG.IMAGEKIT_AUTH_ENDPOINT,
});

/* ---------------------------------------------------------------------
   Toast notifications
   --------------------------------------------------------------------- */
function showToast(message, type = "success") {
  const container = document.getElementById("toastContainer");
  const colors = {
    success: "bg-emerald-600",
    error: "bg-rose-600",
    info: "bg-brand-600",
  };
  const el = document.createElement("div");
  el.className = `toast-enter ${colors[type] || colors.info} text-white text-sm font-medium px-4 py-2.5 rounded-xl shadow-lg max-w-sm w-full sm:w-auto flex items-center gap-2`;
  el.innerHTML = `<span>${type === "success" ? "✅" : type === "error" ? "⚠️" : "ℹ️"}</span><span>${escapeHtml(message)}</span>`;
  container.appendChild(el);
  setTimeout(() => {
    el.style.transition = "opacity .3s, transform .3s";
    el.style.opacity = "0";
    el.style.transform = "translateY(10px)";
    setTimeout(() => el.remove(), 300);
  }, 3200);
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

/* ---------------------------------------------------------------------
   Loading state helpers (button spinner)
   --------------------------------------------------------------------- */
function setButtonLoading(button, isLoading, loadingText = "กำลังบันทึก...") {
  if (isLoading) {
    button.dataset.originalLabel = button.querySelector(".btn-label").textContent;
    button.disabled = true;
    button.classList.add("opacity-70", "cursor-not-allowed");
    button.innerHTML = `<span class="spinner"></span><span class="btn-label">${loadingText}</span>`;
  } else {
    button.disabled = false;
    button.classList.remove("opacity-70", "cursor-not-allowed");
    button.innerHTML = `<span class="btn-label">${button.dataset.originalLabel || "บันทึก"}</span>`;
  }
}

/* ---------------------------------------------------------------------
   Tabs
   --------------------------------------------------------------------- */
const tabButtons = document.querySelectorAll(".tab-btn");
const tabPanels = document.querySelectorAll(".tab-panel");

tabButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    tabButtons.forEach((b) => b.classList.remove("tab-active", "text-slate-300"));
    btn.classList.add("tab-active");
    tabPanels.forEach((p) => p.classList.add("hidden"));
    document.getElementById(`panel-${btn.dataset.tab}`).classList.remove("hidden");
  });
});

document.getElementById("refreshBtn").addEventListener("click", () => {
  loadAll();
  showToast("กำลังรีเฟรชข้อมูล...", "info");
});

/* ---------------------------------------------------------------------
   Image modal
   --------------------------------------------------------------------- */
function openImageModal(url) {
  document.getElementById("modalImage").src = url;
  document.getElementById("imageModal").classList.remove("hidden");
}
function closeImageModal() {
  document.getElementById("imageModal").classList.add("hidden");
  document.getElementById("modalImage").src = "";
}

/* ---------------------------------------------------------------------
   API helpers — talk to Google Apps Script Web App (Code.gs)
   --------------------------------------------------------------------- */
async function apiGet(sheet) {
  const res = await fetch(`${CONFIG.API_URL}?sheet=${encodeURIComponent(sheet)}`);
  if (!res.ok) throw new Error(`GET ${sheet} failed: ${res.status}`);
  const json = await res.json();
  if (json.status === "error") throw new Error(json.message || "Unknown API error");
  return json.data || [];
}

async function apiPost(sheet, record) {
  // ใช้ text/plain เพื่อเลี่ยง CORS preflight (Apps Script ไม่รองรับ OPTIONS โดยตรง)
  const res = await fetch(CONFIG.API_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ sheet, record }),
  });
  if (!res.ok) throw new Error(`POST ${sheet} failed: ${res.status}`);
  const json = await res.json();
  if (json.status === "error") throw new Error(json.message || "Unknown API error");
  return json;
}

/* ---------------------------------------------------------------------
   ImageKit upload
   --------------------------------------------------------------------- */
function uploadToImageKit(file, folder) {
  return new Promise((resolve, reject) => {
    if (!file) return resolve("");
    const fileName = `${Date.now()}_${file.name}`.replace(/\s+/g, "_");
    imagekit.upload(
      {
        file,
        fileName,
        folder: `/${folder}/`,
        useUniqueFileName: true,
      },
      (err, result) => {
        if (err) return reject(err);
        resolve(result.url); // เก็บเฉพาะ URL หลักไปบันทึกลง Sheets
      }
    );
  });
}

function thumbUrl(url, w = 100, h = 100) {
  if (!url) return "https://placehold.co/100x100/1e293b/64748b?text=No+Image";
  return `${url}?tr=w-${w},h-${h},fo-auto`;
}

/* =====================================================================
   MODULE 1 — Expenses & Invoices
   ===================================================================== */
const expenseForm = document.getElementById("expenseForm");
const expenseList = document.getElementById("expenseList");
const expenseTotal = document.getElementById("expenseTotal");

expenseForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = expenseForm.querySelector(".submit-btn");
  setButtonLoading(btn, true, "กำลังอัปโหลดรูป...");
  try {
    const fd = new FormData(expenseForm);
    const photoFile = fd.get("photo");
    const photoUrl = await uploadToImageKit(photoFile, "invoices");

    setButtonLoading(btn, true, "กำลังบันทึก...");
    await apiPost("Expenses", {
      date: fd.get("date"),
      category: fd.get("category"),
      amount: Number(fd.get("amount")),
      description: fd.get("description") || "",
      photoUrl,
    });

    showToast("บันทึกรายจ่ายสำเร็จ", "success");
    expenseForm.reset();
    await loadExpenses();
  } catch (err) {
    console.error(err);
    showToast(`เกิดข้อผิดพลาด: ${err.message}`, "error");
  } finally {
    setButtonLoading(btn, false);
  }
});

async function loadExpenses() {
  expenseList.innerHTML = skeletonRows(3);
  try {
    const rows = await apiGet("Expenses");
    if (!rows.length) {
      expenseList.innerHTML = emptyState("ยังไม่มีรายการรายจ่าย");
      expenseTotal.textContent = "";
      return;
    }
    const sorted = [...rows].reverse();
    const total = rows.reduce((s, r) => s + (Number(r.amount) || 0), 0);
    expenseTotal.textContent = `รวม ${total.toLocaleString("th-TH", { minimumFractionDigits: 2 })} บาท`;

    expenseList.innerHTML = sorted
      .map(
        (r) => `
      <div class="flex items-center gap-3 bg-slate-800/60 border border-slate-800 rounded-xl p-3">
        <img src="${thumbUrl(r.photoUrl, 64, 64)}" onclick="openImageModal('${r.photoUrl || ""}')"
             class="w-14 h-14 rounded-lg object-cover cursor-pointer flex-shrink-0 bg-slate-700" loading="lazy">
        <div class="flex-1 min-w-0">
          <div class="flex items-center justify-between gap-2">
            <span class="text-sm font-semibold text-white truncate">${escapeHtml(r.category)}</span>
            <span class="text-sm font-bold text-brand-400 whitespace-nowrap">${Number(r.amount || 0).toLocaleString("th-TH", { minimumFractionDigits: 2 })} ฿</span>
          </div>
          <p class="text-xs text-slate-400 truncate">${escapeHtml(r.description) || "—"}</p>
          <p class="text-[11px] text-slate-500">${escapeHtml(r.date)}</p>
        </div>
      </div>`
      )
      .join("");
  } catch (err) {
    console.error(err);
    expenseList.innerHTML = errorState(err.message);
  }
}

/* =====================================================================
   MODULE 2 — Farm Assets
   ===================================================================== */
const assetForm = document.getElementById("assetForm");
const assetTableBody = document.getElementById("assetTableBody");

assetForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = assetForm.querySelector(".submit-btn");
  setButtonLoading(btn, true, "กำลังอัปโหลดรูป...");
  try {
    const fd = new FormData(assetForm);
    const photoFile = fd.get("photo");
    const photoUrl = await uploadToImageKit(photoFile, "assets");

    setButtonLoading(btn, true, "กำลังบันทึก...");
    await apiPost("Assets", {
      assetName: fd.get("assetName"),
      acquiredDate: fd.get("acquiredDate"),
      condition: fd.get("condition"),
      note: fd.get("note") || "",
      photoUrl,
    });

    showToast("เพิ่มสินทรัพย์สำเร็จ", "success");
    assetForm.reset();
    await loadAssets();
  } catch (err) {
    console.error(err);
    showToast(`เกิดข้อผิดพลาด: ${err.message}`, "error");
  } finally {
    setButtonLoading(btn, false);
  }
});

async function loadAssets() {
  assetTableBody.innerHTML = `<tr><td colspan="4" class="py-4"><div class="skeleton h-4 rounded w-full"></div></td></tr>`;
  try {
    const rows = await apiGet("Assets");
    if (!rows.length) {
      assetTableBody.innerHTML = `<tr><td colspan="4" class="py-6 text-center text-slate-500 text-sm">ยังไม่มีสินทรัพย์ในระบบ</td></tr>`;
      return;
    }
    assetTableBody.innerHTML = [...rows]
      .reverse()
      .map(
        (r) => `
      <tr class="hover:bg-slate-800/40">
        <td class="py-2 pr-3">
          <img src="${thumbUrl(r.photoUrl, 100, 100)}" onclick="openImageModal('${r.photoUrl || ""}')"
               class="w-12 h-12 rounded-lg object-cover cursor-pointer bg-slate-700" loading="lazy">
        </td>
        <td class="py-2 pr-3 font-medium text-white">${escapeHtml(r.assetName)}</td>
        <td class="py-2 pr-3 text-slate-400">${escapeHtml(r.acquiredDate)}</td>
        <td class="py-2 pr-3">${conditionBadge(r.condition)}</td>
      </tr>`
      )
      .join("");
  } catch (err) {
    console.error(err);
    assetTableBody.innerHTML = `<tr><td colspan="4" class="py-4 text-rose-400 text-sm">โหลดข้อมูลไม่สำเร็จ: ${escapeHtml(err.message)}</td></tr>`;
  }
}

function conditionBadge(condition) {
  const map = {
    "ดี": "bg-emerald-500/15 text-emerald-400",
    "พอใช้": "bg-amber-500/15 text-amber-400",
    "ต้องซ่อม": "bg-rose-500/15 text-rose-400",
    "ปลดระวาง": "bg-slate-500/15 text-slate-400",
  };
  const cls = map[condition] || "bg-slate-500/15 text-slate-400";
  return `<span class="px-2 py-0.5 rounded-full text-xs font-medium ${cls}">${escapeHtml(condition || "-")}</span>`;
}

/* =====================================================================
   MODULE 3 — Livestock Digital Card
   ===================================================================== */
const livestockForm = document.getElementById("livestockForm");
const livestockGrid = document.getElementById("livestockGrid");

livestockForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = livestockForm.querySelector(".submit-btn");
  setButtonLoading(btn, true, "กำลังอัปโหลดรูป...");
  try {
    const fd = new FormData(livestockForm);
    const photoFile = fd.get("photo");
    const photoUrl = await uploadToImageKit(photoFile, "livestock");

    setButtonLoading(btn, true, "กำลังบันทึก...");
    await apiPost("Livestock", {
      earTag: fd.get("earTag"),
      breed: fd.get("breed"),
      history: fd.get("history") || "",
      photoUrl,
    });

    showToast("บันทึกข้อมูลสุกรสำเร็จ", "success");
    livestockForm.reset();
    await loadLivestock();
  } catch (err) {
    console.error(err);
    showToast(`เกิดข้อผิดพลาด: ${err.message}`, "error");
  } finally {
    setButtonLoading(btn, false);
  }
});

async function loadLivestock() {
  livestockGrid.innerHTML = Array(3).fill(`<div class="skeleton h-40 rounded-2xl"></div>`).join("");
  try {
    const rows = await apiGet("Livestock");
    if (!rows.length) {
      livestockGrid.innerHTML = emptyState("ยังไม่มีข้อมูลสุกรในระบบ");
      return;
    }
    livestockGrid.innerHTML = [...rows]
      .reverse()
      .map(
        (r) => `
      <div class="card-hover bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden transition">
        <img src="${thumbUrl(r.photoUrl, 400, 260)}" onclick="openImageModal('${r.photoUrl || ""}')"
             class="w-full h-40 object-cover cursor-pointer bg-slate-700" loading="lazy">
        <div class="p-4">
          <div class="flex items-center justify-between mb-1">
            <span class="font-bold text-white">🏷️ ${escapeHtml(r.earTag)}</span>
            <span class="text-xs bg-brand-600/20 text-brand-400 px-2 py-0.5 rounded-full font-medium">${escapeHtml(r.breed)}</span>
          </div>
          <p class="text-xs text-slate-400 line-clamp-3">${escapeHtml(r.history) || "ไม่มีประวัติบันทึก"}</p>
        </div>
      </div>`
      )
      .join("");
  } catch (err) {
    console.error(err);
    livestockGrid.innerHTML = errorState(err.message);
  }
}

/* ---------------------------------------------------------------------
   Shared UI state helpers
   --------------------------------------------------------------------- */
function skeletonRows(n) {
  return Array(n).fill(`<div class="skeleton h-14 rounded-xl"></div>`).join("");
}
function emptyState(text) {
  return `<div class="text-center text-slate-500 text-sm py-8 col-span-full">📭 ${escapeHtml(text)}</div>`;
}
function errorState(message) {
  return `<div class="text-center text-rose-400 text-sm py-8 col-span-full">⚠️ โหลดข้อมูลไม่สำเร็จ: ${escapeHtml(message)}</div>`;
}

/* ---------------------------------------------------------------------
   Init
   --------------------------------------------------------------------- */
function loadAll() {
  loadExpenses();
  loadAssets();
  loadLivestock();
}

document.addEventListener("DOMContentLoaded", loadAll);
