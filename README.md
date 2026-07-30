# Smart Farm Asset & Traceability System — นิพนธ์ ฟาร์ม

เว็บแอปบนมือถือสำหรับจัดการข้อมูลหลักของฟาร์ม 3 ส่วน:

1. รายจ่ายและรูปใบเสร็จ
2. สินทรัพย์และสถานะอุปกรณ์
3. ทะเบียนสุกรและประวัติสุขภาพ

ระบบใช้ GitHub Pages เป็นหน้าเว็บ, Google Sheets เป็นฐานข้อมูล, Google Apps Script เป็น API และ ImageKit เป็นพื้นที่เก็บรูป

## ความสามารถใน v1.0

- เพิ่ม แก้ไข ค้นหา กรอง และนำรายการออกจากหน้าหลัก
- การลบเป็นแบบเก็บถาวรในชีต (`deletedAt`) จึงยังกู้ข้อมูลได้
- สร้าง UUID ให้ทุกรายการ รวมถึงข้อมูลเก่าที่มีอยู่แล้ว
- ป้องกันหมายเลขเบอร์หูซ้ำ
- ตรวจสอบข้อมูลทั้ง Frontend และ Backend
- Dashboard สรุปรายจ่าย สินทรัพย์ที่รอซ่อม และจำนวนสุกร
- Health check สำหรับตรวจ API, ImageKit และโหมดความปลอดภัย
- รองรับ Access Token โดยไม่ฝัง Token ไว้ใน GitHub
- ติดตั้งเป็น Web App บนหน้าจอมือถือได้ (PWA)
- มี unit tests สำหรับฟังก์ชันสำคัญของ Frontend

## โครงสร้างไฟล์

```text
├── index.html              # UI หลัก
├── app.js                  # การทำงานของหน้าเว็บและ API client
├── core.js                 # ฟังก์ชันที่ใช้ร่วมกันและทดสอบได้
├── Code.gs                 # Google Apps Script Backend
├── manifest.webmanifest    # PWA manifest
├── sw.js                   # Offline app shell
├── icon.svg                # ไอคอนแอป
├── package.json            # คำสั่งตรวจและทดสอบ
└── test/
    ├── core.test.js        # Unit tests
    └── smoke.js            # Browser smoke test
```

## ติดตั้ง Backend

### 1. เตรียม Google Sheets และ Apps Script

1. เปิด Google Sheet ที่จะใช้เป็นฐานข้อมูล
2. เลือก **Extensions → Apps Script**
3. นำโค้ดทั้งหมดจาก `Code.gs` ไปแทนโค้ดเดิม
4. ตั้ง Time zone ของโปรเจกต์เป็น `Asia/Bangkok`
5. เลือกฟังก์ชัน `setupSystem` แล้วกด **Run** หนึ่งครั้ง
6. อนุญาตสิทธิ์ Google Sheets เมื่อระบบถาม

`setupSystem` จะสร้างหรือปรับตาราง `Expenses`, `Assets` และ `Livestock` โดยไม่ลบข้อมูลเก่า

### 2. ตั้ง Script Properties

ไปที่ **Project Settings → Script Properties** แล้วเพิ่ม:

| Property | จำเป็น | รายละเอียด |
|---|---:|---|
| `IMAGEKIT_PRIVATE_KEY` | ใช่ เมื่ออัปโหลดรูป | Private key จาก ImageKit ห้ามใส่ใน GitHub |
| `APP_ACCESS_TOKEN` | แนะนำอย่างยิ่ง | ข้อความลับยาวอย่างน้อย 32 ตัวอักษร |
| `SPREADSHEET_ID` | เฉพาะ standalone script | ID ของ Google Sheet; ไม่ต้องใช้เมื่อสร้างสคริปต์จากในชีต |

ตัวอย่างสร้าง Access Token แบบสุ่มจากเครื่องที่มี Node.js:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 3. Deploy Apps Script

