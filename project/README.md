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

# --- Face engine ---
FACE_PROVIDER=local            # local | api  (ดูหัวข้อ 19)
FACE_API_URL=
FACE_API_KEY=
FACE_API_TIMEOUT=8
FACE_API_USE_REMOTE_COMPARE=false
FACE_API_FALLBACK_TO_LOCAL=true

# --- Face matching ---
FACE_MATCH_THRESHOLD=0.6
FACE_CHECK_INTERVAL_SECONDS=7
FACE_ENROLL_POSES=CENTER,LEFT,RIGHT,UP,DOWN
FACE_ENROLL_MIN_POSES=3

# --- Head pose (องศา) ---
HEAD_POSE_CENTER_TOLERANCE=12
HEAD_POSE_WARNING_YAW=15
HEAD_POSE_WARNING_PITCH=15
HEAD_POSE_CRITICAL_YAW=25
HEAD_POSE_CRITICAL_PITCH=25

# --- เกณฑ์เวลา (วินาที) ---
POSE_WARNING_DURATION=3
POSE_SUSPICIOUS_DURATION=8
FACE_ABSENCE_STRIKE_SECONDS=5
FACE_ABSENCE_RESTART_SECONDS=10
EVENT_COOLDOWN_SECONDS=20

# --- ดวงตา ---
EYE_BLINK_THRESHOLD=0.5
GAZE_AWAY_THRESHOLD=0.45
GAZE_AWAY_SECONDS=6
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

### Schema Migration

`app/main.py` ใช้ `Base.metadata.create_all()` ซึ่ง **สร้างตารางที่ยังไม่มีเท่านั้น ไม่แก้ตารางเดิม**
เมื่ออัปเดตเวอร์ชันที่มีการเปลี่ยนโครงสร้างฐานข้อมูล ต้องรันสคริปต์ migration หนึ่งครั้ง

```bash
cd backend
python migrate.py
```

สคริปต์ปลอดภัยต่อการรันซ้ำ ขั้นที่ทำไปแล้วจะถูกข้ามเอง และไม่มีการลบตารางหรือข้อมูลใด ๆ
ถ้าแผนโฮสต์ไม่มี Shell (เช่น Render Free) ให้รันจากเครื่องตนเองโดยตั้ง `DATABASE_URL`
เป็น **External Database URL** แทน Internal URL

รายละเอียดของแต่ละขั้นอยู่ใน `backend/migrations/001_multipose_and_events.sql`

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
| GET | `/api/admin/alerts` | การแจ้งเตือนเหตุการณ์ระดับ SUSPICIOUS (Admin) |
| GET | `/api/admin/users` | รายชื่อบัญชีทั้งหมด (Admin) |
| DELETE | `/api/admin/users/{id}` | ลบบัญชี (Admin) |
| GET | `/api/admin/users/{id}/results` | ประวัติการสอบรายบุคคล (Admin) |
| GET | `/api/admin/exams/{id}/stats` | สถิติของข้อสอบ (Admin) |
| GET | `/api/admin/face-provider` | ดูว่าใช้ face engine ตัวไหนอยู่ (Admin) |
| GET | `/api/subjects` | รายวิชา (GET ทุก role, POST/PUT/DELETE เฉพาะ Admin) |
| POST | `/api/exams/join` | ค้นหาข้อสอบจากรหัสเข้าห้องสอบ |
| GET | `/api/face/config` | เกณฑ์องศาและเวลาสำหรับฝั่งเบราว์เซอร์ |
| GET/POST | `/api/face/enrollment`, `/api/face/enroll` | สถานะและการลงทะเบียนใบหน้ารายมุม |
| GET | `/api/admin/exams/{id}/results.csv` | ส่งออกคะแนนรายข้อสอบ (CSV) |
| GET | `/api/admin/exams/{id}/events.csv` | ส่งออกบันทึกเหตุการณ์รายข้อสอบ (CSV) |
| GET | `/api/admin/users/{id}/results.csv` | ส่งออกประวัติการสอบรายบัญชี (CSV) |
| GET | `/api/admin/users/{id}/events.csv` | ส่งออกบันทึกเหตุการณ์รายบัญชี (CSV) |
| GET | `/api/admin/attempts/{id}/events.csv` | ส่งออกบันทึกเหตุการณ์รายครั้ง (CSV) |
| GET | `/health` | Health Check |

