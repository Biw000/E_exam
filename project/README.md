# E-Exam Online Examination System

ระบบสอบออนไลน์ Full-Stack พร้อมยืนยันตัวตนด้วยใบหน้า (Face Verification) และระบบตรวจจับความผิดปกติระหว่างสอบ (Anti-Cheat)

- **Frontend:** Next.js 14 (App Router) + TypeScript + Tailwind CSS → Deploy บน **Vercel**
- **Backend:** FastAPI (Python) + SQLAlchemy + OpenCV + MediaPipe → Deploy บน **Render Web Service** (ไม่ใช้ Docker)
- **Database:** PostgreSQL บน **Render**

---

## 1. Project Overview

Flow การใช้งานหลัก:

```
สมัครสมาชิก (พร้อมลงทะเบียนใบหน้า)
   → เข้าสู่ระบบ
   → เลือกข้อสอบ
   → ยืนยันตัวตนด้วยใบหน้า
   → เริ่มทำข้อสอบ (มี Timer, Auto Save, ตรวจจับใบหน้าเป็นระยะ)
   → ส่งข้อสอบ (อัตโนมัติเมื่อหมดเวลา หรือกดส่งเอง)
   → ดูคะแนน
   → Admin ดูผลสอบและ Suspicious Events ทั้งหมด
```

---

## 2. Technology Stack

| ส่วน | เทคโนโลยี |
|---|---|
| Frontend | Next.js 14, TypeScript, React, Tailwind CSS |
| Camera/Anti-cheat (Browser API) | `getUserMedia`, Fullscreen API, `document.visibilityState` |
| Backend | Python 3.11+, FastAPI, Uvicorn, SQLAlchemy, Pydantic |
| Auth | JWT (python-jose) + bcrypt (passlib) |
| Face Recognition | OpenCV + MediaPipe (Pre-trained เท่านั้น ไม่มีการ Train Model เอง) |
| Database | PostgreSQL |
| Deployment | Vercel (Frontend), Render (Backend + PostgreSQL) |

**หมายเหตุเรื่อง Face Recognition:** ระบบใช้ MediaPipe Face Detection สำหรับนับจำนวนใบหน้า และ MediaPipe Face Mesh (468 landmark points) เพื่อสร้างเวกเตอร์ที่ใช้เป็น "Face Embedding" แบบ Geometric แล้วเปรียบเทียบด้วย Cosine Distance กับค่า Threshold ที่กำหนดใน Environment Variable (`FACE_MATCH_THRESHOLD`) วิธีนี้เป็น Pre-trained Pipeline ที่ไม่ต้อง Train หรือเตรียม Dataset เอง เหมาะกับ MVP ที่มีเวลาพัฒนาจำกัด หากต้องการความแม่นยำสูงขึ้นในอนาคต สามารถเปลี่ยนไปใช้โมเดล Embedding อื่น (เช่น FaceNet/ArcFace) ได้โดยแก้เฉพาะ `app/services/face_service.py` เท่านั้น โดยไม่กระทบส่วนอื่นของระบบ

---

## 3. Folder Structure

```
project/
├── backend/
│   ├── app/
│   │   ├── main.py            # FastAPI entrypoint
│   │   ├── config.py          # Settings (.env) — Threshold ทุกตัวมาจากที่นี่
│   │   ├── database.py        # SQLAlchemy engine/session
│   │   ├── deps.py            # Auth dependencies (get_current_user, require_admin, ...)
│   │   ├── models/             # SQLAlchemy models
│   │   ├── schemas/            # Pydantic schemas
│   │   ├── routers/            # API routes
│   │   └── services/
│   │       ├── face_service.py     # Face detection/embedding/compare
│   │       ├── exam_service.py     # Exam time/status logic
│   │       ├── scoring_service.py  # Auto scoring
│   │       └── security.py         # JWT + password hashing
│   ├── seed.py                 # Seed script (dev only)
│   ├── requirements.txt
│   └── .env.example
│
├── frontend/
│   ├── app/
│   │   ├── login/, register/, student/, exam/[id]/, admin/...
│   ├── components/
│   │   ├── Camera.tsx, FaceVerification.tsx, ExamTimer.tsx, QuestionCard.tsx, Navbar.tsx
│   ├── lib/
│   │   ├── api.ts, auth.ts
│   └── types/
│
└── README.md
```

---

## 4. Installation

### Requirements
- Node.js 18+
- Python 3.11+
- PostgreSQL (ใช้ Render PostgreSQL หรือ Local ก็ได้)

Clone/แตกไฟล์โปรเจกต์ แล้วเข้าไปที่ทั้งสองโฟลเดอร์ `backend/` และ `frontend/` ตามขั้นตอนด้านล่าง

