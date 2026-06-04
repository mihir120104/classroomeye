import { useEffect, useRef, useState, useCallback, memo } from "react";
import { useParams } from "react-router-dom";
import { publicApi } from "../api/client";
import { useStudentStream } from "../hooks/useWebRTC_stream";
// ── Isolated form component — prevents cursor jumping ─────────────────────────
// memo() stops re-renders from parent state changes
const JoinForm = memo(({ sessionId, onJoined }) => {
  const [name, setName] = useState(() => localStorage.getItem("ce_join_name") || "");
  const [email, setEmail] = useState(() => localStorage.getItem("ce_join_email") || "");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const nameRef = useRef(null);
  const emailRef = useRef(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) { setError("Please enter your name"); nameRef.current?.focus(); return; }
    setError(""); setLoading(true);
    localStorage.setItem("ce_join_name", name.trim());
    if (email.trim()) localStorage.setItem("ce_join_email", email.trim());
    try {
      const { data } = await publicApi.post(`/sessions/${sessionId}/join`, {
        name: name.trim(),
        email: email.trim() || null,
      });
      onJoined(data.studentIndex, data.name);
    } catch (err) {
      const code = err.response?.data?.code;
      if (code === "SESSION_ENDED") onJoined(null, null, "ended");
      else { setError(err.response?.data?.error || "Could not join. Try again."); setLoading(false); }
    }
  };

  return (
    <div className="card max-w-sm w-full">
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg mb-5 text-xs font-mono"
        style={{ background: "rgba(0,255,135,0.08)", border: "1px solid rgba(0,255,135,0.2)", color: "#00FF87" }}>
        <span className="w-1.5 h-1.5 bg-[#00FF87] rounded-full animate-pulse" />
        Session is live — join now
      </div>

      <h2 className="font-bold text-xl mb-1" style={{ fontFamily: "Syne,sans-serif" }}>
        Join session
      </h2>
      <p className="text-gray-500 text-sm mb-5">Enter your details to join.</p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="join-name" className="block text-xs text-gray-500 mb-1.5 font-mono uppercase tracking-wider">
            Your name *
          </label>
          <input
            id="join-name"
            ref={nameRef}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Enter your full name"
            maxLength={50}
            autoComplete="name"
            autoFocus
            className="w-full bg-[#21262D] border rounded-lg px-4 py-3 text-white placeholder-gray-600 focus:outline-none transition-colors text-sm"
            style={{ borderColor: error ? "#FF4545" : "#30363D" }}
          />
          {error && <p className="text-xs mt-1 font-mono" style={{ color: "#FF4545" }}>{error}</p>}
        </div>

        <div>
          <label htmlFor="join-email" className="block text-xs text-gray-500 mb-1.5 font-mono uppercase tracking-wider">
            Email <span className="text-gray-700 normal-case">(optional)</span>
          </label>
          <input
            id="join-email"
            ref={emailRef}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="your@email.com"
            autoComplete="email"
            className="w-full bg-[#21262D] border border-[#30363D] rounded-lg px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-[#00FF87] transition-colors text-sm"
          />
          <p className="text-[10px] text-gray-600 mt-1 font-mono">
            Your tutor may use this to share reports with you.
          </p>
        </div>

        <button
          type="submit"
          disabled={loading || !name.trim()}
          className="btn-primary w-full py-3 flex items-center justify-center gap-2"
        >
          {loading ? (
            <><span className="animate-spin w-4 h-4 border-2 border-[#080B0F] border-t-transparent rounded-full" />Joining…</>
          ) : "Join session →"}
        </button>
      </form>

      <p className="text-center text-xs text-gray-700 mt-4 font-mono">
        Your camera will turn on after joining
      </p>
    </div>
  );
});