เอกสาร API แบบ Interactive (Swagger UI) ดูได้ที่ `http://localhost:8000/docs` เมื่อรัน Backend

---

## 11. Face Registration

ตอนสมัครสมาชิก ระบบจะขอเปิดกล้อง (หลังจากผู้ใช้กดยินยอมในข้อความ Privacy Notice) แล้วให้ลงทะเบียนใบหน้า **5 มุม** ตามลำดับใน `FACE_ENROLL_POSES` คือ มองตรง หันซ้าย หันขวา เงยหน้า ก้มหน้า

ฝั่งเบราว์เซอร์จะติดตามทิศทางศีรษะแบบเรียลไทม์เพื่อบอกผู้ใช้ว่าต้องขยับอย่างไร พร้อมตรวจว่าใบหน้าอยู่กลางกรอบและมีขนาดเหมาะสม เมื่อเข้าเงื่อนไขและค้างไว้ประมาณ 0.7 วินาทีจึงจับภาพอัตโนมัติ จากนั้นส่งทั้งชุดไปให้ Backend ตรวจคุณภาพ สร้าง Embedding ต่อมุม แล้วบันทึกลงตาราง `face_embeddings`

**ระบบไม่เก็บภาพถ่าย** เก็บเฉพาะเวกเตอร์ตัวเลข และไม่ส่ง Embedding กลับไปยัง Frontend ในทุกกรณี

## 12. Face Verification

ก่อนเริ่มทำข้อสอบทุกครั้ง ระบบจะให้ยืนยันใบหน้าผ่านกล้อง โดยเทียบกับ Embedding **ทุกมุม** ที่ลงทะเบียนไว้แล้วเลือกค่าที่ใกล้ที่สุด (`best_match`) เพื่อไม่ให้ผู้สอบที่เอียงศีรษะเล็กน้อยถูกปฏิเสธ ถ้าค่า Distance ที่ดีที่สุดยังสูงกว่า `FACE_MATCH_THRESHOLD` จะเริ่มสอบไม่ได้

ระหว่างสอบระบบยังตรวจซ้ำเป็นระยะทุก `FACE_CHECK_INTERVAL_SECONDS` ด้วยวิธีเดียวกัน

## 13. Exam Flow

Timer คำนวณจาก `started_at` (เวลาฝั่ง Server) + duration ของข้อสอบ ฝั่ง Backend เป็นผู้ตรวจสอบเวลาหมดเขตจริงทุกครั้งที่มีการบันทึกคำตอบหรือส่งข้อสอบ (ไม่เชื่อเวลาจาก Frontend อย่างเดียว) คำตอบจะถูกบันทึกอัตโนมัติ (Debounce ~800ms) ทั้งใน Backend และ localStorage ของเบราว์เซอร์ เพื่อให้ Refresh หน้าแล้วคำตอบไม่หาย และถ้า Internet หลุดชั่วคราว ระบบจะ Sync คำตอบที่ค้างอยู่อัตโนมัติเมื่อกลับมาออนไลน์

## 14. Anti-Cheat

ระบบไม่ฟันธงว่าเหตุการณ์ใดคือการทุจริต แต่บันทึกเป็นเหตุการณ์พร้อมระดับความรุนแรง (`INFO` / `WARNING` / `SUSPICIOUS`) ให้ผู้ดูแลระบบตรวจสอบภายหลัง

### การตรวจจับฝั่งเบราว์เซอร์ (ไม่ส่งวิดีโอออกนอกเครื่อง)

ทำงาน 12 ครั้งต่อวินาทีด้วย MediaPipe Face Landmarker บนเครื่องผู้สอบ แล้วส่งขึ้น Backend เฉพาะผลลัพธ์

