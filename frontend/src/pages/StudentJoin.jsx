import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { publicApi } from "../api/client";

export default function StudentJoin() {
  const { sessionId } = useParams();
  const videoRef  = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);

  const [phase, setPhase]         = useState("checking");
  const [nameInput, setNameInput] = useState(() => localStorage.getItem("ce_join_name") || "");
  const [emailInput, setEmailInput] = useState(() => localStorage.getItem("ce_join_email") || "");
  const [nameError, setNameError] = useState("");
  const [joining, setJoining]     = useState(false);
  const [studentIndex, setStudentIndex] = useState(null);
  const [myName, setMyName]       = useState("");
  const [score, setScore]         = useState(null);

  // Check session status using PUBLIC endpoint — no auth needed
  useEffect(() => {
    publicApi.get(`/sessions/${sessionId}/status`)
      .then(({ data }) => {
        if (data.isLive) setPhase("lobby");
        else setPhase("ended");
      })
      .catch(() => setPhase("error"));
  }, [sessionId]);

  const handleJoin = async (e) => {
    e.preventDefault();
    if (!nameInput.trim()) { setNameError("Please enter your name"); return; }
    setNameError("");
    setJoining(true);

    // Save for next time
    localStorage.setItem("ce_join_name", nameInput.trim());
    if (emailInput.trim()) localStorage.setItem("ce_join_email", emailInput.trim());

    try {
      const { data } = await publicApi.post(`/sessions/${sessionId}/join`, {
        name: nameInput.trim(),
        email: emailInput.trim() || null,
      });
      setStudentIndex(data.studentIndex);
      setMyName(data.name);
      setPhase("starting_camera");
    } catch (err) {
      if (err.response?.data?.code === "SESSION_ENDED") {
        setPhase("ended");
      } else {
        setNameError(err.response?.data?.error || "Could not join. Try again.");
      }
    } finally {
      setJoining(false);
    }
  };

  // Start camera
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
          if (!canvasRef.current) canvasRef.current = document.createElement("canvas");
          const canvas = canvasRef.current;
          canvas.width = 320; canvas.height = 240;
          const ctx = canvas.getContext("2d");
          if (!ctx) return;
          ctx.drawImage(video, 0, 0, 320, 240);
          frames.push(canvas.toDataURL("image/jpeg", 0.7).split(",")[1]);
        }, 1000);

        sendInterval = setInterval(async () => {
          if (!frames.length) return;
          const frame = frames[frames.length - 1];
          frames.length = 0;
          try {
            const { data } = await publicApi.post(`/sessions/${sessionId}/frames`, {
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

  const Wrap = ({ children }) => (
    <div className="min-h-screen bg-[#080B0F] flex flex-col items-center justify-center px-4">
      {children}
    </div>
  );

  // ── Screens ──────────────────────────────────────────────

  if (phase === "checking") return (
    <Wrap><Logo />
      <div className="text-center">
        <span className="animate-spin w-6 h-6 border-2 border-[#00FF87] border-t-transparent rounded-full inline-block mb-3" />
        <p className="text-gray-500 text-sm font-mono">Checking session…</p>
      </div>
    </Wrap>
  );

  if (phase === "ended") return (
    <Wrap><Logo />
      <div className="card max-w-sm w-full text-center">
        <div className="text-5xl mb-4">🔒</div>
        <h2 className="font-bold text-xl mb-2" style={{ fontFamily: "Syne,sans-serif" }}>
          Session has ended
        </h2>
        <p className="text-gray-400 text-sm mb-1">The tutor has ended this session.</p>
        <p className="text-gray-600 text-xs font-mono">You can no longer join.</p>
      </div>
    </Wrap>
  );

  if (phase === "error") return (
    <Wrap><Logo />
      <div className="card max-w-sm w-full text-center">
        <div className="text-4xl mb-3">⚠️</div>
        <p className="text-gray-300 text-sm">Session not found.</p>
        <p className="text-gray-600 text-xs mt-2 font-mono">Ask your tutor to resend the link.</p>
      </div>
    </Wrap>
  );

  if (phase === "cam_denied") return (
    <Wrap><Logo />
      <div className="card max-w-sm w-full text-center">
        <div className="text-4xl mb-3">🚫</div>
        <p className="text-gray-300 text-sm">Camera permission denied.</p>
        <p className="text-gray-500 text-xs mt-2">Allow camera access in your browser and refresh.</p>
      </div>
    </Wrap>
  );

  // ── Lobby — enter name + email ────────────────────────────
  if (phase === "lobby") return (
    <Wrap><Logo />
      <div className="card max-w-sm w-full">
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg mb-6 text-xs font-mono"
          style={{ background: "rgba(0,255,135,0.08)", border: "1px solid rgba(0,255,135,0.2)", color: "#00FF87" }}>
          <span className="w-1.5 h-1.5 bg-[#00FF87] rounded-full animate-pulse" />
          Session is live — join now
        </div>

        <h2 className="font-bold text-xl mb-1" style={{ fontFamily: "Syne,sans-serif" }}>
          Join session
        </h2>
        <p className="text-gray-500 text-sm mb-5">
          Enter your details to join.
        </p>

        <form onSubmit={handleJoin} className="space-y-3">
          {/* Name */}
          <div>
            <label className="block text-xs text-gray-500 mb-1.5 font-mono uppercase tracking-wider">
              Your name *
            </label>
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
              <p className="text-xs mt-1 font-mono" style={{ color: "#FF4545" }}>{nameError}</p>
            )}
          </div>

          {/* Email */}
          <div>
            <label className="block text-xs text-gray-500 mb-1.5 font-mono uppercase tracking-wider">
              Email <span className="text-gray-700">(optional)</span>
            </label>
            <input
              type="email"
              value={emailInput}
              onChange={(e) => setEmailInput(e.target.value)}
              placeholder="your@email.com"
              className="w-full bg-[#21262D] border border-[#30363D] rounded-lg px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-[#00FF87] transition-colors text-sm"
            />
            <p className="text-[10px] text-gray-600 mt-1 font-mono">
              Your tutor may use this to share session reports with you.
            </p>
          </div>

          <button
            type="submit"
            disabled={joining || !nameInput.trim()}
            className="btn-primary w-full py-3 flex items-center justify-center gap-2"
          >
            {joining ? (
              <><span className="animate-spin w-4 h-4 border-2 border-[#080B0F] border-t-transparent rounded-full" />Joining…</>
            ) : "Join session →"}
          </button>
        </form>

        <p className="text-center text-xs text-gray-700 mt-4 font-mono">
          Your camera will turn on after joining
        </p>
      </div>
    </Wrap>
  );

  if (phase === "starting_camera") return (
    <Wrap><Logo />
      <div className="card max-w-sm w-full text-center">
        <span className="animate-spin w-6 h-6 border-2 border-[#00FF87] border-t-transparent rounded-full inline-block mb-3" />
        <p className="text-gray-300 text-sm">Starting camera, {myName}…</p>
        <p className="text-gray-600 text-xs mt-1 font-mono">Allow camera access when prompted</p>
      </div>
    </Wrap>
  );

  // ── Active ────────────────────────────────────────────────
  return (
    <Wrap><Logo />
      <div className="w-full max-w-sm space-y-4">
        <div className="flex items-center justify-between px-1">
          <p className="font-medium text-white text-sm">{myName}</p>
          <div className="flex items-center gap-1.5 text-xs font-mono" style={{ color: "#00FF87" }}>
            <span className="w-1.5 h-1.5 bg-[#00FF87] rounded-full animate-pulse" />Live
          </div>
        </div>

        <div className="relative rounded-xl overflow-hidden"
          style={{ border: score !== null && score < 40 ? "1px solid rgba(255,69,69,0.5)" : "1px solid #21262D" }}>
          <video ref={videoRef} autoPlay muted playsInline
            className="w-full aspect-video object-cover bg-[#0D1117]" />
          <div className="absolute bottom-3 right-3 px-3 py-2 rounded-xl text-center"
            style={{ background: "rgba(13,17,23,0.92)", border: "1px solid #21262D" }}>
            <p className="font-mono font-bold text-3xl leading-none" style={{ color: scoreColor }}>
              {score ?? "—"}
            </p>
            <p className="text-[10px] text-gray-500 mt-0.5">{score === null ? "waiting…" : "/100"}</p>
          </div>
        </div>

        {score !== null && (
          <div className="rounded-xl p-4" style={{ background: "#161B22", border: "1px solid #21262D" }}>
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs font-mono text-gray-500">Your engagement</span>
              <span className="font-mono font-bold text-sm" style={{ color: scoreColor }}>{score}/100</span>
            </div>
            <div className="bg-[#21262D] rounded-full h-2 overflow-hidden">
              <div className="h-full rounded-full transition-all duration-700"
                style={{ width: `${score}%`, background: scoreColor }} />
            </div>
            <p className="text-[10px] text-gray-600 mt-2 text-center font-mono">{scoreLabel}</p>
          </div>
        )}

        <p className="text-center text-xs text-gray-700 font-mono">
          Keep this tab open for the entire session
        </p>
      </div>
    </Wrap>
  );
}