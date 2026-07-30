/* global ImageKit, FarmCore */

"use strict";

const CONFIG = {
  API_URL:
    "https://script.google.com/macros/s/AKfycbxXqRJxbgJm4Gv_jwElgVgBgNy5shnzTkJ8sNK-LquQX71JxZyhQmVnDGcj9FMmLx4e/exec",
  IMAGEKIT_PUBLIC_KEY: "public_Or7oN0cYLa0ApQQhDxXqTx8huFQ=",
  IMAGEKIT_URL_ENDPOINT: "https://ik.imagekit.io/ahrkj8bof",
  REQUEST_TIMEOUT_MS: 20000,
};

const SHEETS = {
  expenses: "Expenses",
  assets: "Assets",
  livestock: "Livestock",
};

const state = {
  data: {
    Expenses: [],
    Assets: [],
    Livestock: [],
  },
  health: null,
  accessToken: localStorage.getItem("smartFarmAccessToken") || "",
};

const {
  escapeHtml,
  safeImageUrl,
  imageTransformUrl,
  formatMoney,
  todayLocal,
  filterRows,
  summarize,
  validateFile,
  normalizeImageKitAuth,
} = FarmCore;

const expenseForm = document.getElementById("expenseForm");
const assetForm = document.getElementById("assetForm");
const livestockForm = document.getElementById("livestockForm");
const expenseList = document.getElementById("expenseList");
const expenseTotal = document.getElementById("expenseTotal");
const assetTableBody = document.getElementById("assetTableBody");
const livestockGrid = document.getElementById("livestockGrid");
const connectionStatus = document.getElementById("connectionStatus");

class ApiError extends Error {
  constructor(message, code = "API_ERROR") {
    super(message);
    this.name = "ApiError";
    this.code = code;
  }
}

function showToast(message, type = "success") {
  const container = document.getElementById("toastContainer");
  const colors = {
    success: "bg-emerald-600",
    error: "bg-rose-600",
    info: "bg-brand-600",
  };
  const icon = type === "success" ? "✅" : type === "error" ? "⚠️" : "ℹ️";
  const element = document.createElement("div");
  element.className = `toast-enter ${
    colors[type] || colors.info
  } text-white text-sm font-medium px-4 py-2.5 rounded-xl shadow-lg max-w-sm w-full sm:w-auto flex items-center gap-2`;
  element.innerHTML = `<span>${icon}</span><span>${escapeHtml(message)}</span>`;
  container.appendChild(element);

  setTimeout(() => {
    element.style.transition = "opacity .3s, transform .3s";
    element.style.opacity = "0";
    element.style.transform = "translateY(10px)";
    setTimeout(() => element.remove(), 300);
  }, 3600);
}

function setConnectionStatus(status, text) {
  const classes = {
    online: "bg-emerald-500/15 text-emerald-400",
    offline: "bg-rose-500/15 text-rose-400",
    loading: "bg-amber-500/15 text-amber-400",
  };
  connectionStatus.className = `hidden sm:inline-flex text-[11px] px-2 py-1 rounded-full ${
    classes[status] || classes.loading
  }`;
  connectionStatus.textContent = text;
}

function setButtonLoading(button, loading, text = "กำลังบันทึก...") {
  const label = button.querySelector(".btn-label");
  if (loading) {
    if (!button.dataset.originalLabel) {
      button.dataset.originalLabel = label.textContent;
    }
    button.disabled = true;
    button.classList.add("opacity-70", "cursor-not-allowed");
    button.innerHTML = `<span class="spinner"></span><span class="btn-label">${escapeHtml(
      text
    )}</span>`;
    return;
  }

  button.disabled = false;
  button.classList.remove("opacity-70", "cursor-not-allowed");
  button.innerHTML = `<span class="btn-label">${escapeHtml(
    button.dataset.originalLabel || "บันทึก"
  )}</span>`;
  delete button.dataset.originalLabel;
}

function updateLoadingText(button, text) {
  const label = button.querySelector(".btn-label");
  if (label) label.textContent = text;
}