| กลุ่ม | เหตุการณ์ |
|---|---|
| ใบหน้า | `NO_FACE`, `FACE_ABSENT`, `MULTIPLE_FACES`, `FACE_MISMATCH`, `CAMERA_DISABLED` |
| ทิศทางศีรษะ | `LOOKING_LEFT`, `LOOKING_RIGHT`, `LOOKING_UP`, `LOOKING_DOWN`, `HEAD_POSE_WARNING` |
| ดวงตา | `GAZE_AWAY`, `EYE_ACTIVITY` |
| หน้าต่าง/แป้นพิมพ์ | `TAB_SWITCH`, `WINDOW_BLUR`, `WINDOW_FOCUS`, `FULLSCREEN_EXIT`, `COPY_ATTEMPT`, `CUT_ATTEMPT`, `PASTE_ATTEMPT`, `CONTEXT_MENU`, `INPUT_ACTIVITY` |
| ระบบ | `ATTEMPT_TERMINATED`, `PROCTORING_STRIKES` |

### กฎการตัดสิน

ใช้ **องศา + ระยะเวลา + การนับเป็นช่วงเหตุการณ์** ร่วมกันเสมอ ไม่ตัดสินจากเฟรมเดียว

| เงื่อนไข | ผล |
|---|---|
| ใบหน้าหายไม่ถึง `FACE_ABSENCE_STRIKE_SECONDS` (5 วิ) | ไม่นับ |
| ใบหน้าหายครบ 5 วินาที | ผิดกฎ 1 ครั้ง |
| ใบหน้าหายต่อเนื่องเกิน `FACE_ABSENCE_RESTART_SECONDS` (10 วิ) | เริ่มการสอบใหม่ทันที |
| ผิดกฎครบ 3 ครั้ง | ยุติการสอบและเริ่มใหม่อัตโนมัติ |
| หันหน้าออกจอครบ `POSE_WARNING_DURATION` / `POSE_SUSPICIOUS_DURATION` | บันทึกเตือน / นับเป็นผิดกฎ |
| โหมดเข้มงวด: สลับหน้าจอ คัดลอก ตัด วาง ออกจากเต็มหน้าจอ | นับจนครบ `violation_limit` ของข้อสอบแล้วยุติการสอบ |

เหตุการณ์ชนิดเดียวกันที่เกิดซ้ำภายใน `EVENT_COOLDOWN_SECONDS` จะถูกรวมเป็นรายการเดียวพร้อมนับจำนวนครั้งที่ถูกรวม เพื่อไม่ให้บันทึกถูกกลบด้วยรายการซ้ำ

### สิ่งที่ระบบทำไม่ได้

เบราว์เซอร์ไม่สามารถตรวจสอบโปรแกรมอื่นบนเครื่อง จอภาพที่สอง หรือโทรศัพท์มือถือได้ ระบบจึงใช้คำว่า **กิจกรรมที่ตรวจพบ** ไม่ใช่ **การทุจริต** และการตัดสินยังเป็นหน้าที่ของผู้สอน

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

---

## 19. Face Engine: สลับระหว่างไลบรารีในเครื่องกับ API ภายนอก

ระบบแยกชั้นการตรวจจับใบหน้าออกเป็น **provider** ทำให้เปลี่ยนเครื่องมือได้โดยไม่แก้โค้ดส่วนอื่น
เลือกด้วยตัวแปรเดียวคือ `FACE_PROVIDER`

| ค่า | ความหมาย |
|---|---|
| `local` (ค่าเริ่มต้น) | MediaPipe ทำงานในโปรเซสเดียวกับ Backend ไม่มีการเรียกออกนอกระบบ |
| `api` | เรียก HTTP service ภายนอก ตามสัญญาในหัวข้อ 19.2 |

### 19.1 โครงสร้างไฟล์

```
backend/app/services/
├── face_service.py                 # Facade ที่ Router เรียกใช้ (ไม่ต้องแก้เมื่อเปลี่ยน provider)
└── face_providers/
    ├── __init__.py                 # get_provider() อ่านค่า FACE_PROVIDER
    ├── base.py                     # FaceProvider (abstract) + cosine distance + best_match
    ├── types.py                    # HeadPoseResult, FaceCheckResult
    ├── imaging.py                  # decode/encode base64 (ไม่ import mediapipe)
    ├── local.py                    # LocalFaceProvider — MediaPipe
    └── remote.py                   # RemoteFaceProvider — HTTP API
```