---

## 5. Environment Variables

### Backend (`backend/.env`)

คัดลอกจาก `backend/.env.example`:

```env
DATABASE_URL=postgresql://user:password@host:5432/dbname
JWT_SECRET=change-this-to-a-long-random-secret
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=1440
FRONTEND_URL=http://localhost:3000
FACE_MATCH_THRESHOLD=0.6
FACE_CHECK_INTERVAL_SECONDS=7
```

> `FRONTEND_URL` รองรับหลาย origin คั่นด้วย comma เช่น `http://localhost:3000,https://your-app.vercel.app`

### Frontend (`frontend/.env.local`)

คัดลอกจาก `frontend/.env.local.example`:

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```

---

## 6. Run Backend (Local, Windows/Mac/Linux — ไม่ใช้ Docker)

```bash
cd backend
python -m venv venv
```

Windows:
```bash
venv\Scripts\activate
```

Mac/Linux:
```bash
source venv/bin/activate
```

ติดตั้ง dependency:
```bash
pip install -r requirements.txt
```

สร้างไฟล์ `.env` จาก `.env.example` แล้วใส่ค่า `DATABASE_URL` ของคุณ

รัน Backend:
```bash
uvicorn app.main:app --reload
```

Backend จะรันที่ `http://localhost:8000` และ Table ทั้งหมดจะถูกสร้างอัตโนมัติเมื่อ Start ครั้งแรก (ผ่าน `Base.metadata.create_all`)

---

## 7. Database Setup

### แบบ Local
สร้าง PostgreSQL database ในเครื่อง แล้วใส่ connection string ใน `DATABASE_URL`

### แบบ Render (แนะนำสำหรับ Production)
ดูหัวข้อ "Render Deployment" ด้านล่าง

---

## 8. Seed Database

หลังตั้งค่า `.env` และ activate venv แล้ว:

```bash
python seed.py
```

จะได้บัญชีทดสอบ (**Dev/Test เท่านั้น ห้ามใช้จริง**):

| Role | Email | Password |
|---|---|---|
| Admin | admin@example.com | DevAdmin123! |
| Student | student@example.com | DevStudent123! |

พร้อมข้อสอบตัวอย่าง "Programming Fundamentals" 2 คำถาม

> หมายเหตุ: บัญชี student ที่ seed มาจะมี Face Embedding แบบ Placeholder (สุ่มค่า) เนื่องจากสร้างผ่านสคริปต์โดยไม่ผ่านกล้องจริง จึง**จะไม่ผ่าน Face Verification จริง** — สำหรับทดสอบ Flow แบบเต็มให้สมัครสมาชิกใหม่ผ่านหน้าเว็บเพื่อลงทะเบียนใบหน้าจริงจากกล้อง

---

## 9. Run Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend จะรันที่ `http://localhost:3000`

---

## 10. API Summary

| Method | Path | คำอธิบาย |
|---|---|---|
| POST | `/api/auth/register` | สมัครสมาชิก + ลงทะเบียนใบหน้า |
| POST | `/api/auth/login` | เข้าสู่ระบบ |
| GET | `/api/auth/me` | ข้อมูลผู้ใช้ปัจจุบัน |
| POST | `/api/face/verify` | ยืนยันใบหน้ากับ Embedding ที่ลงทะเบียนไว้ |
| GET/POST/PUT/DELETE | `/api/exams` | จัดการข้อสอบ |
| POST/PUT/DELETE | `/api/exams/{id}/questions`, `/api/questions/{id}` | จัดการคำถาม |
| POST | `/api/exams/{id}/start` | เริ่มทำข้อสอบ (ต้องยืนยันใบหน้าก่อน) |
| GET | `/api/attempts/{id}` | ข้อมูลการทำข้อสอบ + คำตอบที่บันทึกไว้ |
| POST | `/api/attempts/{id}/answers` | บันทึกคำตอบ (Auto Save) |
| POST | `/api/attempts/{id}/submit` | ส่งข้อสอบ |
| POST | `/api/attempts/{id}/events` | บันทึก Suspicious Event (Tab Switch, Fullscreen Exit ฯลฯ) |
| POST | `/api/attempts/{id}/face-check` | ตรวจใบหน้าเป็นระยะระหว่างสอบ |
| GET | `/api/results/my` | ผลสอบของตนเอง |
| GET | `/api/admin/results` | ผลสอบทั้งหมด (Admin) |
| GET | `/api/admin/attempts/{id}/events` | Suspicious Events ของ Attempt นั้น (Admin) |
| GET | `/api/admin/dashboard` | สถิติภาพรวม (Admin) |
| GET | `/health` | Health Check |