async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CONFIG.REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      ...options,
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new ApiError(`การเชื่อมต่อล้มเหลว (${response.status})`, "HTTP_ERROR");
    }
    const json = await response.json();
    if (json.status === "error") {
      throw new ApiError(
        json.error?.message || json.message || "เกิดข้อผิดพลาดจาก API",
        json.error?.code || "API_ERROR"
      );
    }
    return json;
  } catch (error) {
    if (error.name === "AbortError") {
      throw new ApiError("การเชื่อมต่อใช้เวลานานเกินไป กรุณาลองใหม่", "TIMEOUT");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function apiUrl(params = {}) {
  const url = new URL(CONFIG.API_URL);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== "" && value !== undefined && value !== null) {
      url.searchParams.set(key, value);
    }
  });
  if (state.accessToken) url.searchParams.set("token", state.accessToken);
  return url.toString();
}

async function apiHealth() {
  return fetchJson(apiUrl({ action: "health" }));
}

async function apiList(sheet) {
  const json = await fetchJson(apiUrl({ action: "list", sheet }));
  return json.data || [];
}

async function apiMutation(action, sheet, payload = {}) {
  return fetchJson(CONFIG.API_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({
      action,
      sheet,
      token: state.accessToken,
      ...payload,
    }),
  });
}

function getImageKitClient() {
  if (typeof ImageKit !== "function") {
    throw new Error("โหลดระบบอัปโหลดรูปไม่สำเร็จ กรุณารีเฟรชหน้าเว็บ");
  }
  return new ImageKit({
    publicKey: CONFIG.IMAGEKIT_PUBLIC_KEY,
    urlEndpoint: CONFIG.IMAGEKIT_URL_ENDPOINT,
  });
}

async function uploadToImageKit(file, folder, currentUrl = "") {
  if (!file || !file.size) return currentUrl;

  const validation = validateFile(file);
  if (!validation.valid) throw new Error(validation.message);

  const authentication = normalizeImageKitAuth(
    await fetchJson(apiUrl({ action: "imagekitAuth" }))
  );
  if (!authentication.valid) {
    throw new ApiError(authentication.message, "IMAGEKIT_AUTH_INVALID");
  }

  const fileName = `${Date.now()}_${file.name}`.replace(
    /[^a-zA-Z0-9._-]+/g,
    "_"
  );

  return new Promise((resolve, reject) => {
    getImageKitClient().upload(
      {
        file,
        fileName,
        folder: `/${folder}/`,
        useUniqueFileName: true,
        token: authentication.token,
        signature: authentication.signature,
        expire: authentication.expire,
      },
      (error, result) => {
        if (error) {
          reject(
            new Error(
              error.message || "อัปโหลดรูปไม่สำเร็จ กรุณาตรวจสอบ ImageKit"
            )
          );
          return;
        }
        resolve(result.url);
      }
    );
  });
}

function placeholderUrl(width = 100, height = 100) {
  return `https://placehold.co/${width}x${height}/1e293b/64748b?text=No+Image`;
}

function displayImageUrl(url, width, height) {
  return imageTransformUrl(url, width, height) || placeholderUrl(width, height);
}

function openImageModal(url) {
  const safeUrl = safeImageUrl(url);
  if (!safeUrl) return;
  document.getElementById("modalImage").src = safeUrl;
  document.getElementById("imageModal").classList.remove("hidden");
}

function closeImageModal() {
  document.getElementById("imageModal").classList.add("hidden");
  document.getElementById("modalImage").src = "";
}

window.closeImageModal = closeImageModal;

function showSettings() {
  const modal = document.getElementById("settingsModal");
  const input = document.getElementById("accessTokenInput");
  input.value = state.accessToken;
  modal.classList.remove("hidden");
  setTimeout(() => input.focus(), 50);
}

function closeSettings() {
  document.getElementById("settingsModal").classList.add("hidden");
}

