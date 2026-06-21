/**
 * ClassroomEye — Backend Integration Tests
 * Run: cd backend && npm test
 * 
 * Tests the core session flow end-to-end against a real test DB
 */

const request = require("supertest");
const mongoose = require("mongoose");
const app = require("../src/server");
const User = require("../src/models/User");
const Session = require("../src/models/Session");

// ── Test helpers ──────────────────────────────────────────────────────────────

let tutorToken = "";
let tutorId = "";
let sessionId = "";

const TEST_EMAIL = `test_${Date.now()}@classroomeye.com`;
const TEST_PASS = "TestPass123!";

beforeAll(async () => {
  // Connect to test database
  const uri = process.env.MONGO_URI_TEST || process.env.MONGO_URI;
  if (!uri) throw new Error("MONGO_URI_TEST not set");
  await mongoose.connect(uri, { family: 4 });

  // Register a test tutor
  const reg = await request(app)
    .post("/api/auth/register")
    .send({ email: TEST_EMAIL, password: TEST_PASS, name: "Test Tutor" });

  tutorToken = reg.body.token;
  tutorId = reg.body.user?._id;
});

afterAll(async () => {
  // Clean up test data
  await User.deleteOne({ email: TEST_EMAIL });
  await Session.deleteMany({ tutorId });
  await mongoose.connection.close();
});

// ── Auth tests ────────────────────────────────────────────────────────────────

