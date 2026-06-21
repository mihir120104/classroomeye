# ClassroomEye 👁️

> Real-time student engagement monitoring for online tutors. AI-powered attention scoring via webcam — no app install needed.

**Live Demo:** [classroomeye.vercel.app](https://classroomeye.vercel.app) 

---

## What it does

Tutors start a session and share one WhatsApp link. Students join in their browser — no account, no app. ClassroomEye uses MediaPipe FaceMesh to score each student's engagement every 5 seconds and shows live scores on the tutor's dashboard.

```
Student opens join link → allows camera → engagement scored every 5s
Tutor sees live scores, snapshots, alerts for distracted students
Session ends → AI summary report generated automatically
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     STUDENT (mobile)                         │
│  Camera → Canvas → JPEG frames → POST /api/sessions/:id/frames │
└──────────────────────────┬──────────────────────────────────┘
                           │ frames (base64)
                           ▼
┌─────────────────────────────────────────────────────────────┐
│              BACKEND (Node.js + Express)                     │
│  Render.com — classroomeye-backend.onrender.com             │
│                                                              │
│  ┌─────────────┐   ┌──────────────┐   ┌─────────────────┐  │
│  │  REST API   │   │  Socket.io   │   │   MongoDB Atlas  │  │
│  │  /sessions  │   │  (WebRTC     │   │   sessions, users│  │
│  │  /auth      │   │   signaling) │   │                  │  │
│  │  /stripe    │   └──────────────┘   └─────────────────┘  │
│  └──────┬──────┘                                            │
└─────────┼───────────────────────────────────────────────────┘
          │ frames batch
          ▼
┌─────────────────────────────────────────────────────────────┐
│              AI SERVICE (Python + FastAPI)                   │
│  Render.com — classroomeye-ai.onrender.com                  │
│                                                              │
│  MediaPipe FaceMesh → Head Pose (PnP) → EAR (eye openness) │
│  → Weighted engagement score 0-100                          │
└─────────────────────────────────────────────────────────────┘
          │ scores
          ▼
┌─────────────────────────────────────────────────────────────┐
│              FRONTEND (React 18 + Vite)                      │
│  Vercel — classroomeye.vercel.app                           │
│                                                              │
│  Tutor dashboard: live scores + snapshots + WebRTC video    │
│  Student view: own camera + engagement + tutor screen share │
└─────────────────────────────────────────────────────────────┘

WebRTC (peer-to-peer):
  Student ←──── Socket.io signaling ────→ Tutor
  (video/audio direct, no media server needed)
```

---

## Tech Stack

| Layer | Tech | Version |
|---|---|---|
| Frontend | React | 18.3 |
| Build tool | Vite | 5.x |
| Styling | Tailwind CSS | 3.x |
| Backend | Node.js + Express | 20 LTS |
| Realtime | Socket.io | 4.7 |
| Database | MongoDB Atlas | 7.x (Mongoose 8) |
| AI Service | Python + FastAPI | 3.11 |
| ML | MediaPipe FaceMesh | 0.10 |
| Payments | Stripe | Latest |
| AI Summary | Anthropic Claude | claude-sonnet-4-6 |
| Frontend deploy | Vercel | — |
| Backend deploy | Render | — |

---

## How the AI scoring works

Each frame goes through 3 stages:

```
1. FACE DETECTION — MediaPipe FaceMesh (468 landmarks)
   → Is student present? Confidence score.

2. HEAD POSE — Solve PnP (Perspective-n-Point)
   → yaw (left/right) + pitch (up/down) in degrees

3. EYE OPENNESS — Eye Aspect Ratio (EAR)
   → (p2-p6 + p3-p5) / (2 * p1-p4) per eye

4. WEIGHTED SCORE
   → presence_weight * 0.3
   → head_pose_weight * 0.5  (penalizes yaw > 20°, pitch > 15°)
   → eye_weight * 0.2
   → final score: 0-100
```

Score interpretation:
- **70-100** — Focused ✅
- **40-69** — Looking away ⚠️
- **0-39** — Distracted 🔴 (tutor gets browser notification)

---

## Run locally

**Prerequisites:** Node 20+, Python 3.11+, MongoDB (or Atlas URI)

```bash
# 1. Clone
git clone https://github.com/yourusername/classroomeye.git
cd classroomeye

# 2. Backend
cd backend
cp .env.example .env
# Fill in MONGO_URI, JWT_SECRET, STRIPE keys, ANTHROPIC_API_KEY
npm install
npm run dev       # runs on :4000

# 3. AI Service
cd ../ai_service
pip install -r requirements.txt
uvicorn main:app --reload --port 8000

# 4. Frontend
cd ../frontend
cp .env.example .env
# VITE_API_URL=http://localhost:4000
npm install
npm run dev       # runs on :5173
```

**Test the flow:**
1. Register at `localhost:5173/register`
2. Click "New session" → copy join link
3. Open join link in another tab/phone
4. Enter name → allow camera → see engagement score

---

## Environment variables

### Backend `.env`
```
NODE_ENV=production
PORT=4000
MONGO_URI=mongodb://...
JWT_SECRET=your_secret_here
JWT_EXPIRES_IN=7d
FRONTEND_URL=https://classroomeye.vercel.app
AI_SERVICE_URL=https://classroomeye-ai.onrender.com
STRIPE_SECRET_KEY=sk_live_...
STRIPE_PRICE_ID=price_...
STRIPE_WEBHOOK_SECRET=whsec_...
ANTHROPIC_API_KEY=sk-ant-...
GMAIL_USER=your@gmail.com
GMAIL_APP_PASSWORD=xxxx xxxx xxxx xxxx
```

### Frontend `.env`
```
VITE_API_URL=https://classroomeye-backend.onrender.com
```

---

## Key features

- ✅ **One-link join** — students need no account
- ✅ **Real-time scores** — AI scores every 5 seconds
- ✅ **Live video** — WebRTC peer-to-peer (no media server)
- ✅ **Screen share** — tutor shares screen, students see it
- ✅ **Snapshots** — fallback face images when WebRTC unavailable
- ✅ **Distraction alerts** — browser notifications when score < 40
- ✅ **Session reports** — timeline chart + AI summary
- ✅ **Stripe subscriptions** — Free (5 sessions) / Pro ($39/mo)
- ✅ **Mobile-first** — students join on phones

---

## Known limitations

| Limitation | Reason | Fix if needed |
|---|---|---|
| WebRTC fails behind strict firewalls | No TURN server | Add Twilio TURN (~$5/mo) |
| AI service cold starts (30s) | Render free tier | Upgrade to paid or add UptimeRobot pings |
| Screen share not on iOS Safari | Browser limitation | Not fixable without native app |
| Max ~20 concurrent students tested | Socket.io room limit | Horizontal scaling with Redis adapter |

---

## Project structure

```
classroomeye/
├── ai_service/
│   ├── main.py              # FastAPI + MediaPipe scoring
│   └── requirements.txt
├── backend/
│   ├── src/
│   │   ├── config/db.js
│   │   ├── middleware/auth.js
│   │   ├── models/          # User.js, Session.js
│   │   ├── routes/          # auth.js, sessions.js, stripe.js
│   │   ├── services/        # llm.js, email.js, cron.js
│   │   └── server.js        # Express + Socket.io
│   └── tests/
│       └── sessions.test.js
└── frontend/
    └── src/
        ├── api/client.js
        ├── components/      # Navbar, StudentTile, EngagementChart
        ├── hooks/           # useWebRTC_stream.js
        ├── pages/           # Dashboard, Session, StudentJoin, SessionReport
        └── context/AuthContext.jsx
```

---

## License

MIT — free to use, modify, and deploy.

---

*Built by Mihir Patel — [LinkedIn](www.linkedin.com/in/mihir-patel-138ab7260) · [classroomeye.vercel.app](https://classroomeye.vercel.app)*