function handleApiError(error, fallbackContainer) {
  console.error(error);
  if (error.code === "UNAUTHORIZED") showSettings();
  if (fallbackContainer) fallbackContainer.innerHTML = errorState(error.message);
  setConnectionStatus("offline", "เชื่อมต่อไม่ได้");
  showToast(error.message || "เกิดข้อผิดพลาด", "error");
}

function setFormEditing(form, record, labels) {
  form.dataset.editId = record.id;
  form.dataset.currentPhotoUrl = record.photoUrl || "";
  form.querySelector(".cancel-edit").classList.remove("hidden");
  form.querySelector(".btn-label").textContent = labels.edit;
  form.scrollIntoView({ behavior: "smooth", block: "center" });
}

function cancelEdit(form, defaultLabel) {
  form.reset();
  delete form.dataset.editId;
  delete form.dataset.currentPhotoUrl;
  form.querySelector(".cancel-edit").classList.add("hidden");
  form.querySelector(".btn-label").textContent = defaultLabel;
  setDefaultDates();
}

function findRecord(sheet, id) {
  return state.data[sheet].find((row) => row.id === id);
}

async function deleteRecord(sheet, id, label) {
  if (!window.confirm(`ยืนยันนำ “${label}” ออกจากรายการใช้งาน?\nข้อมูลจะถูกเก็บไว้ในชีตและสามารถกู้คืนได้`)) {
    return;
  }
  try {
    await apiMutation("delete", sheet, { id });
    showToast("นำรายการออกแล้ว", "success");
    await loadSheet(sheet);
  } catch (error) {
    handleApiError(error);
  }
}

async function submitForm({
  form,
  sheet,
  folder,
  buildRecord,
  successCreate,
  successUpdate,
  defaultLabel,
}) {
  const button = form.querySelector(".submit-btn");
  const formData = new FormData(form);
  const file = formData.get("photo");
  setButtonLoading(button, true, file?.size ? "กำลังอัปโหลดรูป..." : "กำลังบันทึก...");

  try {
    const photoUrl = await uploadToImageKit(
      file,
      folder,
      form.dataset.currentPhotoUrl || ""
    );
    updateLoadingText(button, "กำลังบันทึก...");
    const record = buildRecord(formData, photoUrl);
    const id = form.dataset.editId;
    await apiMutation(id ? "update" : "create", sheet, {
      id,
      record,
    });
    showToast(id ? successUpdate : successCreate, "success");
    cancelEdit(form, defaultLabel);
    await loadSheet(sheet);
  } catch (error) {
    handleApiError(error);
  } finally {
    setButtonLoading(button, false);
    if (!form.dataset.editId) {
      button.querySelector(".btn-label").textContent = defaultLabel;
    }
  }
}

function renderExpenses() {
  const rows = filterRows(
    state.data.Expenses,
    document.getElementById("expenseSearch").value,
    ["date", "category", "description", "amount"]
  ).reverse();

  const total = state.data.Expenses.reduce(
    (sum, row) => sum + (Number(row.amount) || 0),
    0
  );
  expenseTotal.textContent = `${state.data.Expenses.length} รายการ · ${formatMoney(
    total
  )} บาท`;

  if (!rows.length) {
    expenseList.innerHTML = emptyState(
      state.data.Expenses.length ? "ไม่พบรายจ่ายที่ค้นหา" : "ยังไม่มีรายการรายจ่าย"
    );
    return;
  }

  expenseList.innerHTML = rows
    .map((row) => {
      const safePhoto = safeImageUrl(row.photoUrl);
      return `
        <article class="flex items-center gap-3 bg-slate-800/60 border border-slate-800 rounded-xl p-3" data-id="${escapeHtml(
          row.id
        )}">
          <button type="button" class="open-image flex-shrink-0" data-image="${escapeHtml(
            safePhoto
          )}" ${safePhoto ? "" : "disabled"}>
            <img src="${escapeHtml(
              displayImageUrl(safePhoto, 64, 64)
            )}" class="w-14 h-14 rounded-lg object-cover bg-slate-700" alt="รูปใบเสร็จ" loading="lazy">
          </button>
          <div class="flex-1 min-w-0">
            <div class="flex items-center justify-between gap-2">
              <span class="text-sm font-semibold text-white truncate">${escapeHtml(
                row.category
              )}</span>
              <span class="text-sm font-bold text-brand-400 whitespace-nowrap">${formatMoney(
                row.amount
              )} ฿</span>
            </div>
            <p class="text-xs text-slate-400 truncate">${
              escapeHtml(row.description) || "—"
            }</p>
            <p class="text-[11px] text-slate-500">${escapeHtml(row.date)}</p>
          </div>
          <div class="flex flex-col gap-1">
            <button type="button" class="edit-record text-xs text-brand-400 hover:text-brand-100 px-2 py-1">แก้ไข</button>
            <button type="button" class="delete-record text-xs text-rose-400 hover:text-rose-200 px-2 py-1">ลบ</button>
          </div>
        </article>`;
    })
    .join("");
}