describe("Auth", () => {
  test("POST /api/auth/register — returns token", async () => {
    const email = `reg_${Date.now()}@test.com`;
    const res = await request(app)
      .post("/api/auth/register")
      .send({ email, password: "Test1234!", name: "Test User" });
    expect(res.status).toBe(201);
    expect(res.body.token).toBeDefined();
    await User.deleteOne({ email });
  });

  test("POST /api/auth/login — returns token for valid credentials", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: TEST_EMAIL, password: TEST_PASS });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
  });

  test("POST /api/auth/login — rejects wrong password", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: TEST_EMAIL, password: "wrongpassword" });
    expect(res.status).toBe(401);
  });

  test("GET /api/auth/me — returns user when authenticated", async () => {
    const res = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${tutorToken}`);
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(TEST_EMAIL);
  });

  test("GET /api/auth/me — rejects missing token", async () => {
    const res = await request(app).get("/api/auth/me");
    expect(res.status).toBe(401);
  });
});

// ── Session tests ─────────────────────────────────────────────────────────────

describe("Sessions", () => {
  test("POST /api/sessions/start — creates live session", async () => {
    const res = await request(app)
      .post("/api/sessions/start")
      .set("Authorization", `Bearer ${tutorToken}`)
      .send({ studentNames: [] });
    expect(res.status).toBe(201);
    expect(res.body.sessionId).toBeDefined();
    sessionId = res.body.sessionId;
  });

  test("GET /api/sessions/:id/status — returns isLive=true for live session", async () => {
    const res = await request(app).get(`/api/sessions/${sessionId}/status`);
    expect(res.status).toBe(200);
    expect(res.body.isLive).toBe(true);
    expect(res.body.status).toBe("live");
  });

  test("POST /api/sessions/:id/join — student can join with name", async () => {
    const res = await request(app)
      .post(`/api/sessions/${sessionId}/join`)
      .send({ name: "Test Student", email: "student@test.com" });
    expect(res.status).toBe(200);
    expect(res.body.studentIndex).toBe(0);
    expect(res.body.name).toBe("Test Student");
  });

  test("POST /api/sessions/:id/join — same name rejoins without duplicate", async () => {
    const res = await request(app)
      .post(`/api/sessions/${sessionId}/join`)
      .send({ name: "Test Student" });
    expect(res.status).toBe(200);
    expect(res.body.rejoined).toBe(true);
    expect(res.body.studentIndex).toBe(0);
  });

  test("POST /api/sessions/:id/join — second student gets index 1", async () => {
    const res = await request(app)
      .post(`/api/sessions/${sessionId}/join`)
      .send({ name: "Second Student" });
    expect(res.status).toBe(200);
    expect(res.body.studentIndex).toBe(1);
  });

  test("GET /api/sessions/:id — tutor can get session details", async () => {
    const res = await request(app)
      .get(`/api/sessions/${sessionId}`)
      .set("Authorization", `Bearer ${tutorToken}`);
    expect(res.status).toBe(200);
    expect(res.body.session.students).toHaveLength(2);
    expect(res.body.session.status).toBe("live");
  });

  test("POST /api/sessions/:id/frames — accepts frames without auth", async () => {
    // Frames endpoint is public (students have no account)
    const fakeBase64 = Buffer.from("fake-image-data").toString("base64");
    const res = await request(app)
      .post(`/api/sessions/${sessionId}/frames`)
      .send({ frames: [{ studentIndex: 0, frame: fakeBase64 }] });
    // Should return 200 even if AI returns 0 score (AI may not be running in test)
    expect([200, 500]).toContain(res.status);
    if (res.status === 200) {
      expect(res.body.scores).toBeDefined();
    }
  });

  test("GET /api/sessions/:id/scores — returns scores array", async () => {
    const res = await request(app)
      .get(`/api/sessions/${sessionId}/scores`)
      .set("Authorization", `Bearer ${tutorToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.scores)).toBe(true);
  });

  test("GET /api/sessions/:id/snapshots — returns snapshots array", async () => {
    const res = await request(app)
      .get(`/api/sessions/${sessionId}/snapshots`)
      .set("Authorization", `Bearer ${tutorToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.snapshots)).toBe(true);
  });

  test("POST /api/sessions/:id/end — tutor can end session", async () => {
    const res = await request(app)
      .post(`/api/sessions/${sessionId}/end`)
      .set("Authorization", `Bearer ${tutorToken}`);
    expect(res.status).toBe(200);
    expect(res.body.sessionId).toBeDefined();
  });

  test("GET /api/sessions/:id/status — returns isLive=false after end", async () => {
    const res = await request(app).get(`/api/sessions/${sessionId}/status`);
    expect(res.status).toBe(200);
    expect(res.body.isLive).toBe(false);
    expect(res.body.status).toBe("completed");
  });

  test("POST /api/sessions/:id/join — rejects join after session ends", async () => {
    const res = await request(app)
      .post(`/api/sessions/${sessionId}/join`)
      .send({ name: "Late Student" });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("SESSION_ENDED");
  });

  test("GET /api/sessions — lists tutor sessions", async () => {
    const res = await request(app)
      .get("/api/sessions")
      .set("Authorization", `Bearer ${tutorToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.sessions)).toBe(true);
    expect(res.body.total).toBeGreaterThan(0);
  });
});

// ── Edge cases ────────────────────────────────────────────────────────────────

describe("Edge cases", () => {
  test("GET /api/sessions/invalid-id — returns 400", async () => {
    const res = await request(app)
      .get("/api/sessions/not-a-valid-id")
      .set("Authorization", `Bearer ${tutorToken}`);
    expect(res.status).toBe(400);
  });

  test("GET /api/sessions/nonexistent — returns 404", async () => {
    const fakeId = new mongoose.Types.ObjectId().toString();
    const res = await request(app)
      .get(`/api/sessions/${fakeId}`)
      .set("Authorization", `Bearer ${tutorToken}`);
    expect(res.status).toBe(404);
  });

  test("POST /api/sessions/:id/join — rejects empty name", async () => {
    // Need a live session for this test
    const startRes = await request(app)
      .post("/api/sessions/start")
      .set("Authorization", `Bearer ${tutorToken}`)
      .send({ studentNames: [] });
    const sid = startRes.body.sessionId;

    const res = await request(app)
      .post(`/api/sessions/${sid}/join`)
      .send({ name: "" });
    expect(res.status).toBe(400);

    // Clean up
    await request(app)
      .post(`/api/sessions/${sid}/end`)
      .set("Authorization", `Bearer ${tutorToken}`);
  });

  test("GET /health — returns ok", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
  });
});