/* global ImageKit, FarmCore */

"use strict";

const CONFIG = {
  API_URL:
    "https://script.google.com/macros/s/AKfycbyHwX6e4ZsPQUBvp1-iwOkxK6Dy_tlx8bUyWoS6faTlLhb8jSIXmyPfQQ4bCtYfekQ2ng/exec",
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
    authenticationEndpoint: apiUrl({ action: "imagekitAuth" }),
  });
}

function uploadToImageKit(file, folder, currentUrl = "") {
  return new Promise((resolve, reject) => {
    if (!file || !file.size) return resolve(currentUrl);

    const validation = validateFile(file);
    if (!validation.valid) return reject(new Error(validation.message));

    const fileName = `${Date.now()}_${file.name}`.replace(
      /[^a-zA-Z0-9._-]+/g,
      "_"
    );
    getImageKitClient().upload(
      {
        file,
        fileName,
        folder: `/${folder}/`,
        useUniqueFileName: true,
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
