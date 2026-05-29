# ClassroomEye

Real-time student engagement monitoring for online tutors.

## Quick Start (Local Dev)

### 1. Install MongoDB locally (recommended — avoids Atlas DNS issues)
Download from: https://www.mongodb.com/try/download/community
After install, MongoDB runs on: mongodb://localhost:27017

### 2. Backend
```
cd backend
copy .env.example .env
# Edit .env — set MONGO_URI=mongodb://localhost:27017/classroomeye
# Generate JWT_SECRET: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
npm install
npm run dev
```
Backend runs on: http://localhost:4000

### 3. Frontend
```
cd frontend
npm install
npm run dev
```
Frontend runs on: http://localhost:5173

### 4. AI Service (optional — needed for real engagement scoring)
```
cd ai_service
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

## Stack
- AI: Python FastAPI + MediaPipe FaceMesh
- Backend: Node.js + Express + MongoDB
- Frontend: React 18 + Vite + Tailwind
- Payments: Stripe
- Deploy: Render + Vercel