// ── Active camera view ─────────────────────────────────────────────────────────
function ActiveView({ sessionId, studentIndex, myName }) {
  const [score, setScore] = useState(null);
  const [camStatus, setCamStatus] = useState("requesting");
  const [needsTap, setNeedsTap] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const captureRef = useRef(null);
  const sendRef = useRef(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    const frames = [];

    const startCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
          audio: true,
        });

        if (!mountedRef.current) { stream.getTracks().forEach(t => t.stop()); return; }

        streamRef.current = stream;

        // Try attaching immediately
        const tryAttach = () => {
          const video = videoRef.current;
          if (video) {
            video.srcObject = stream;
            video.muted = true;
            // Force play — don't wait for any events
            const playPromise = video.play();
            if (playPromise) {
              playPromise.catch(() => {
                if (mountedRef.current) setNeedsTap(true);
              });
            }
          }
        };

        // Try now, and again after 200ms, 500ms, 1000ms as fallbacks
        tryAttach();
        setTimeout(tryAttach, 200);
        setTimeout(tryAttach, 500);
        setTimeout(tryAttach, 1000);

        // Move to active state immediately — don't wait for video to play
        if (mountedRef.current) setCamStatus("active");

        // Start capturing frames
        captureRef.current = setInterval(() => {
          const video = videoRef.current;
          if (!video || !streamRef.current) return;
          // Accept any readyState >= 1 on mobile (HAVE_METADATA is enough)
          if (video.readyState < 1) return;
          if (!canvasRef.current) canvasRef.current = document.createElement("canvas");
          const canvas = canvasRef.current;
          canvas.width = 320;
          canvas.height = 240;
          const ctx = canvas.getContext("2d");
          if (!ctx) return;
          try {
            ctx.drawImage(video, 0, 0, 320, 240);
            const frame = canvas.toDataURL("image/jpeg", 0.65).split(",")[1];
            if (frame && frame.length > 100) frames.push(frame);
          } catch (e) {
            // drawImage fails if video not ready — skip silently
          }
        }, 1000);

        sendRef.current = setInterval(async () => {
          if (!frames.length) return;
          const frame = frames[frames.length - 1];
          frames.length = 0;
          try {
            const { data } = await publicApi.post(`/sessions/${sessionId}/frames`, {
              frames: [{ studentIndex, frame }],
            });
            if (mountedRef.current) {
              setScore(data.scores?.[0]?.engagementScore ?? null);
            }
          } catch (err) {
            if (err.response?.status === 404 && mountedRef.current) {
              setCamStatus("ended");
              stream.getTracks().forEach(t => t.stop());
              clearInterval(captureRef.current);
              clearInterval(sendRef.current);
            }
          }
        }, 5000);

      } catch (err) {
        if (!mountedRef.current) return;
        if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
          setCamStatus("denied");
        } else {
          setCamStatus("error");
          setErrorMsg(err.message);
        }
      }
    };

    startCamera();

    return () => {
      mountedRef.current = false;
      clearInterval(captureRef.current);
      clearInterval(sendRef.current);
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, []);

  const handleTapToPlay = () => {
    videoRef.current?.play().catch(() => { });
    setNeedsTap(false);
  };

  const scoreColor = score === null ? "#6B7280"
    : score >= 70 ? "#00FF87"
      : score >= 40 ? "#FFB800"
        : "#FF4545";

  const scoreLabel = score === null ? "Connecting..."
    : score >= 70 ? "Great focus! 👍"
      : score >= 40 ? "Try to stay focused"
        : "Your tutor has been notified ⚠";

  if (camStatus === "ended") return (
    <div className="card max-w-sm w-full text-center">
      <div className="text-5xl mb-4">🔒</div>
      <h2 className="font-bold text-xl mb-2" style={{ fontFamily: "Syne,sans-serif" }}>Session ended</h2>
      <p className="text-gray-400 text-sm">The tutor has ended this session.</p>
    </div>
  );

  if (camStatus === "denied") return (
    <div className="card max-w-sm w-full">
      <div className="text-4xl mb-4 text-center">📷</div>
      <h2 className="font-bold text-lg mb-3 text-center" style={{ fontFamily: "Syne,sans-serif" }}>
        Camera access needed
      </h2>
      <ol className="text-sm text-gray-400 space-y-3 mb-5">
        <li className="flex gap-3">
          <span className="font-mono text-white shrink-0">1.</span>
          Tap the 🔒 icon in your browser address bar
        </li>
        <li className="flex gap-3">
          <span className="font-mono text-white shrink-0">2.</span>
          Find <strong>Camera</strong> → set to <span style={{ color: "#00FF87" }}>Allow</span>
        </li>
        <li className="flex gap-3">
          <span className="font-mono text-white shrink-0">3.</span>
          Come back and refresh this page
        </li>
      </ol>
      <button onClick={() => window.location.reload()} className="btn-primary w-full py-3">
        Refresh page
      </button>
    </div>
  );

  if (camStatus === "error") return (
    <div className="card max-w-sm w-full text-center">
      <div className="text-4xl mb-3">⚠️</div>
      <p className="text-gray-300 text-sm mb-4">Camera error: {errorMsg}</p>
      <button onClick={() => window.location.reload()} className="btn-primary w-full py-2">
        Try again
      </button>
    </div>
  );

  if (camStatus === "requesting" || camStatus === "active")
    return (
      <div className="w-full max-w-sm space-y-4">
        <div className="flex items-center justify-between px-1">
          <p className="font-medium text-white">{myName}</p>
          <div className="flex items-center gap-1.5 text-xs font-mono" style={{ color: "#00FF87" }}>
            <span className="w-1.5 h-1.5 bg-[#00FF87] rounded-full animate-pulse" />
            {camStatus === "requesting" ? "Starting…" : "Live"}
          </div>
        </div>

        <div className="relative rounded-xl overflow-hidden"
          style={{
            border: score !== null && score < 40 ? "1px solid rgba(255,69,69,0.6)" : "1px solid #21262D",
            background: "#0D1117",
            minHeight: "260px",
          }}>

          {/* Video always in DOM */}
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            style={{ width: "100%", display: "block", minHeight: "260px", objectFit: "cover" }}
          />

          {/* Loading overlay — disappears once video plays */}
          {camStatus === "requesting" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center"
              style={{ background: "rgba(13,17,23,0.9)" }}>
              <span className="animate-spin w-8 h-8 border-2 border-[#00FF87] border-t-transparent rounded-full mb-3" />
              <p className="text-gray-300 text-sm">Camera starting…</p>
              <p className="text-gray-600 text-xs mt-1 font-mono">Tap Allow when browser asks</p>
            </div>
          )}

          {/* iOS tap-to-play */}
          {needsTap && (
            <div className="absolute inset-0 flex flex-col items-center justify-center cursor-pointer"
              style={{ background: "rgba(13,17,23,0.85)" }}
              onClick={handleTapToPlay}>
              <div className="text-6xl mb-3">▶️</div>
              <p className="text-white text-sm font-medium">Tap to start camera</p>
            </div>
          )}

          {/* Score badge */}
          <div className="absolute bottom-3 right-3 px-3 py-2 rounded-xl text-center"
            style={{ background: "rgba(13,17,23,0.92)", border: "1px solid #21262D" }}>
            <p className="font-mono font-bold text-3xl leading-none" style={{ color: scoreColor }}>
              {score ?? "—"}
            </p>
            <p className="text-[10px] text-gray-500 mt-0.5">
              {score === null ? "waiting…" : "/100"}
            </p>
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
    );

  return (
    <div className="w-full max-w-sm space-y-4">
      <div className="flex items-center justify-between px-1">
        <p className="font-medium text-white">{myName}</p>
        <div className="flex items-center gap-1.5 text-xs font-mono" style={{ color: "#00FF87" }}>
          <span className="w-1.5 h-1.5 bg-[#00FF87] rounded-full animate-pulse" />
          Live
        </div>
      </div>

      {/* Video container */}
      <div
        className="relative rounded-xl overflow-hidden"
        style={{
          border: score !== null && score < 40
            ? "1px solid rgba(255,69,69,0.6)"
            : "1px solid #21262D",
          background: "#0D1117",
          minHeight: "240px",
        }}
      >
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          style={{
            width: "100%",
            display: "block",
            minHeight: "240px",
            objectFit: "cover",
          }}
        />

        {/* iOS tap-to-play overlay */}
        {needsTap && (
          <div
            className="absolute inset-0 flex flex-col items-center justify-center cursor-pointer"
            style={{ background: "rgba(13,17,23,0.9)" }}
            onClick={handleTapToPlay}
          >
            <div className="text-6xl mb-3">▶️</div>
            <p className="text-white text-sm font-medium">Tap to start camera</p>
          </div>
        )}

        {/* Score badge */}
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
        <div className="rounded-xl p-4" style={{ background: "#161B22", border: "1px solid #21262D" }}>
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
          <p className="text-[10px] text-gray-600 mt-2 text-center font-mono">{scoreLabel}</p>
        </div>
      )}

      <p className="text-center text-xs text-gray-700 font-mono">
        Keep this tab open for the entire session
      </p>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function StudentJoin() {
  const { sessionId } = useParams();
  const [phase, setPhase] = useState("checking");
  const [studentIndex, setStudentIndex] = useState(null);
  const [myName, setMyName] = useState("");

  useEffect(() => {
    publicApi.get(`/sessions/${sessionId}/status`)
      .then(({ data }) => setPhase(data.isLive ? "lobby" : "ended"))
      .catch(() => setPhase("error"));
  }, [sessionId]);

  const handleJoined = useCallback((idx, name, reason) => {
    if (reason === "ended") { setPhase("ended"); return; }
    setStudentIndex(idx);
    setMyName(name);
    setPhase("active");
  }, []);

  const Logo = () => (
    <div className="text-center mb-8">
      <p className="font-bold text-2xl tracking-tight" style={{ fontFamily: "Syne,sans-serif" }}>
        Classroom<span style={{ color: "#00FF87" }}>Eye</span>
      </p>
    </div>
  );

  const Wrap = ({ children }) => (
    <div className="min-h-screen bg-[#080B0F] flex flex-col items-center justify-center px-4">
      <Logo />
      {children}
    </div>
  );

  if (phase === "checking") return (
    <Wrap>
      <div className="text-center">
        <span className="animate-spin w-6 h-6 border-2 border-[#00FF87] border-t-transparent rounded-full inline-block mb-3" />
        <p className="text-gray-500 text-sm font-mono">Checking session…</p>
      </div>
    </Wrap>
  );

  if (phase === "ended") return (
    <Wrap>
      <div className="card max-w-sm w-full text-center">
        <div className="text-5xl mb-4">🔒</div>
        <h2 className="font-bold text-xl mb-2" style={{ fontFamily: "Syne,sans-serif" }}>Session has ended</h2>
        <p className="text-gray-400 text-sm">The tutor has ended this session.</p>
        <p className="text-gray-600 text-xs font-mono mt-2">You can no longer join.</p>
      </div>
    </Wrap>
  );

  if (phase === "error") return (
    <Wrap>
      <div className="card max-w-sm w-full text-center">
        <div className="text-4xl mb-3">⚠️</div>
        <p className="text-gray-300 text-sm">Session not found.</p>
        <p className="text-gray-600 text-xs mt-2 font-mono">Ask your tutor to resend the link.</p>
      </div>
    </Wrap>
  );

  if (phase === "lobby") return (
    <Wrap>
      <JoinForm sessionId={sessionId} onJoined={handleJoined} />
    </Wrap>
  );

  return (
    <Wrap>
      <ActiveView
        sessionId={sessionId}
        studentIndex={studentIndex}
        myName={myName}
      />
    </Wrap>
  );
}

function StreamSender({ sessionId, studentIndex, name, stream }) {
  useStudentStream(sessionId, studentIndex, name, stream);

  {
    phase === "active" && streamRef.current && (
      <StreamSender
        sessionId={sessionId}
        studentIndex={studentIndex}
        name={myName}
        stream={streamRef.current}
      />
    )
  }
  return null;
}