function renderAssets() {
  const query = document.getElementById("assetSearch").value;
  const condition = document.getElementById("assetConditionFilter").value;
  const rows = filterRows(state.data.Assets, query, [
    "assetName",
    "acquiredDate",
    "condition",
    "note",
  ])
    .filter((row) => !condition || row.condition === condition)
    .reverse();

  if (!rows.length) {
    assetTableBody.innerHTML = `<tr><td colspan="5" class="py-6 text-center text-slate-500 text-sm">${
      state.data.Assets.length
        ? "ไม่พบสินทรัพย์ที่ค้นหา"
        : "ยังไม่มีสินทรัพย์ในระบบ"
    }</td></tr>`;
    return;
  }

  assetTableBody.innerHTML = rows
    .map((row) => {
      const safePhoto = safeImageUrl(row.photoUrl);
      return `
        <tr class="hover:bg-slate-800/40" data-id="${escapeHtml(row.id)}">
          <td class="py-2 pr-3">
            <button type="button" class="open-image" data-image="${escapeHtml(
              safePhoto
            )}" ${safePhoto ? "" : "disabled"}>
              <img src="${escapeHtml(
                displayImageUrl(safePhoto, 100, 100)
              )}" class="w-12 h-12 rounded-lg object-cover bg-slate-700" alt="รูปสินทรัพย์" loading="lazy">
            </button>
          </td>
          <td class="py-2 pr-3 font-medium text-white">${escapeHtml(
            row.assetName
          )}</td>
          <td class="py-2 pr-3 text-slate-400">${escapeHtml(
            row.acquiredDate
          )}</td>
          <td class="py-2 pr-3">${conditionBadge(row.condition)}</td>
          <td class="py-2 text-right whitespace-nowrap">
            <button type="button" class="edit-record text-xs text-brand-400 hover:text-brand-100 px-2 py-1">แก้ไข</button>
            <button type="button" class="delete-record text-xs text-rose-400 hover:text-rose-200 px-2 py-1">ลบ</button>
          </td>
        </tr>`;
    })
    .join("");
}

function renderLivestock() {
  const rows = filterRows(
    state.data.Livestock,
    document.getElementById("livestockSearch").value,
    ["earTag", "breed", "history"]
  ).reverse();

  if (!rows.length) {
    livestockGrid.innerHTML = emptyState(
      state.data.Livestock.length
        ? "ไม่พบสุกรที่ค้นหา"
        : "ยังไม่มีข้อมูลสุกรในระบบ"
    );
    return;
  }

  livestockGrid.innerHTML = rows
    .map((row) => {
      const safePhoto = safeImageUrl(row.photoUrl);
      return `
        <article class="card-hover bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden transition" data-id="${escapeHtml(
          row.id
        )}">
          <button type="button" class="open-image w-full" data-image="${escapeHtml(
            safePhoto
          )}" ${safePhoto ? "" : "disabled"}>
            <img src="${escapeHtml(
              displayImageUrl(safePhoto, 400, 260)
            )}" class="w-full h-40 object-cover bg-slate-700" alt="รูปสุกร ${escapeHtml(
              row.earTag
            )}" loading="lazy">
          </button>
          <div class="p-4">
            <div class="flex items-center justify-between gap-2 mb-1">
              <span class="font-bold text-white">🏷️ ${escapeHtml(
                row.earTag
              )}</span>
              <span class="text-xs bg-brand-600/20 text-brand-400 px-2 py-0.5 rounded-full font-medium">${escapeHtml(
                row.breed
              )}</span>
            </div>
            <p class="text-xs text-slate-400 line-clamp-3 min-h-10">${
              escapeHtml(row.history) || "ไม่มีประวัติบันทึก"
            }</p>
            <div class="flex justify-end gap-1 mt-3 border-t border-slate-800 pt-2">
              <button type="button" class="edit-record text-xs text-brand-400 hover:text-brand-100 px-2 py-1">แก้ไข</button>
              <button type="button" class="delete-record text-xs text-rose-400 hover:text-rose-200 px-2 py-1">ลบ</button>
            </div>
          </div>
        </article>`;
    })
    .join("");
}

