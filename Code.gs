/**
 * =====================================================================
 * Smart Farm Asset & Traceability System — Code.gs
 * นิพนธ์ ฟาร์ม
 * =====================================================================
 * วิธีติดตั้ง:
 * 1. เปิด Google Sheets ไฟล์ใหม่ (นี่คือ "Database" ของระบบ)
 * 2. เมนู Extensions > Apps Script แล้ววางโค้ดนี้ทับไฟล์ Code.gs เดิม
 * 3. กด Deploy > New deployment > เลือกประเภท "Web app"
 *    - Execute as: Me
 *    - Who has access: Anyone
 * 4. คัดลอก Web App URL ไปวางที่ CONFIG.API_URL ในไฟล์ app.js
 *
 * Sheet ที่ระบบจะสร้างอัตโนมัติหากยังไม่มี: Expenses, Assets, Livestock
 * =====================================================================
 */

// ชื่อ Sheet และหัวคอลัมน์ (Header) มาตรฐานของแต่ละโมดูล
const SHEET_SCHEMAS = {
  Expenses: ["timestamp", "date", "category", "amount", "description", "photoUrl"],
  Assets: ["timestamp", "assetName", "acquiredDate", "condition", "note", "photoUrl"],
  Livestock: ["timestamp", "earTag", "breed", "history", "photoUrl"],
};

/* ---------------------------------------------------------------------
 * doGet — อ่านข้อมูลจาก Sheet ที่กำหนด แล้วส่งกลับเป็น JSON
 * ตัวอย่างเรียกใช้: {API_URL}?sheet=Expenses
 * ------------------------------------------------------------------- */
function doGet(e) {
  try {
    const action = e.parameter && e.parameter.action;

    // Endpoint พิเศษสำหรับ ImageKit client-side upload authentication
    // เรียกใช้ผ่าน: {API_URL}?action=imagekitAuth
    if (action === "imagekitAuth") {
      return jsonResponse(getImageKitAuthParams());
    }

    const sheetName = (e.parameter && e.parameter.sheet) || "Expenses";
    const sheet = getOrCreateSheet(sheetName);
    const data = readSheetAsObjects(sheet);
    return jsonResponse({ status: "success", sheet: sheetName, data: data });
  } catch (err) {
    return jsonResponse({ status: "error", message: err.message });
  }
}

/* ---------------------------------------------------------------------
 * ImageKit Authentication — สร้าง token/signature/expire สำหรับ
 * Client-side Upload ตาม ImageKit Server-side Auth spec
 *
 * ต้องตั้งค่า Script Property ชื่อ IMAGEKIT_PRIVATE_KEY ก่อนใช้งาน:
 * เมนู Project Settings (⚙️) > Script Properties > Add script property
 *   Key: IMAGEKIT_PRIVATE_KEY   Value: private_xxxxxxxxxxxx (จาก ImageKit Dashboard)
 * ------------------------------------------------------------------- */
function getImageKitAuthParams() {
  const privateKey = PropertiesService.getScriptProperties().getProperty("IMAGEKIT_PRIVATE_KEY");
  if (!privateKey) {
    throw new Error("ยังไม่ได้ตั้งค่า IMAGEKIT_PRIVATE_KEY ใน Script Properties");
  }

  const token = Utilities.getUuid();
  const expire = Math.floor(Date.now() / 1000) + 60 * 10; // หมดอายุใน 10 นาที
  const signatureString = token + expire;

  const signatureBytes = Utilities.computeHmacSha1Signature(signatureString, privateKey);
  const signature = signatureBytes
    .map((byte) => {
      const v = (byte < 0 ? byte + 256 : byte).toString(16);
      return v.length === 1 ? "0" + v : v;
    })
    .join("");

  return { token: token, expire: expire, signature: signature };
}

/* ---------------------------------------------------------------------
 * doPost — รับ JSON payload แล้ว appendRow ลง Sheet ที่กำหนด
 * Body ที่คาดหวัง: { "sheet": "Expenses", "record": { ...fields } }
 *
 * หมายเหตุ: Frontend ส่งด้วย Content-Type: text/plain เพื่อเลี่ยง
 * CORS preflight (OPTIONS) ซึ่ง Apps Script Web App ไม่รองรับโดยตรง
 * ------------------------------------------------------------------- */
function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);
    const sheetName = payload.sheet;
    const record = payload.record || {};

    if (!sheetName || !SHEET_SCHEMAS[sheetName]) {
      throw new Error("ไม่พบ sheet ที่ระบุ: " + sheetName);
    }

    const sheet = getOrCreateSheet(sheetName);
    const headers = SHEET_SCHEMAS[sheetName];

    const row = headers.map((col) => {
      if (col === "timestamp") return new Date();
      return record[col] !== undefined ? record[col] : "";
    });

    sheet.appendRow(row);

    return jsonResponse({ status: "success", message: "บันทึกข้อมูลสำเร็จ", sheet: sheetName });
  } catch (err) {
    return jsonResponse({ status: "error", message: err.message });
  }
}

/* ---------------------------------------------------------------------
 * Helper: ดึง Sheet ตามชื่อ ถ้ายังไม่มีให้สร้างใหม่พร้อม Header
 * ------------------------------------------------------------------- */
function getOrCreateSheet(sheetName) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(sheetName);

  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  }

  const headers = SHEET_SCHEMAS[sheetName] || SHEET_SCHEMAS.Expenses;

  // Auto-create header row หากแถวแรกยังว่างอยู่
  const firstRow = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
  const hasHeader = firstRow.some((cell) => cell !== "");
  if (!hasHeader) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold");
  }

  return sheet;
}

/* ---------------------------------------------------------------------
 * Helper: อ่านข้อมูลทั้ง Sheet แล้วแปลงเป็น Array ของ Object
 * โดยใช้แถวแรก (header) เป็นชื่อ key
 * ------------------------------------------------------------------- */
function readSheetAsObjects(sheet) {
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  if (lastRow < 2) return [];

  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const values = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();

  return values.map((row) => {
    const obj = {};
    headers.forEach((header, i) => {
      let val = row[i];
      // แปลง Date object เป็น string รูปแบบอ่านง่าย
      if (val instanceof Date) {
        val = Utilities.formatDate(val, Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ss");
      }
      obj[header] = val;
    });
    return obj;
  });
}

/* ---------------------------------------------------------------------
 * Helper: สร้าง JSON response (ContentService จะแนบ
 * Access-Control-Allow-Origin: * ให้อัตโนมัติสำหรับ simple request)
 * ------------------------------------------------------------------- */
function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}
