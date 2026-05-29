import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import api from "../api/client";

export default function StudentJoin() {
  const { sessionId } = useParams();
  const videoRef  = useRef(null);
  const canvasRef = useRef(document.createElement("canvas"));
  const streamRef = useRef(null);

  const [phase, setPhase]               = useState("checking"); // checking | lobby | active | ended | error
  const [nameInput, setNameInput]       = useState("");
  const [nameError, setNameError]       = useState("");
  const [joining, setJoining]           = useState(false);
  const [studentIndex, setStudentIndex] = useState(null);
  const [myName, setMyName]             = useState("");
  const [score, setScore]               = useState(null);
  const [sessionInfo, setSessionInfo]   = useState(null);

  // Step 1 — check session status
  useEffect(() => {
    api.get(`/sessions/${sessionId}`)
      .then(({ data }) => {
        setSessionInfo(data.session);
        if (data.session?.status === "completed") {
          setPhase("ended");
        } else {
          setPhase("lobby");
        }
      })
      .catch(() => setPhase("error"));
  }, [sessionId]);

  // Step 2 — student submits their name
  const handleJoin = async (e) => {
    e.preventDefault();
    if (!nameInput.trim()) { setNameError("Please enter your name"); return; }
    setNameError("");
    setJoining(true);
    try {
      const { data } = await api.post(`/sessions/${sessionId}/join`, {
        name: nameInput.trim(),
      });
      setStudentIndex(data.studentIndex);
      setMyName(data.name);
      setPhase("starting_camera");
    } catch (err) {
      const code = err.response?.data?.code;
      if (code === "SESSION_ENDED") {
        setPhase("ended");
      } else {
        setNameError(err.response?.data?.error || "Could not join. Try again.");
      }
    } finally {
      setJoining(false);
    }
  };

  // Step 3 — start camera after name confirmed
  useEffect(() => {
    if (phase !== "starting_camera") return;

    let captureInterval, sendInterval;
    const frames = [];

    navigator.mediaDevices
      .getUserMedia({ video: { width: 640, height: 480 }, audio: false })
      .then((stream) => {
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
        setPhase("active");

        captureInterval = setInterval(() => {
          const video = videoRef.current;
          if (!video || video.readyState < 2) return;
          const canvas = canvasRef.current;
          canvas.width = 320; canvas.height = 240;
          canvas.getContext("2d").drawImage(video, 0, 0, 320, 240);
          frames.push(canvas.toDataURL("image/jpeg", 0.7).split(",")[1]);
        }, 1000);

        sendInterval = setInterval(async () => {
          if (!frames.length) return;
          const frame = frames[frames.length - 1];
          frames.length = 0;
          try {
            const { data } = await api.post(`/sessions/${sessionId}/frames`, {
              frames: [{ studentIndex, frame }],
            });
            setScore(data.scores?.[0]?.engagementScore ?? null);
          } catch (err) {
            if (err.response?.status === 404) {
              setPhase("ended");
              stream.getTracks().forEach(t => t.stop());
              clearInterval(captureInterval);
              clearInterval(sendInterval);
            }
          }
        }, 5000);
      })
      .catch(() => setPhase("cam_denied"));

    return () => {
      clearInterval(captureInterval);
      clearInterval(sendInterval);
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, [phase, sessionId, studentIndex]);

  // ── Shared styles ─────────────────────────────────────────
  const scoreColor = score === null ? "#6B7280"
    : score >= 70 ? "#00FF87"
    : score >= 40 ? "#FFB800"
    : "#FF4545";

  const scoreLabel = score === null ? "Connecting..."
    : score >= 70 ? "Great focus! 👍"
    : score >= 40 ? "Try to stay focused"
    : "Your tutor has been notified ⚠";

  const Logo = () => (
    <div className="text-center mb-8">
      <p className="font-bold text-2xl tracking-tight" style={{ fontFamily: "Syne,sans-serif" }}>
        Classroom<span style={{ color: "#00FF87" }}>Eye</span>
      </p>
    </div>
  );

  const Wrapper = ({ children }) => (
    <div className="min-h-screen bg-[#080B0F] flex flex-col items-center justify-center px-4">
      {children}
    </div>
  );

  // ── Phase: checking ───────────────────────────────────────
  if (phase === "checking") return (
    <Wrapper>
      <Logo />
      <div className="text-center">
        <span className="animate-spin w-6 h-6 border-2 border-[#00FF87] border-t-transparent rounded-full inline-block mb-3" />
        <p className="text-gray-500 text-sm font-mono">Checking session…</p>
      </div>
    </Wrapper>
  );

  // ── Phase: ended ──────────────────────────────────────────
  if (phase === "ended") return (
    <Wrapper>
      <Logo />
      <div className="card max-w-sm w-full text-center">
        <div className="text-5xl mb-4">🔒</div>
        <h2 className="font-bold text-xl mb-2" style={{ fontFamily: "Syne,sans-serif" }}>
          Session has ended
        </h2>
        <p className="text-gray-400 text-sm mb-1">
          The tutor has ended this session.
        </p>
        <p className="text-gray-600 text-xs font-mono">
          You can no longer join.
        </p>
      </div>
    </Wrapper>
  );

  // ── Phase: error ──────────────────────────────────────────
  if (phase === "error") return (
    <Wrapper>
      <Logo />
      <div className="card max-w-sm w-full text-center">
        <div className="text-4xl mb-3">⚠️</div>
        <p className="text-gray-300 text-sm">Session not found.</p>
        <p className="text-gray-600 text-xs mt-2 font-mono">
          Ask your tutor to resend the link.
        </p>
      </div>
    </Wrapper>
  );

  // ── Phase: cam_denied ─────────────────────────────────────
  if (phase === "cam_denied") return (
    <Wrapper>
      <Logo />
      <div className="card max-w-sm w-full text-center">
        <div className="text-4xl mb-3">🚫</div>
        <p className="text-gray-300 text-sm">Camera permission denied.</p>
        <p className="text-gray-500 text-xs mt-2">
          Allow camera access in your browser and refresh the page.
        </p>
      </div>
    </Wrapper>
  );

  // ── Phase: lobby — enter your name ────────────────────────
  if (phase === "lobby") return (
    <Wrapper>
      <Logo />
      <div className="card max-w-sm w-full">
        {/* Session info */}
        <div
          className="flex items-center gap-2 px-3 py-2 rounded-lg mb-6 text-xs font-mono"
          style={{ background: "rgba(0,255,135,0.08)", border: "1px solid rgba(0,255,135,0.2)", color: "#00FF87" }}
        >
          <span className="w-1.5 h-1.5 bg-[#00FF87] rounded-full animate-pulse" />
          Session is live — join now
        </div>

        <h2 className="font-bold text-xl mb-1" style={{ fontFamily: "Syne,sans-serif" }}>
          What's your name?
        </h2>
        <p className="text-gray-500 text-sm mb-6">
          Your tutor will see your engagement score during the session.
        </p>

        <form onSubmit={handleJoin} className="space-y-4">
          <div>
            <input
              type="text"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              placeholder="Enter your full name"
              autoFocus
              maxLength={50}
              className="w-full bg-[#21262D] border rounded-lg px-4 py-3 text-white placeholder-gray-600 focus:outline-none transition-colors text-sm"
              style={{ borderColor: nameError ? "#FF4545" : "#30363D" }}
            />
            {nameError && (
              <p className="text-xs mt-1.5 font-mono" style={{ color: "#FF4545" }}>{nameError}</p>
            )}
          </div>

          <button
            type="submit"
            disabled={joining || !nameInput.trim()}
            className="btn-primary w-full py-3 flex items-center justify-center gap-2"
          >
            {joining ? (
              <><span className="animate-spin w-4 h-4 border-2 border-[#080B0F] border-t-transparent rounded-full" />Joining…</>
            ) : (
              "Join session →"
            )}
          </button>
        </form>

        <p className="text-center text-xs text-gray-700 mt-4 font-mono">
          Your camera will turn on after joining
        </p>
      </div>
    </Wrapper>
  );

  // ── Phase: starting_camera ────────────────────────────────
  if (phase === "starting_camera") return (
    <Wrapper>
      <Logo />
      <div className="card max-w-sm w-full text-center">
        <span className="animate-spin w-6 h-6 border-2 border-[#00FF87] border-t-transparent rounded-full inline-block mb-3" />
        <p className="text-gray-300 text-sm">Starting camera, {myName}…</p>
        <p className="text-gray-600 text-xs mt-1 font-mono">Allow camera access when prompted</p>
      </div>
    </Wrapper>
  );

  // ── Phase: active — live session ──────────────────────────
  return (
    <Wrapper>
      <Logo />
      <div className="w-full max-w-sm space-y-4">

        {/* Name + status */}
        <div className="flex items-center justify-between px-1">
          <p className="font-medium text-white text-sm">{myName}</p>
          <div className="flex items-center gap-2 text-xs font-mono" style={{ color: "#00FF87" }}>
            <span className="w-1.5 h-1.5 bg-[#00FF87] rounded-full animate-pulse" />
            Live
          </div>
        </div>

        {/* Camera */}
        <div
          className="relative rounded-xl overflow-hidden"
          style={{
            border: score !== null && score < 40
              ? "1px solid rgba(255,69,69,0.5)"
              : "1px solid #21262D",
          }}
        >
          <video
            ref={videoRef}
            autoPlay muted playsInline
            className="w-full aspect-video object-cover bg-[#0D1117]"
          />

          {/* Score overlay */}
          <div
            className="absolute bottom-3 right-3 px-3 py-2 rounded-xl text-center"
            style={{ background: "rgba(13,17,23,0.92)", border: "1px solid #21262D" }}
          >
            <p className="font-mono font-bold text-3xl leading-none" style={{ color: scoreColor }}>
              {score ?? "—"}
            </p>
            <p className="text-[10px] text-gray-500 mt-0.5">
              {score === null ? "waiting…" : "/100"}
            </p>
          </div>
        </div>

        {/* Score bar */}
        {score !== null && (
          <div
            className="rounded-xl p-4"
            style={{ background: "#161B22", border: "1px solid #21262D" }}
          >
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs font-mono text-gray-500">Your engagement</span>
              <span className="font-mono font-bold text-sm" style={{ color: scoreColor }}>
                {score}/100
              </span>
            </div>
            <div className="bg-[#21262D] rounded-full h-2 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{ width: `${score}%`, background: scoreColor }}
              />
            </div>
            <p className="text-[10px] text-gray-600 mt-2 text-center font-mono">
              {scoreLabel}
            </p>
          </div>
        )}

        <p className="text-center text-xs text-gray-700 font-mono">
          Keep this tab open for the entire session
        </p>
      </div>
    </Wrapper>
  );
}