### 19.2 สัญญา (Contract) ที่ provider แบบ `api` คาดหวัง

ทุก request เป็น `POST` ส่ง JSON และแนบ `Authorization: Bearer <FACE_API_KEY>` ถ้าตั้งค่าคีย์ไว้

```http
POST {FACE_API_URL}/detect
{ "image_base64": "..." }
→ { "face_count": 1 }
```

```http
POST {FACE_API_URL}/analyze
{ "image_base64": "..." }
→ {
    "face_count": 1,
    "embedding": [0.012, -0.44, ...],
    "head_pose": { "yaw": -3.2, "pitch": 1.8, "roll": 0.4 },
    "quality_issues": ["TOO_DARK"]
  }
```

```http
POST {FACE_API_URL}/compare      (ไม่บังคับ)
{ "embedding_a": [...], "embedding_b": [...] }
→ { "distance": 0.23 }
```

หมายเหตุสำคัญ:

- `head_pose` ใช้หน่วยองศา โดย **yaw ติดลบ = หันไปทางซ้ายของผู้สอบ** และ **pitch บวก = เงยหน้า** ต้องตรงกับที่ฝั่งเบราว์เซอร์ใช้
- `quality_issues` รับค่า `FACE_TOO_SMALL`, `FACE_NOT_CENTERED`, `TOO_DARK`
- ถ้าไม่ทำ `/compare` ระบบจะใช้ cosine distance กับเวกเตอร์ที่ได้จาก `/analyze` แทน (ตั้ง `FACE_API_USE_REMOTE_COMPARE=false`)
- `distance` ต้องอยู่ในสเกลเดียวกับ `FACE_MATCH_THRESHOLD` คือ **0 = เหมือนกันสนิท** ถ้า service คืนค่าเป็น similarity ต้องแปลงก่อน

### 19.3 การเชื่อมกับบริการเจ้าอื่น

`remote.py` เป็นตัวแปลงแบบกลาง **ไม่ใช่ไดรเวอร์ของผู้ให้บริการรายใดรายหนึ่ง**
AWS Rekognition, Azure Face และ Face++ ใช้รูปแบบ request คนละแบบ จึงต่อตรงไม่ได้ มี 2 ทางเลือก

1. เขียน service เล็ก ๆ คั่นกลาง (adapter) ที่รับตามสัญญาข้อ 19.2 แล้วแปลงไปเรียกผู้ให้บริการอีกที
2. สืบทอดคลาสแล้ว override เมธอด `_post` หรือ `analyze` เอง เช่น

```python
# backend/app/services/face_providers/azure.py
from app.services.face_providers.remote import RemoteFaceProvider
from app.services.face_providers.types import FaceCheckResult

class AzureFaceProvider(RemoteFaceProvider):
    name = "azure-face"

    def analyze(self, image_bgr):
        # แปลง request/response ของ Azure ให้เป็น FaceCheckResult
        ...
```

จากนั้นเพิ่มเงื่อนไขใน `face_providers/__init__.py` ให้รู้จักชื่อใหม่

### 19.4 ข้อควรระวังก่อนสลับ provider

> **Embedding จากคนละโมเดลเทียบกันไม่ได้**
> เวกเตอร์ที่ MediaPipe สร้างมี 1,404 มิติจากเรขาคณิตของจุด ส่วน FaceNet มี 128 มิติ และ ArcFace มี 512 มิติ
> ซึ่งมาจากโมเดลที่ฝึกคนละแบบ การเปลี่ยน provider จึงทำให้ข้อมูลใบหน้าที่ลงทะเบียนไว้ทั้งหมดใช้ต่อไม่ได้
> **ผู้ใช้ทุกคนต้องลงทะเบียนใบหน้าใหม่** ควรวางแผนก่อนสลับบนระบบที่ใช้งานจริง

ประเด็นอื่นที่ควรพิจารณา:

