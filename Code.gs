/**
 * Smart Farm Asset & Traceability API
 * Google Apps Script + Google Sheets
 *
 * Script Properties:
 * - IMAGEKIT_PRIVATE_KEY (required for image uploads)
 * - APP_ACCESS_TOKEN     (recommended; protects reads and writes)
 * - SPREADSHEET_ID       (optional for standalone scripts)
 */

const APP_VERSION = "1.0.0";
const SHEET_SCHEMAS = {
  Expenses: [
    "id",
    "timestamp",
    "updatedAt",
    "deletedAt",
    "date",
    "category",
    "amount",
    "description",
    "photoUrl",
  ],
  Assets: [
    "id",
    "timestamp",
    "updatedAt",
    "deletedAt",
    "assetName",
    "acquiredDate",
    "condition",
    "note",
    "photoUrl",
  ],
  Livestock: [
    "id",
    "timestamp",
    "updatedAt",
    "deletedAt",
    "earTag",
    "breed",
    "history",
    "photoUrl",
  ],
};

const WRITABLE_FIELDS = {
  Expenses: ["date", "category", "amount", "description", "photoUrl"],
  Assets: ["assetName", "acquiredDate", "condition", "note", "photoUrl"],
  Livestock: ["earTag", "breed", "history", "photoUrl"],
};

function doGet(e) {
  try {
    const params = (e && e.parameter) || {};
    const action = params.action || "list";

    if (action === "health") {
      return jsonResponse(getHealth());
    }

    assertAuthorized(params.token);

    if (action === "imagekitAuth") {
      // ImageKit JavaScript SDK requires these fields at the response root.
      return jsonResponse(getImageKitAuthParams());
    }

    if (action !== "list") {
      throw apiError("UNSUPPORTED_ACTION", "ไม่รองรับ action: " + action);
    }

    const sheetName = assertSheetName(params.sheet || "Expenses");
    const rows = listRecords(sheetName, {
      includeDeleted: params.includeDeleted === "true",
      query: params.query || "",
    });

    return jsonResponse({
      status: "success",
      version: APP_VERSION,
      sheet: sheetName,
      data: rows,
    });
  } catch (err) {
    return errorResponse(err);
  }
}

function doPost(e) {
  let lock;
  try {
    const payload = parsePayload(e);
    assertAuthorized(payload.token);

    const action = payload.action || "create";
    const sheetName = assertSheetName(payload.sheet);
    lock = LockService.getScriptLock();
    lock.waitLock(10000);

    let result;
    if (action === "create") {
      result = createRecord(sheetName, payload.record || {});
    } else if (action === "update") {
      result = updateRecord(sheetName, payload.id, payload.record || {});
    } else if (action === "delete") {
      result = archiveRecord(sheetName, payload.id);
    } else if (action === "restore") {
      result = restoreRecord(sheetName, payload.id);
    } else {
      throw apiError("UNSUPPORTED_ACTION", "ไม่รองรับ action: " + action);
    }

    return jsonResponse({
      status: "success",
      version: APP_VERSION,
      action: action,
      sheet: sheetName,
      data: result,
    });
  } catch (err) {
    return errorResponse(err);
  } finally {
    if (lock && lock.hasLock()) lock.releaseLock();
  }
}

/**
 * Run once from the Apps Script editor after pasting this file.
 * It creates/migrates all sheets and returns a setup summary.
 */
function setupSystem() {
  const result = {};
  Object.keys(SHEET_SCHEMAS).forEach(function (sheetName) {
    const sheet = getOrCreateSheet(sheetName);
    result[sheetName] = Math.max(0, sheet.getLastRow() - 1);
  });
  return {
    status: "success",
    version: APP_VERSION,
    timezone: Session.getScriptTimeZone(),
    rows: result,
  };
}

function getHealth() {
  const properties = PropertiesService.getScriptProperties();
  const accessToken = properties.getProperty("APP_ACCESS_TOKEN");
  const imageKitKey = properties.getProperty("IMAGEKIT_PRIVATE_KEY");
  const counts = {};

  Object.keys(SHEET_SCHEMAS).forEach(function (sheetName) {
    counts[sheetName] = listRecords(sheetName).length;
  });

  return {
    status: "success",
    version: APP_VERSION,
    service: "Smart Farm Asset & Traceability API",
    timestamp: new Date().toISOString(),
    secureMode: Boolean(accessToken),
    imageUploadConfigured: Boolean(imageKitKey),
    counts: counts,
  };
}