1. เลือก **Deploy → Manage deployments**
2. หากมี deployment เดิม ให้กดรูปดินสอแล้วเลือก **New version**
3. Type: **Web app**
4. Execute as: **Me**
5. Who has access: **Anyone**
6. กด **Deploy** และคัดลอก URL ที่ลงท้ายด้วย `/exec`
7. ใส่ URL นั้นใน `CONFIG.API_URL` ที่ต้นไฟล์ `app.js`

ทดสอบ Backend:

```text
https://script.google.com/macros/s/DEPLOYMENT_ID/exec?action=health
```

ผลที่ถูกต้องต้องมี `"status":"success"` และ `"version":"1.0.0"`

## ตั้งค่า ImageKit

1. เปิด ImageKit Dashboard
2. นำ Private key ไปเก็บใน `IMAGEKIT_PRIVATE_KEY` ของ Apps Script
3. ใส่ Public key ใน `CONFIG.IMAGEKIT_PUBLIC_KEY`
4. ใส่ URL endpoint ใน `CONFIG.IMAGEKIT_URL_ENDPOINT`

Private key ต้องอยู่ใน Script Properties เท่านั้น

## ใช้งาน Access Token บนหน้าเว็บ

หลังตั้ง `APP_ACCESS_TOKEN` แล้ว:

1. เปิดหน้าเว็บ
2. กดปุ่ม ⚙️ มุมขวาบน
3. วาง Token เดียวกับที่ตั้งใน Apps Script
4. กด **บันทึกและเชื่อมต่อ**

Token จะถูกเก็บใน `localStorage` ของอุปกรณ์นั้น ไม่ได้ถูก commit ขึ้น GitHub หากเปลี่ยนเครื่องหรือเคลียร์ข้อมูลเบราว์เซอร์ต้องกรอกใหม่

## Deploy Frontend บน GitHub Pages

ไปที่ **Settings → Pages**

- Source: **Deploy from a branch**
- Branch: `main`
- Folder: `/ (root)`

หน้าเว็บของ repository นี้:

```text
https://aodxx.github.io/Smart-Farm-Asset-Traceability-System/
```

## ทดสอบในเครื่อง

ต้องมี Node.js 20 ขึ้นไป

```bash
npm run check
npm test
python3 -m http.server 4173
```

จากนั้นเปิด `http://localhost:4173`

Browser smoke test ต้องติดตั้ง Playwright และ Chromium ก่อน:

```bash
npx playwright install chromium
node test/smoke.js
```

## API Contract

### Health check

```http
GET /exec?action=health
```

### อ่านข้อมูล

```http
GET /exec?action=list&sheet=Expenses&token=APP_ACCESS_TOKEN
```

ชื่อชีตที่รองรับ: `Expenses`, `Assets`, `Livestock`

### เพิ่มข้อมูล

```json
{
  "action": "create",
  "sheet": "Assets",
  "token": "APP_ACCESS_TOKEN",
  "record": {
    "assetName": "ปั๊มน้ำ",
    "acquiredDate": "2026-07-30",
    "condition": "ดี",
    "note": "โรงเรือน A",
    "photoUrl": ""
  }
}
```

### แก้ไขหรือนำออก

ใช้ `action` เป็น `update`, `delete` หรือ `restore` และส่ง `id` ของรายการ

## การกู้คืนข้อมูลที่นำออก

การกดลบบนหน้าเว็บจะบันทึกวันที่ในคอลัมน์ `deletedAt` แทนการลบแถวจริง หากต้องการกู้คืน ให้ล้างค่า `deletedAt` ใน Google Sheet หรือเรียก API ด้วย `action: "restore"`

## ข้อจำกัดของ v1.0

- เหมาะกับฟาร์มขนาดเล็กถึงกลางและผู้ใช้งานจำนวนน้อย
- Access Token เป็นรหัสร่วมของทีม ยังไม่มีบัญชีผู้ใช้แยกคนและสิทธิ์ตามบทบาท
- หน้าแอปที่เคยเปิดแล้วเปิดแบบ offline ได้ แต่การอ่าน/บันทึกข้อมูลต้องเชื่อมต่ออินเทอร์เน็ต
- หลังแก้ `Code.gs` ต้องสร้าง Apps Script deployment version ใหม่เสมอ