เอกสาร API แบบ Interactive (Swagger UI) ดูได้ที่ `http://localhost:8000/docs` เมื่อรัน Backend

---

## 11. Face Registration

ตอนสมัครสมาชิก ระบบจะขอเปิดกล้อง (หลังจากผู้ใช้กดยินยอมในข้อความ Privacy Notice) ตรวจว่าพบใบหน้าเดียว สร้าง Face Embedding แล้วบันทึกลงฐานข้อมูลพร้อมสร้างบัญชี **ไม่มีการส่ง Embedding กลับไปยัง Frontend**

## 12. Face Verification

ก่อนเริ่มทำข้อสอบทุกครั้ง ระบบจะให้ยืนยันใบหน้าอีกครั้งผ่านกล้อง โดยเทียบกับ Embedding ที่ลงทะเบียนไว้ ถ้าค่า Distance สูงกว่า `FACE_MATCH_THRESHOLD` จะขึ้นข้อความ "Face verification failed" และไม่สามารถเริ่มสอบได้

## 13. Exam Flow

Timer คำนวณจาก `started_at` (เวลาฝั่ง Server) + duration ของข้อสอบ ฝั่ง Backend เป็นผู้ตรวจสอบเวลาหมดเขตจริงทุกครั้งที่มีการบันทึกคำตอบหรือส่งข้อสอบ (ไม่เชื่อเวลาจาก Frontend อย่างเดียว) คำตอบจะถูกบันทึกอัตโนมัติ (Debounce ~800ms) ทั้งใน Backend และ localStorage ของเบราว์เซอร์ เพื่อให้ Refresh หน้าแล้วคำตอบไม่หาย และถ้า Internet หลุดชั่วคราว ระบบจะ Sync คำตอบที่ค้างอยู่อัตโนมัติเมื่อกลับมาออนไลน์

## 14. Anti-Cheat

ระบบไม่ฟันธงว่าเหตุการณ์ใดคือการโกง แต่บันทึกเป็น Suspicious Event ประเภทต่าง ๆ (`NO_FACE`, `MULTIPLE_FACES`, `FACE_MISMATCH`, `TAB_SWITCH`, `FULLSCREEN_EXIT`, `CAMERA_DISABLED`) ให้ Admin ตรวจสอบภายหลัง การตรวจใบหน้าระหว่างสอบทำเป็นช่วง ๆ (ทุก ~7 วินาที ตาม `FACE_CHECK_INTERVAL_SECONDS`) ไม่ส่ง Video Stream ต่อเนื่อง เพื่อประหยัด Bandwidth

---

## 15. Local Development (สรุป)

เปิด 2 terminal:

```bash
# Terminal 1 - backend
cd backend
venv\Scripts\activate   # หรือ source venv/bin/activate บน Mac/Linux
uvicorn app.main:app --reload

# Terminal 2 - frontend
cd frontend
npm run dev
```

เปิดเบราว์เซอร์ที่ `http://localhost:3000`

---

## 16. Render Deployment (Backend + PostgreSQL) — ไม่ใช้ Docker

1. **สร้าง PostgreSQL บน Render**
   - ไปที่ Render Dashboard → **New** → **PostgreSQL**
   - ตั้งชื่อ database เช่น `eexam-db` แล้วกด Create
   - รอจนสถานะเป็น Available แล้วคัดลอกค่า **Internal Database URL** (ถ้า Web Service อยู่ Region เดียวกัน) หรือ **External Database URL**

2. **สร้าง Web Service สำหรับ Backend**
   - Render Dashboard → **New** → **Web Service**
   - เลือก **Connect a repository** แล้วเชื่อม GitHub Repository ของโปรเจกต์นี้
   - ตั้งค่า:
     - **Root Directory:** `backend`
     - **Runtime:** Python 3
     - **Build Command:** `pip install -r requirements.txt`
     - **Start Command:** `uvicorn app.main:app --host 0.0.0.0 --port $PORT`

3. **เชื่อม GitHub Repository**
   - เลือก Branch ที่ต้องการ Deploy (เช่น `main`)
   - เปิด Auto-Deploy ถ้าต้องการให้ Deploy อัตโนมัติทุกครั้งที่ Push

4. **ตั้ง Environment Variables** (ในหน้า Web Service → Environment)
   ```
   DATABASE_URL = <Database URL จากขั้นตอนที่ 1>
   JWT_SECRET = <สุ่มค่าความยาวมาก ๆ>
   JWT_ALGORITHM = HS256
   ACCESS_TOKEN_EXPIRE_MINUTES = 1440
   FRONTEND_URL = https://your-frontend.vercel.app
   FACE_MATCH_THRESHOLD = 0.6
   FACE_CHECK_INTERVAL_SECONDS = 7
   ```