function renderSummary() {
  const summary = summarize(state.data);
  document.getElementById("summaryExpense").textContent = `${formatMoney(
    summary.expenseTotal
  )} ฿`;
  document.getElementById(
    "summaryExpenseCount"
  ).textContent = `${summary.expenseCount} รายการ`;
  document.getElementById("summaryAssets").textContent = summary.assetCount;
  document.getElementById(
    "summaryRepair"
  ).textContent = `รอซ่อม ${summary.repairCount} รายการ`;
  document.getElementById("summaryLivestock").textContent =
    summary.livestockCount;
  document.getElementById("lastUpdated").textContent = `อัปเดต ${new Date().toLocaleTimeString(
    "th-TH",
    { hour: "2-digit", minute: "2-digit" }
  )}`;

  if (state.health) {
    const secureText = state.health.secureMode ? "ปลอดภัย" : "ควรตั้ง Token";
    document.getElementById("summarySystem").textContent = secureText;
    document.getElementById("summarySystem").className = `text-sm font-bold mt-2 ${
      state.health.secureMode ? "text-emerald-400" : "text-amber-400"
    }`;
    document.getElementById(
      "summaryVersion"
    ).textContent = `API v${state.health.version || "—"}`;
  }
}

function conditionBadge(condition) {
  const map = {
    ดี: "bg-emerald-500/15 text-emerald-400",
    พอใช้: "bg-amber-500/15 text-amber-400",
    ต้องซ่อม: "bg-rose-500/15 text-rose-400",
    ปลดระวาง: "bg-slate-500/15 text-slate-400",
  };
  const className = map[condition] || "bg-slate-500/15 text-slate-400";
  return `<span class="px-2 py-0.5 rounded-full text-xs font-medium ${className}">${escapeHtml(
    condition || "-"
  )}</span>`;
}

function skeletonRows(count) {
  return Array(count)
    .fill(`<div class="skeleton h-14 rounded-xl"></div>`)
    .join("");
}

function emptyState(text) {
  return `<div class="text-center text-slate-500 text-sm py-8 col-span-full">📭 ${escapeHtml(
    text
  )}</div>`;
}

function errorState(message) {
  return `<div class="text-center text-rose-400 text-sm py-8 col-span-full">⚠️ โหลดข้อมูลไม่สำเร็จ: ${escapeHtml(
    message
  )}</div>`;
}

async function loadSheet(sheet) {
  const rows = await apiList(sheet);
  state.data[sheet] = rows;
  if (sheet === "Expenses") renderExpenses();
  if (sheet === "Assets") renderAssets();
  if (sheet === "Livestock") renderLivestock();
  renderSummary();
}