function getImageKitAuthParams() {
  const privateKey = PropertiesService.getScriptProperties().getProperty(
    "IMAGEKIT_PRIVATE_KEY"
  );
  if (!privateKey) {
    throw apiError(
      "IMAGEKIT_NOT_CONFIGURED",
      "ยังไม่ได้ตั้งค่า IMAGEKIT_PRIVATE_KEY ใน Script Properties"
    );
  }

  const token = Utilities.getUuid();
  const expire = Math.floor(Date.now() / 1000) + 10 * 60;
  const signatureBytes = Utilities.computeHmacSignature(
    Utilities.MacAlgorithm.HMAC_SHA_1,
    token + expire,
    privateKey
  );

  return {
    token: token,
    expire: expire,
    signature: bytesToHex(signatureBytes),
  };
}

function listRecords(sheetName, options) {
  const opts = options || {};
  const rows = readSheetAsObjects(getOrCreateSheet(sheetName));
  const query = cleanText(opts.query).toLowerCase();

  return rows.filter(function (row) {
    if (!opts.includeDeleted && row.deletedAt) return false;
    if (!query) return true;
    return Object.keys(row).some(function (key) {
      return String(row[key] || "")
        .toLowerCase()
        .includes(query);
    });
  });
}

function createRecord(sheetName, input) {
  const sheet = getOrCreateSheet(sheetName);
  const record = sanitizeRecord(sheetName, input);
  validateRecord(sheetName, record);
  assertNoDuplicate(sheetName, record);

  const now = new Date();
  const fullRecord = Object.assign({}, record, {
    id: Utilities.getUuid(),
    timestamp: now,
    updatedAt: now,
    deletedAt: "",
  });

  appendObjectRow(sheet, fullRecord);
  return serializeObject(fullRecord);
}

function updateRecord(sheetName, id, input) {
  const sheet = getOrCreateSheet(sheetName);
  const rowNumber = findRowById(sheet, id);
  const current = readRowAsObject(sheet, rowNumber);
  const changes = sanitizeRecord(sheetName, input);
  const next = Object.assign({}, current, changes, {
    id: current.id,
    timestamp: current.timestamp,
    updatedAt: new Date(),
  });

  validateRecord(sheetName, next);
  assertNoDuplicate(sheetName, next, id);
  writeObjectToRow(sheet, rowNumber, next);
  return serializeObject(next);
}

function archiveRecord(sheetName, id) {
  const sheet = getOrCreateSheet(sheetName);
  const rowNumber = findRowById(sheet, id);
  const record = readRowAsObject(sheet, rowNumber);
  record.deletedAt = new Date();
  record.updatedAt = new Date();
  writeObjectToRow(sheet, rowNumber, record);
  return serializeObject(record);
}

function restoreRecord(sheetName, id) {
  const sheet = getOrCreateSheet(sheetName);
  const rowNumber = findRowById(sheet, id);
  const record = readRowAsObject(sheet, rowNumber);
  record.deletedAt = "";
  record.updatedAt = new Date();
  validateRecord(sheetName, record);
  assertNoDuplicate(sheetName, record, id);
  writeObjectToRow(sheet, rowNumber, record);
  return serializeObject(record);
}

