# Project Progress

อัปเดตล่าสุด: 2026-07-30

## สถานะ

ระบบ v1.0 deploy แล้ว ตั้งค่าความปลอดภัยและ ImageKit แล้ว พร้อมแก้สถานะการเชื่อมต่อให้สะท้อนคำขอล่าสุดอย่างถูกต้อง

## เสร็จแล้ว

- [x] ตรวจสอบ GitHub Pages และ Apps Script endpoint เดิม
- [x] พบต้นเหตุอัปโหลดรูป: `Utilities.computeHmacSha1Signature` ไม่มีใน Apps Script
- [x] เปลี่ยนเป็น `Utilities.computeHmacSignature` พร้อม `HMAC_SHA_1`
- [x] เพิ่ม schema migration โดยไม่ลบข้อมูลเก่า
- [x] เพิ่ม UUID, `updatedAt` และ soft delete (`deletedAt`)
- [x] เพิ่ม Create, Read, Update, Delete/Restore API
- [x] เพิ่ม validation และป้องกันเบอร์หูซ้ำ
- [x] เพิ่ม Access Token จาก Script Properties
- [x] เพิ่ม Dashboard, ค้นหา, กรอง, แก้ไข และลบใน Frontend
- [x] ป้องกันการแทรก HTML และ URL รูปที่ไม่ปลอดภัย
- [x] เพิ่ม timeout และข้อความผิดพลาดของ API
- [x] เพิ่ม PWA app shell
- [x] เพิ่ม unit tests
- [x] Deploy Apps Script API v1.0.0 และยืนยัน health endpoint
- [x] ตั้ง `IMAGEKIT_PRIVATE_KEY` และ `APP_ACCESS_TOKEN`
- [x] แก้ ImageKit SDK v4 ให้ส่ง `token`, `signature` และ `expire` ในคำสั่งอัปโหลด
- [x] เพิ่ม validation สำหรับข้อมูลยืนยัน ImageKit
- [x] เปลี่ยน PWA cache เป็น v3 เพื่อบังคับรับไฟล์แก้ไขล่าสุด
- [x] แก้สถานะการเชื่อมต่อค้างหลังบันทึกสำเร็จ
- [x] แยกสถานะ Token ผิด, เครือข่ายขัดข้อง และระบบขัดข้องบางส่วน
- [x] เพิ่มเอกสาร `SYSTEM_OVERVIEW.md` สำหรับระบบปัจจุบันและ Roadmap

## ต้องทำตอน Deploy

- [x] นำ `Code.gs` เวอร์ชันล่าสุดไปวางใน Apps Script
- [x] ตั้ง Script Properties: `IMAGEKIT_PRIVATE_KEY` และ `APP_ACCESS_TOKEN`
- [ ] ตั้ง Time zone เป็น `Asia/Bangkok`
- [ ] Run `setupSystem`
- [x] สร้าง Web app deployment version ใหม่
- [x] ยืนยัน health endpoint เป็น API v1.0.0
- [ ] ทดสอบเพิ่ม/แก้ไข/ลบข้อมูลอย่างละ 1 รายการ
- [ ] ทดสอบอัปโหลดรูปจริงจากโทรศัพท์

## ขั้นถัดไปหลัง v1.0

- บัญชีผู้ใช้และสิทธิ์ Admin/Manager/Staff
- ประวัติการซ่อมบำรุงสินทรัพย์
- ประวัติวัคซีน/ผสมพันธุ์แบบหลายรายการต่อสุกร
- รายงานรายเดือนและส่งออก PDF/CSV