async function loadAll({ notify = false } = {}) {
  setConnectionStatus("loading", "กำลังเชื่อมต่อ");
  expenseList.innerHTML = skeletonRows(3);
  assetTableBody.innerHTML =
    '<tr><td colspan="5" class="py-4"><div class="skeleton h-4 rounded w-full"></div></td></tr>';
  livestockGrid.innerHTML = Array(3)
    .fill('<div class="skeleton h-40 rounded-2xl"></div>')
    .join("");

  try {
    state.health = await apiHealth();
    const results = await Promise.all(
      Object.values(SHEETS).map(async (sheet) => [sheet, await apiList(sheet)])
    );
    results.forEach(([sheet, rows]) => {
      state.data[sheet] = rows;
    });
    renderExpenses();
    renderAssets();
    renderLivestock();
    renderSummary();
    setConnectionStatus("online", "เชื่อมต่อแล้ว");
    if (notify) showToast("รีเฟรชข้อมูลเรียบร้อย", "success");
  } catch (error) {
    handleApiError(error);
    expenseList.innerHTML = errorState(error.message);
    assetTableBody.innerHTML = `<tr><td colspan="5">${errorState(
      error.message
    )}</td></tr>`;
    livestockGrid.innerHTML = errorState(error.message);
  }
}

function editExpense(id) {
  const row = findRecord("Expenses", id);
  if (!row) return;
  expenseForm.elements.date.value = row.date || "";
  expenseForm.elements.category.value = row.category || "ค่ายา";
  expenseForm.elements.amount.value = row.amount || "";
  expenseForm.elements.description.value = row.description || "";
  setFormEditing(expenseForm, row, { edit: "บันทึกการแก้ไข" });
}

function editAsset(id) {
  const row = findRecord("Assets", id);
  if (!row) return;
  assetForm.elements.assetName.value = row.assetName || "";
  assetForm.elements.acquiredDate.value = row.acquiredDate || "";
  assetForm.elements.condition.value = row.condition || "ดี";
  assetForm.elements.note.value = row.note || "";
  setFormEditing(assetForm, row, { edit: "บันทึกการแก้ไข" });
}

function editLivestock(id) {
  const row = findRecord("Livestock", id);
  if (!row) return;
  livestockForm.elements.earTag.value = row.earTag || "";
  livestockForm.elements.breed.value = row.breed || "";
  livestockForm.elements.history.value = row.history || "";
  setFormEditing(livestockForm, row, { edit: "บันทึกการแก้ไข" });
}

function setupListActions(container, sheet, editHandler, labelField) {
  container.addEventListener("click", (event) => {
    const imageButton = event.target.closest(".open-image");
    if (imageButton) {
      openImageModal(imageButton.dataset.image);
      return;
    }

    const recordElement = event.target.closest("[data-id]");
    if (!recordElement) return;
    const id = recordElement.dataset.id;
    const record = findRecord(sheet, id);
    if (!record) return;

    if (event.target.closest(".edit-record")) editHandler(id);
    if (event.target.closest(".delete-record")) {
      deleteRecord(sheet, id, record[labelField] || "รายการนี้");
    }
  });
}

function setDefaultDates() {
  if (!expenseForm.elements.date.value) {
    expenseForm.elements.date.value = todayLocal();
  }
  if (!assetForm.elements.acquiredDate.value) {
    assetForm.elements.acquiredDate.value = todayLocal();
  }
}