5. **Build/Deploy**
   - กด **Create Web Service** — Render จะ Build และ Deploy ให้อัตโนมัติ
   - รอจนสถานะเป็น **Live**

6. **ตั้ง CORS ให้ Frontend**
   - ตรวจสอบว่า `FRONTEND_URL` ตรงกับ URL จริงของ Vercel (ระบบอ่านค่านี้ไปตั้ง CORS ให้อัตโนมัติใน `app/main.py`)
   - ถ้ามีหลาย Origin (เช่น Preview URL ของ Vercel) ใส่คั่นด้วย comma ได้

7. **ตรวจสอบ Health Endpoint**
   - เปิด `https://your-backend.onrender.com/health`
   - ควรได้ผลลัพธ์ `{"status": "ok"}`

8. **(ถ้าต้องการ) รัน Seed บน Render**
   - ใช้ Render Shell (ในหน้า Web Service → Shell) แล้วรัน `python seed.py`

---

## 17. Vercel Deployment (Frontend)

1. ไปที่ [vercel.com](https://vercel.com) → **New Project** → เลือก Repository นี้
2. ตั้งค่า:
   - **Root Directory:** `frontend`
   - **Framework Preset:** Next.js (ระบบจะ detect อัตโนมัติ)
3. ตั้ง Environment Variable:
   ```
   NEXT_PUBLIC_API_URL = https://your-backend.onrender.com
   ```
4. กด **Deploy**
5. หลัง Deploy เสร็จ ให้กลับไปตั้งค่า `FRONTEND_URL` ใน Render Backend ให้ตรงกับ URL ของ Vercel (ดูข้อ 16.6) แล้ว Redeploy Backend อีกครั้งเพื่อให้ CORS อัปเดต

---

## 18. Troubleshooting

| ปัญหา | สาเหตุที่เป็นไปได้ / วิธีแก้ |
|---|---|
| `Camera Permission Denied` | ผู้ใช้ปฏิเสธสิทธิ์กล้อง — ต้องอนุญาตผ่าน Browser Settings แล้วโหลดหน้าใหม่ |
| Face verification failed ตลอด | ตรวจสอบแสง/มุมกล้อง หรือปรับค่า `FACE_MATCH_THRESHOLD` ใน `.env` ของ Backend (ค่าที่สูงขึ้น = อนุญาตง่ายขึ้น) |
| CORS Error บน Frontend | ตรวจสอบว่า `FRONTEND_URL` ใน Backend ตรงกับ URL จริงของ Frontend เป๊ะ ๆ (รวม https://) |
| `DATABASE_URL` เชื่อมต่อไม่ได้บน Render | ใช้ Internal Database URL ถ้า Web Service กับ PostgreSQL อยู่ Region เดียวกัน; ใช้ External URL ถ้าเชื่อมจากภายนอก |
| Deploy บน Render ค้างที่ Build | ตรวจสอบว่า Root Directory ตั้งเป็น `backend` และ `requirements.txt` อยู่ในโฟลเดอร์นั้นจริง |
| Exam Not Started / Expired | เวลาปัจจุบันอยู่นอกช่วง `start_time` – `end_time` ของข้อสอบ (Backend ตรวจสอบเสมอ ไม่ขึ้นกับนาฬิกาเครื่อง Client) |
| Attempt Already Submitted | พยายามส่งคำตอบ/ส่งข้อสอบซ้ำหลัง Submit ไปแล้ว ระบบป้องกันไว้โดยเจตนา |
| mediapipe ติดตั้งไม่ผ่านบน Render | ตรวจสอบว่าใช้ Python 3.11 (Render Environment → Python Version) และใช้เวอร์ชันตรงตาม `requirements.txt` |

---

## Security Notes

- Password ถูก Hash ด้วย bcrypt เสมอ ไม่เก็บ Plain Text
- Face Embedding และ Password Hash จะไม่ถูกส่งกลับไปยัง Frontend ในทุก Response
- ทุก API ที่ต้องการสิทธิ์จะตรวจสอบ JWT และ Role (`student`/`admin`) ผ่าน FastAPI Dependencies
- Student ไม่สามารถเข้าถึง Attempt ของผู้อื่น หรือเรียก Admin API ได้ (ตรวจสอบทุกครั้งฝั่ง Backend)
- เวลาสอบและการป้องกัน Submit ซ้ำ ตรวจสอบฝั่ง Backend เสมอ ไม่พึ่งพา Frontend
