# 🌾 Smart Farm Asset & Traceability System — นิพนธ์ ฟาร์ม

ระบบจัดการฟาร์มแบบ Web Application รองรับมือถือ/แท็บเล็ต ประกอบด้วย 3 โมดูล:

1. **เวชภัณฑ์ & ใบเสร็จ** (Expenses & Invoices)
2. **ทะเบียนสินทรัพย์ & อุปกรณ์** (Farm Assets)
3. **ทะเบียนสุกร & แม่พันธุ์** (Livestock Digital Card)

**Stack:** GitHub Pages (Static Frontend) + Google Sheets (Database ผ่าน Apps Script API) + ImageKit.io (Media CDN)

---

## 📁 โครงสร้างไฟล์

```
smart-farm-asset/
├── index.html   # UI หลักแบบ SPA (Tailwind CSS)
├── app.js       # Logic, ImageKit upload, เรียก API
├── Code.gs      # Backend — วางใน Google Apps Script
└── README.md
```

---

## 🚀 ขั้นตอนติดตั้ง

### 1. ตั้งค่า Google Sheets + Apps Script (Database & API)

1. สร้าง Google Sheets ไฟล์ใหม่ ตั้งชื่อเช่น `นิพนธ์ฟาร์ม-Database`
2. เมนู **Extensions > Apps Script**
3. ลบโค้ดเดิมทั้งหมด แล้ววางโค้ดจากไฟล์ `Code.gs` ในโปรเจกต์นี้ทับเข้าไป
4. ตั้งค่า **Script Property** สำหรับ ImageKit private key (ใช้ในขั้นตอนที่ 2):
   - เมนู ⚙️ **Project Settings > Script Properties > Add script property**
   - Key: `IMAGEKIT_PRIVATE_KEY`
   - Value: `private_xxxxxxxxxxxxxxxxxxx` (จาก ImageKit Dashboard)
5. กด **Deploy > New deployment**
   - Select type: **Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
6. กด **Deploy** แล้วคัดลอก **Web app URL** ที่ได้ (รูปแบบ `https://script.google.com/macros/s/XXXXXXX/exec`)
7. Sheet ชื่อ `Expenses`, `Assets`, `Livestock` และ Header คอลัมน์ จะถูกสร้างอัตโนมัติในการเรียกครั้งแรก — ไม่ต้องสร้างมือ

> ⚠️ ทุกครั้งที่แก้โค้ดใน Apps Script ต้องกด **Deploy > Manage deployments > แก้ไข (ไอคอนดินสอ) > New version** เพื่อให้ URL เดิมใช้โค้ดล่าสุด

---

### 2. ตั้งค่า ImageKit.io (Media CDN)

1. สมัครบัญชีที่ [imagekit.io](https://imagekit.io) (มี Free tier)
2. ไปที่ **Dashboard > Developer Options** คัดลอกค่าดังนี้:
   - **Public Key** → `public_xxxxxxxxxxxxxxxxxxx`
   - **Private Key** → `private_xxxxxxxxxxxxxxxxxxx` (ใช้ในขั้นตอนที่ 1.4 เท่านั้น ห้ามใส่ใน Frontend)
   - **URL Endpoint** → `https://ik.imagekit.io/your_imagekit_id`
3. ระบบจะอัปโหลดรูปแยกโฟลเดอร์อัตโนมัติ: `/invoices/`, `/assets/`, `/livestock/`

---

### 3. ตั้งค่า Environment Variables ในโค้ด Frontend

เปิดไฟล์ `app.js` แก้ไขค่าในบล็อก `CONFIG` ด้านบนของไฟล์:

```js
const CONFIG = {
  API_URL: "https://script.google.com/macros/s/XXXXXXX/exec",       // จากขั้นตอนที่ 1.6
  IMAGEKIT_PUBLIC_KEY: "public_xxxxxxxxxxxxxxxxxxx",                 // จากขั้นตอนที่ 2.2
  IMAGEKIT_URL_ENDPOINT: "https://ik.imagekit.io/your_imagekit_id",  // จากขั้นตอนที่ 2.2
  // IMAGEKIT_AUTH_ENDPOINT ถูกคำนวณอัตโนมัติจาก API_URL แล้ว ไม่ต้องแก้
};
```

> 🔒 **หมายเหตุความปลอดภัย:** Public Key และ URL Endpoint ของ ImageKit ปลอดภัยที่จะใส่ใน Frontend ได้ แต่ **Private Key ห้ามใส่ในไฟล์ที่ push ขึ้น GitHub โดยเด็ดขาด** — เก็บไว้ที่ Script Properties ของ Apps Script เท่านั้น (ขั้นตอนที่ 1.4)

---

### 4. Deploy ขึ้น GitHub Pages

```bash
# สร้าง repository ใหม่บน GitHub ชื่อ smart-farm-asset ก่อน (ผ่านหน้าเว็บ github.com หรือ gh cli)

git init
git add .
git commit -m "Initial commit: Smart Farm Asset & Traceability System"
git branch -M main
git remote add origin https://github.com/<YOUR_USERNAME>/smart-farm-asset.git
git push -u origin main
```

จากนั้น:
1. ไปที่ **Settings > Pages** ของ Repository
2. Source: เลือก branch `main` และโฟลเดอร์ `/ (root)`
3. รอ 1-2 นาที เว็บจะออนไลน์ที่ `https://<YOUR_USERNAME>.github.io/smart-farm-asset/`

---

## 🧪 ทดสอบระบบ

1. เปิดเว็บที่ deploy แล้ว บนมือถือหรือแท็บเล็ต
2. ลองเพิ่มรายจ่ายพร้อมถ่ายรูปบิล → กด "บันทึกรายจ่าย"
3. ตรวจสอบว่า:
   - รูปขึ้นในโฟลเดอร์ `/invoices/` บน ImageKit Dashboard
   - แถวใหม่ถูกเพิ่มใน Sheet `Expenses`
   - รายการแสดงผลในหน้าเว็บพร้อม Toast แจ้งความสำเร็จ

---

## 🛠️ Troubleshooting

| ปัญหา | วิธีแก้ |
|---|---|
| CORS error ตอนบันทึกข้อมูล | ตรวจสอบว่า Deploy เป็น "Anyone" และ Frontend ส่ง POST เป็น `Content-Type: text/plain` (ตั้งไว้ให้แล้วใน `app.js`) |
| อัปโหลดรูปไม่ได้ / 403 | ตรวจ `IMAGEKIT_PRIVATE_KEY` ใน Script Properties ว่าตรงกับ Dashboard |
| ข้อมูลไม่อัปเดตหลังแก้ Code.gs | ต้องสร้าง **New version** ใน Manage deployments ทุกครั้งที่แก้โค้ด |
| ตารางไม่ขึ้น Header | ลบ Sheet ที่มีชื่อผิด แล้วรีเฟรชหน้าเว็บ ระบบจะสร้าง Sheet ใหม่พร้อม Header ให้อัตโนมัติ |

---

## 📌 หมายเหตุ

- โปรเจกต์นี้ใช้ Google Sheets เป็นฐานข้อมูล เหมาะกับข้อมูลระดับฟาร์มขนาดเล็ก-กลาง (ไม่เหมาะกับข้อมูลปริมาณมากระดับ Enterprise)
- Thumbnail ในหน้าตารางสินทรัพย์ใช้ ImageKit URL Transformation (`?tr=w-100,h-100,fo-auto`) ไม่มีการสร้างไฟล์ซ้ำ ประหยัดพื้นที่จัดเก็บ