function bindEvents() {
  document.querySelectorAll(".tab-btn").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".tab-btn").forEach((tab) => {
        tab.classList.remove("tab-active");
        tab.classList.add("text-slate-300");
      });
      button.classList.add("tab-active");
      button.classList.remove("text-slate-300");
      document
        .querySelectorAll(".tab-panel")
        .forEach((panel) => panel.classList.add("hidden"));
      document
        .getElementById(`panel-${button.dataset.tab}`)
        .classList.remove("hidden");
    });
  });

  document.getElementById("refreshBtn").addEventListener("click", () => {
    loadAll({ notify: true });
  });

  document.getElementById("settingsBtn").addEventListener("click", showSettings);
  document
    .getElementById("closeSettingsBtn")
    .addEventListener("click", closeSettings);
  document.getElementById("settingsModal").addEventListener("click", (event) => {
    if (event.target.id === "settingsModal") closeSettings();
  });
  document.getElementById("showTokenInput").addEventListener("change", (event) => {
    document.getElementById("accessTokenInput").type = event.target.checked
      ? "text"
      : "password";
  });
  document.getElementById("clearTokenBtn").addEventListener("click", () => {
    state.accessToken = "";
    localStorage.removeItem("smartFarmAccessToken");
    document.getElementById("accessTokenInput").value = "";
    showToast("ล้าง Access Token แล้ว", "info");
  });
  document.getElementById("settingsForm").addEventListener("submit", (event) => {
    event.preventDefault();
    state.accessToken = document
      .getElementById("accessTokenInput")
      .value.trim();
    if (state.accessToken) {
      localStorage.setItem("smartFarmAccessToken", state.accessToken);
    } else {
      localStorage.removeItem("smartFarmAccessToken");
    }
    closeSettings();
    loadAll({ notify: true });
  });

  document.getElementById("imageModal").addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeImageModal();
  });

  expenseForm.addEventListener("submit", (event) => {
    event.preventDefault();
    submitForm({
      form: expenseForm,
      sheet: "Expenses",
      folder: "invoices",
      buildRecord: (formData, photoUrl) => ({
        date: formData.get("date"),
        category: formData.get("category"),
        amount: Number(formData.get("amount")),
        description: formData.get("description") || "",
        photoUrl,
      }),
      successCreate: "บันทึกรายจ่ายสำเร็จ",
      successUpdate: "แก้ไขรายจ่ายสำเร็จ",
      defaultLabel: "บันทึกรายจ่าย",
    });
  });

  assetForm.addEventListener("submit", (event) => {
    event.preventDefault();
    submitForm({
      form: assetForm,
      sheet: "Assets",
      folder: "assets",
      buildRecord: (formData, photoUrl) => ({
        assetName: formData.get("assetName"),
        acquiredDate: formData.get("acquiredDate"),
        condition: formData.get("condition"),
        note: formData.get("note") || "",
        photoUrl,
      }),
      successCreate: "เพิ่มสินทรัพย์สำเร็จ",
      successUpdate: "แก้ไขสินทรัพย์สำเร็จ",
      defaultLabel: "เพิ่มสินทรัพย์",
    });
  });

  livestockForm.addEventListener("submit", (event) => {
    event.preventDefault();
    submitForm({
      form: livestockForm,
      sheet: "Livestock",
      folder: "livestock",
      buildRecord: (formData, photoUrl) => ({
        earTag: formData.get("earTag"),
        breed: formData.get("breed"),
        history: formData.get("history") || "",
        photoUrl,
      }),
      successCreate: "บันทึกข้อมูลสุกรสำเร็จ",
      successUpdate: "แก้ไขข้อมูลสุกรสำเร็จ",
      defaultLabel: "บันทึกข้อมูลสุกร",
    });
  });

  expenseForm
    .querySelector(".cancel-edit")
    .addEventListener("click", () =>
      cancelEdit(expenseForm, "บันทึกรายจ่าย")
    );
  assetForm
    .querySelector(".cancel-edit")
    .addEventListener("click", () =>
      cancelEdit(assetForm, "เพิ่มสินทรัพย์")
    );
  livestockForm
    .querySelector(".cancel-edit")
    .addEventListener("click", () =>
      cancelEdit(livestockForm, "บันทึกข้อมูลสุกร")
    );

  document
    .getElementById("expenseSearch")
    .addEventListener("input", renderExpenses);
  document
    .getElementById("assetSearch")
    .addEventListener("input", renderAssets);
  document
    .getElementById("assetConditionFilter")
    .addEventListener("change", renderAssets);
  document
    .getElementById("livestockSearch")
    .addEventListener("input", renderLivestock);

  setupListActions(expenseList, "Expenses", editExpense, "category");
  setupListActions(assetTableBody, "Assets", editAsset, "assetName");
  setupListActions(livestockGrid, "Livestock", editLivestock, "earTag");
}

function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch((error) => {
      console.warn("Service worker registration failed", error);
    });
  }
}

document.addEventListener("DOMContentLoaded", () => {
  bindEvents();
  setDefaultDates();
  registerServiceWorker();
  loadAll();
});