- **ความเป็นส่วนตัว** — provider แบบ `api` จะส่งภาพออกนอกเซิร์ฟเวอร์ทุกครั้งที่ตรวจ ซึ่งเป็นสิ่งที่ provider แบบ `local` ถูกเลือกมาเพื่อหลีกเลี่ยง ถ้าระบบเคยประกาศกับผู้ใช้ว่าไม่ส่งข้อมูลออกนอกระบบ ต้องแจ้งผู้ใช้ก่อน
- **ค่าใช้จ่าย** — การตรวจระหว่างสอบเกิดขึ้นทุก `FACE_CHECK_INTERVAL_SECONDS` ต่อผู้สอบหนึ่งคน ผู้สอบ 30 คน สอบ 60 นาที ที่ช่วง 7 วินาที = ประมาณ 15,400 ครั้งต่อการสอบหนึ่งครั้ง
- **ความหน่วง** — `FACE_API_TIMEOUT` ตั้งไว้ 8 วินาที ถ้า service ช้ากว่านั้นการตรวจรอบนั้นจะถูกข้ามไป ไม่ทำให้การสอบหยุด
- **ความทนทาน** — `FACE_API_FALLBACK_TO_LOCAL=true` ทำให้ระบบถอยกลับไปใช้ MediaPipe เมื่อสร้าง provider แบบ api ไม่สำเร็จตอนเริ่มระบบ แต่ **ไม่ได้** ถอยกลับระหว่างทางเมื่อ API ล่มกลางคัน ในกรณีนั้นการตรวจรอบนั้นจะได้ `face_count = 0` และถูกบันทึกเป็น `NO_FACE`

### 19.5 ตรวจสอบว่าใช้ตัวไหนอยู่

```bash
curl -H "Authorization: Bearer <admin-token>" \
     https://your-backend.onrender.com/api/admin/face-provider
```

```json
{ "provider": "mediapipe-local", "detail": { "provider": "mediapipe-local", "available": true } }
```

---

## 20. การส่งออกข้อมูลเป็น CSV

ผู้ดูแลระบบส่งออกได้ 2 ระดับ คือ **รายข้อสอบ** และ **รายบัญชี** จากหน้าสถิติข้อสอบ
หน้าคะแนนรายบุคคล และหน้าบันทึกกิจกรรม

ไฟล์ที่ได้เป็น CSV ที่มี **UTF-8 BOM** นำหน้า เพื่อให้ Excel บน Windows เปิดภาษาไทยได้ถูกต้อง
(ถ้าไม่มี BOM Excel จะตีความเป็น Windows-874 แล้วอักษรไทยจะเสียทั้งไฟล์)

### การบันทึกลงโฟลเดอร์ของผู้ดูแลระบบ

เว็บแอปพลิเคชัน **ไม่สามารถสร้างโฟลเดอร์หรือเขียนไฟล์ลงเครื่องผู้ใช้เองได้** ตามข้อกำหนดด้านความปลอดภัยของเบราว์เซอร์
สิ่งที่ระบบทำได้คือใช้ File System Access API ให้ผู้ดูแลระบบ **เลือกโฟลเดอร์หนึ่งครั้ง**
แล้วไฟล์ที่ส่งออกหลังจากนั้นจะถูกเขียนลงโฟลเดอร์นั้นโดยไม่ถามซ้ำ

- รองรับเฉพาะเบราว์เซอร์ตระกูล Chromium (Chrome, Edge) บนเดสก์ท็อป
- เบราว์เซอร์อื่นจะดาวน์โหลดลงโฟลเดอร์ Downloads ตามปกติ ระบบจะแจ้งให้ทราบเอง
- สิทธิ์การเขียนมีผลเฉพาะแท็บนั้น ปิดแล้วต้องเลือกโฟลเดอร์ใหม่

---

## Security Notes

- Password ถูก Hash ด้วย bcrypt เสมอ ไม่เก็บ Plain Text
- Face Embedding และ Password Hash จะไม่ถูกส่งกลับไปยัง Frontend ในทุก Response
- ทุก API ที่ต้องการสิทธิ์จะตรวจสอบ JWT และ Role (`student`/`admin`) ผ่าน FastAPI Dependencies
- Student ไม่สามารถเข้าถึง Attempt ของผู้อื่น หรือเรียก Admin API ได้ (ตรวจสอบทุกครั้งฝั่ง Backend)
- เวลาสอบและการป้องกัน Submit ซ้ำ ตรวจสอบฝั่ง Backend เสมอ ไม่พึ่งพา Frontend