function validateRecord(sheetName, record) {
  if (sheetName === "Expenses") {
    if (!isIsoDate(record.date)) {
      throw apiError("VALIDATION_ERROR", "กรุณาระบุวันที่รายจ่ายให้ถูกต้อง");
    }
    if (!cleanText(record.category)) {
      throw apiError("VALIDATION_ERROR", "กรุณาระบุหมวดหมู่รายจ่าย");
    }
    if (!Number.isFinite(Number(record.amount)) || Number(record.amount) <= 0) {
      throw apiError("VALIDATION_ERROR", "จำนวนเงินต้องมากกว่า 0");
    }
  }

  if (sheetName === "Assets") {
    if (!cleanText(record.assetName)) {
      throw apiError("VALIDATION_ERROR", "กรุณาระบุชื่อสินทรัพย์");
    }
    if (!isIsoDate(record.acquiredDate)) {
      throw apiError("VALIDATION_ERROR", "กรุณาระบุวันที่รับเข้าให้ถูกต้อง");
    }
    if (
      ["ดี", "พอใช้", "ต้องซ่อม", "ปลดระวาง"].indexOf(record.condition) === -1
    ) {
      throw apiError("VALIDATION_ERROR", "สภาพสินทรัพย์ไม่ถูกต้อง");
    }
  }

  if (sheetName === "Livestock") {
    if (!cleanText(record.earTag)) {
      throw apiError("VALIDATION_ERROR", "กรุณาระบุหมายเลขเบอร์หู");
    }
    if (!cleanText(record.breed)) {
      throw apiError("VALIDATION_ERROR", "กรุณาระบุสายพันธุ์");
    }
  }
}

function assertNoDuplicate(sheetName, record, excludeId) {
  if (sheetName !== "Livestock") return;

  const earTag = cleanText(record.earTag).toLowerCase();
  const duplicate = listRecords(sheetName).some(function (row) {
    return (
      row.id !== excludeId &&
      cleanText(row.earTag).toLowerCase() === earTag
    );
  });

  if (duplicate) {
    throw apiError(
      "DUPLICATE_EAR_TAG",
      "มีหมายเลขเบอร์หูนี้อยู่ในระบบแล้ว: " + record.earTag
    );
  }
}

function sanitizeRecord(sheetName, input) {
  const fields = WRITABLE_FIELDS[sheetName];
  const result = {};
  fields.forEach(function (field) {
    if (input[field] === undefined) return;
    result[field] =
      field === "amount" ? Number(input[field]) : cleanText(input[field]);
  });
  return result;
}

function getOrCreateSheet(sheetName) {
  const ss = getSpreadsheet();
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) sheet = ss.insertSheet(sheetName);

  ensureSchema(sheet, SHEET_SCHEMAS[sheetName]);
  ensureRowMetadata(sheet);
  return sheet;
}

function getSpreadsheet() {
  const configuredId = PropertiesService.getScriptProperties().getProperty(
    "SPREADSHEET_ID"
  );
  if (configuredId) return SpreadsheetApp.openById(configuredId);

  const active = SpreadsheetApp.getActiveSpreadsheet();
  if (!active) {
    throw apiError(
      "SPREADSHEET_NOT_CONFIGURED",
      "ไม่พบ Google Sheet ที่ผูกกับสคริปต์ กรุณาตั้งค่า SPREADSHEET_ID"
    );
  }
  return active;
}

function ensureSchema(sheet, expectedHeaders) {
  if (sheet.getLastRow() === 0) {
    sheet
      .getRange(1, 1, 1, expectedHeaders.length)
      .setValues([expectedHeaders]);
  } else {
    const width = Math.max(1, sheet.getLastColumn());
    const current = sheet.getRange(1, 1, 1, width).getValues()[0];
    const missing = expectedHeaders.filter(function (header) {
      return current.indexOf(header) === -1;
    });
    if (missing.length) {
      sheet
        .getRange(1, width + 1, 1, missing.length)
        .setValues([missing]);
    }
  }

  sheet.setFrozenRows(1);
  sheet
    .getRange(1, 1, 1, sheet.getLastColumn())
    .setFontWeight("bold")
    .setBackground("#1c3b82")
    .setFontColor("#ffffff");
}

function ensureRowMetadata(sheet) {
  if (sheet.getLastRow() < 2) return;

  const headers = getHeaders(sheet);
  const idIndex = headers.indexOf("id");
  const timestampIndex = headers.indexOf("timestamp");
  const updatedAtIndex = headers.indexOf("updatedAt");
  const range = sheet.getRange(
    2,
    1,
    sheet.getLastRow() - 1,
    headers.length
  );
  const values = range.getValues();
  let changed = false;

  values.forEach(function (row) {
    if (!row[idIndex]) {
      row[idIndex] = Utilities.getUuid();
      changed = true;
    }
    if (!row[updatedAtIndex]) {
      row[updatedAtIndex] = row[timestampIndex] || new Date();
      changed = true;
    }
  });

  if (changed) range.setValues(values);
}

function appendObjectRow(sheet, record) {
  const headers = getHeaders(sheet);
  sheet.appendRow(
    headers.map(function (header) {
      return record[header] !== undefined ? record[header] : "";
    })
  );
}

function writeObjectToRow(sheet, rowNumber, record) {
  const headers = getHeaders(sheet);
  const values = headers.map(function (header) {
    return record[header] !== undefined ? record[header] : "";
  });
  sheet.getRange(rowNumber, 1, 1, headers.length).setValues([values]);
}

function readSheetAsObjects(sheet) {
  if (sheet.getLastRow() < 2) return [];
  const headers = getHeaders(sheet);
  return sheet
    .getRange(2, 1, sheet.getLastRow() - 1, headers.length)
    .getValues()
    .map(function (row) {
      return rowToObject(headers, row);
    });
}

function readRowAsObject(sheet, rowNumber) {
  const headers = getHeaders(sheet);
  const row = sheet.getRange(rowNumber, 1, 1, headers.length).getValues()[0];
  return rowToObject(headers, row, false);
}

function rowToObject(headers, row, serialize) {
  const obj = {};
  headers.forEach(function (header, index) {
    obj[header] = row[index];
  });
  return serialize === false ? obj : serializeObject(obj);
}

function serializeObject(obj) {
  const result = {};
  Object.keys(obj).forEach(function (key) {
    const value = obj[key];
    result[key] =
      value instanceof Date
        ? Utilities.formatDate(
            value,
            Session.getScriptTimeZone(),
            "yyyy-MM-dd'T'HH:mm:ssXXX"
          )
        : value;
  });
  return result;
}

function findRowById(sheet, id) {
  const cleanId = cleanText(id);
  if (!cleanId) throw apiError("MISSING_ID", "ไม่พบรหัสรายการ");
  if (sheet.getLastRow() < 2) {
    throw apiError("NOT_FOUND", "ไม่พบรายการที่ต้องการ");
  }

  const headers = getHeaders(sheet);
  const idColumn = headers.indexOf("id") + 1;
  const values = sheet
    .getRange(2, idColumn, sheet.getLastRow() - 1, 1)
    .getValues();

  for (let index = 0; index < values.length; index += 1) {
    if (String(values[index][0]) === cleanId) return index + 2;
  }
  throw apiError("NOT_FOUND", "ไม่พบรายการที่ต้องการ");
}

function getHeaders(sheet) {
  return sheet
    .getRange(1, 1, 1, sheet.getLastColumn())
    .getValues()[0]
    .map(String);
}

function parsePayload(e) {
  if (!e || !e.postData || !e.postData.contents) {
    throw apiError("INVALID_REQUEST", "ไม่พบข้อมูลที่ส่งมา");
  }
  try {
    return JSON.parse(e.postData.contents);
  } catch (err) {
    throw apiError("INVALID_JSON", "รูปแบบ JSON ไม่ถูกต้อง");
  }
}

function assertSheetName(sheetName) {
  if (!sheetName || !SHEET_SCHEMAS[sheetName]) {
    throw apiError("INVALID_SHEET", "ไม่พบ sheet ที่ระบุ: " + sheetName);
  }
  return sheetName;
}

function assertAuthorized(providedToken) {
  const expected = PropertiesService.getScriptProperties().getProperty(
    "APP_ACCESS_TOKEN"
  );
  if (expected && String(providedToken || "") !== expected) {
    throw apiError(
      "UNAUTHORIZED",
      "Access Token ไม่ถูกต้อง กรุณาตั้งค่าการเชื่อมต่อ"
    );
  }
}

function isIsoDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
}

function cleanText(value) {
  return String(value === undefined || value === null ? "" : value).trim();
}

function bytesToHex(bytes) {
  return bytes
    .map(function (byte) {
      const value = (byte < 0 ? byte + 256 : byte).toString(16);
      return value.length === 1 ? "0" + value : value;
    })
    .join("");
}

function apiError(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

function errorResponse(err) {
  return jsonResponse({
    status: "error",
    error: {
      code: err.code || "INTERNAL_ERROR",
      message: err.message || "เกิดข้อผิดพลาดภายในระบบ",
    },
    message: err.message || "เกิดข้อผิดพลาดภายในระบบ",
  });
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}
