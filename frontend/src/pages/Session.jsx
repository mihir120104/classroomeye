import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import Navbar from "../components/Navbar";
import StudentTile from "../components/StudentTile";
import api from "../api/client";

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
      className="text-xs px-3 py-1.5 rounded-lg font-mono transition-all shrink-0"
      style={{
        background: copied ? "rgba(0,255,135,0.15)" : "rgba(255,255,255,0.05)",
        border: copied ? "1px solid rgba(0,255,135,0.4)" : "1px solid #30363D",
        color: copied ? "#00FF87" : "#9CA3AF",
      }}
    >
      {copied ? "✓ Copied" : "Copy link"}
    </button>
  );
}

export default function Session() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [sessionData, setSessionData] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [ending, setEnding] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [scores, setScores] = useState({});
  const [camError, setCamError] = useState(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [showLinks, setShowLinks] = useState(true);

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const captureTimer = useRef(null);
  const sendTimer = useRef(null);
  const framesRef = useRef([]);
  const elapsedTimer = useRef(null);
  const joinLink = `${baseUrl}/join/${id}`;
  // Load session on mount and when id changes
  useEffect(() => {
    api.get(`/sessions/${id}`)
      .then(({ data }) => {
        setSessionData(data.session);
        // If resuming, calculate elapsed from startTime
        if (data.session?.startTime) {
          const secs = Math.round(
            (Date.now() - new Date(data.session.startTime).getTime()) / 1000
          );
          setElapsed(secs > 0 ? secs : 0);
        }
      })
      .catch(() => setLoadError("Session not found"));
  }, [id]);

  // Elapsed timer
  useEffect(() => {
    elapsedTimer.current = setInterval(() => setElapsed(e => e + 1), 1000);
    return () => clearInterval(elapsedTimer.current);
  }, []);

  // Camera — starts fresh every time this page is loaded
  useEffect(() => {
    if (!sessionData || isCapturing) return;
    if (sessionData.status === "completed") return; // don't start camera for ended sessions

    try {
      if (typeof Notification !== "undefined" && Notification.permission === "default") {
        Notification.requestPermission();
      }
    } catch (e) { }

    navigator.mediaDevices
      .getUserMedia({ video: { width: 640, height: 480, facingMode: "user" }, audio: false })
      .then((stream) => {
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
        setIsCapturing(true);

        captureTimer.current = setInterval(() => {
          const video = videoRef.current;
          if (!video || video.readyState < 2) return;
          // Create canvas lazily — fixes mobile crash
          if (!canvasRef.current) {
            canvasRef.current = document.createElement("canvas");
          }
          const canvas = canvasRef.current;
          canvas.width = 320; canvas.height = 240;
          canvas.getContext("2d").drawImage(video, 0, 0, 320, 240);
          framesRef.current.push(canvas.toDataURL("image/jpeg", 0.7).split(",")[1]);
        }, 1000);

        sendTimer.current = setInterval(async () => {
          if (!framesRef.current.length) return;
          const frame = framesRef.current[framesRef.current.length - 1];
          framesRef.current = [];
          try {
            const { data } = await api.post(`/sessions/${id}/frames`, {
              frames: [{ studentIndex: 0, frame }],
            });
            setScores(prev => {
              const next = { ...prev };
              (data.scores || []).forEach(({ studentIndex, engagementScore }) => {
                const wasOk = (prev[studentIndex] ?? 100) >= 40;
                const nowBad = engagementScore < 40;
                if (wasOk && nowBad) {
                  const name = sessionData?.students?.[studentIndex]?.name
                    || `Student ${studentIndex + 1}`;
                  try {
                    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
                      new Notification("ClassroomEye ⚠", {
                        body: `${name} is distracted (score: ${engagementScore})`,
                      });
                    }
                  } catch (e) { }
                }
                next[studentIndex] = engagementScore;
              });
              return next;
            });
          } catch (err) {
            console.warn("[ClassroomEye] Frame error:", err.message);
          }
        }, 5000);
      })
      .catch((err) => {
        setCamError(err.name === "NotAllowedError"
          ? "Camera permission denied — allow access and refresh"
          : `Camera error: ${err.message}`);
      });

    return () => {
      clearInterval(captureTimer.current);
      clearInterval(sendTimer.current);
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, [sessionData, id]);

  const handleEnd = async () => {
    setEnding(true);
    clearInterval(captureTimer.current);
    clearInterval(sendTimer.current);
    clearInterval(elapsedTimer.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
    try { await api.post(`/sessions/${id}/end`); } catch { }
    navigate(`/session/${id}/report`);
  };

  const fmt = (s) => {
    const m = Math.floor(s / 60).toString().padStart(2, "0");
    const sec = (s % 60).toString().padStart(2, "0");
    return `${m}:${sec}`;
  };

  const scoreValues = Object.values(scores);
  const avgScore = scoreValues.length
    ? Math.round(scoreValues.reduce((a, b) => a + b, 0) / scoreValues.length)
    : null;

  const baseUrl = window.location.origin;

  if (loadError) return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4">
      <p style={{ color: "#FF4545" }} className="font-mono">{loadError}</p>
      <Link to="/dashboard" className="btn-ghost text-sm">← Back to dashboard</Link>
    </div>
  );

  if (!sessionData) return (
    <div className="min-h-screen flex items-center justify-center">
      <span className="animate-spin w-6 h-6 border-2 border-[#00FF87] border-t-transparent rounded-full" />
    </div>
  );

  // Session already ended — redirect to report
  if (sessionData.status === "completed") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <p className="text-gray-400 font-mono text-sm">This session has ended.</p>
        <Link to={`/session/${id}/report`} className="btn-primary text-sm">
          View session report →
        </Link>
        <Link to="/dashboard" className="text-xs text-gray-600 hover:text-gray-400 font-mono">
          ← Back to dashboard
        </Link>
      </div>
    );
  }

  const students = sessionData.students || [];

  return (
    <div className="min-h-screen">
      <Navbar />

      {/* Header */}
      <div
        className="border-b sticky z-40"
        style={{ top: "56px", background: "rgba(13,17,23,0.95)", borderColor: "#21262D", backdropFilter: "blur(8px)" }}
      >
        <div className="max-w-6xl mx-auto px-6 py-3 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 bg-[#00FF87] rounded-full animate-pulse" />
              <span className="text-xs font-mono uppercase tracking-widest" style={{ color: "#00FF87" }}>Live</span>
            </div>
            <span className="font-mono text-2xl font-medium text-white tabular-nums">{fmt(elapsed)}</span>
            <span className="text-xs text-gray-600 font-mono">{students.length} student{students.length !== 1 ? "s" : ""}</span>
          </div>

          <div className="flex items-center gap-3">
            {avgScore !== null && (
              <div className="text-center">
                <span className="font-mono font-medium text-xl text-white">{avgScore}</span>
                <span className="text-xs text-gray-600 ml-1">avg</span>
              </div>
            )}
            <button
              onClick={() => setShowLinks(v => !v)}
              className="px-3 py-2 rounded-lg text-xs font-mono transition-all"
              style={{
                background: showLinks ? "rgba(0,255,135,0.1)" : "rgba(255,255,255,0.05)",
                border: showLinks ? "1px solid rgba(0,255,135,0.3)" : "1px solid #30363D",
                color: showLinks ? "#00FF87" : "#9CA3AF",
              }}
            >
              🔗 {showLinks ? "Hide links" : "Share links"}
            </button>
            <button
              onClick={handleEnd}
              disabled={ending}
              className="px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-all"
              style={{ background: "rgba(255,69,69,0.1)", border: "1px solid rgba(255,69,69,0.3)", color: "#FF4545" }}
            >
              {ending
                ? <><span className="animate-spin w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full" />Ending…</>
                : "End session"}
            </button>
          </div>
        </div>
      </div>

      {camError && (
        <div className="px-6 py-3 text-sm border-b"
          style={{ background: "rgba(255,184,0,0.1)", borderColor: "rgba(255,184,0,0.3)", color: "#FFB800" }}>
          ⚠ {camError}
        </div>
      )}

      <div className="max-w-6xl mx-auto px-6 py-6 space-y-5">

        {/* Share links panel */}
        {showLinks && (
          <div className="rounded-xl p-5" style={{ background: "#0D1117", border: "1px solid rgba(0,255,135,0.2)" }}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-xs font-mono uppercase tracking-widest mb-0.5" style={{ color: "#00FF87" }}>
                  Session join link
                </p>
                <p className="text-xs text-gray-500">
                  Share one link with all students — they enter their name to join.
                </p>
              </div>
              <button onClick={() => setShowLinks(false)} className="text-gray-600 hover:text-white text-xl ml-4">×</button>
            </div>

            {/* Single link box */}
            <div className="flex items-center gap-3 p-4 rounded-xl mb-4"
              style={{ background: "#161B22", border: "1px solid rgba(0,255,135,0.2)" }}>
              <div className="flex-1 min-w-0">
                <p className="font-mono text-sm text-white truncate">{joinLink}</p>
              </div>
              <CopyButton text={joinLink} />
            </div>

            {/* Quick share buttons */}
            <div className="grid grid-cols-2 gap-2 mb-4">
              <button
                onClick={() => {
                  const msg = `Join my ClassroomEye session:\n${joinLink}`;
                  window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank");
                }}
                className="py-2.5 rounded-lg text-xs font-mono flex items-center justify-center gap-2 transition-all"
                style={{ background: "rgba(37,211,102,0.1)", border: "1px solid rgba(37,211,102,0.3)", color: "#25D366" }}
              >
                <span>💬</span> WhatsApp
              </button>
              <button
                onClick={() => navigator.clipboard.writeText(joinLink)}
                className="py-2.5 rounded-lg text-xs font-mono flex items-center justify-center gap-2 transition-all"
                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid #30363D", color: "#9CA3AF" }}
              >
                <span>📋</span> Copy link
              </button>
            </div>

            {/* Who has joined */}
            {students.length > 0 && (
              <div>
                <p className="text-xs font-mono text-gray-600 uppercase tracking-widest mb-2">
                  Joined ({students.length})
                </p>
                <div className="space-y-2">
                  {students.map((student, idx) => {
                    const s = scores[idx];
                    const dotColor = s === undefined ? "#6B7280" : s > 0 ? "#00FF87" : "#FF4545";
                    const statusText = s === undefined ? "Waiting for score…"
                      : s > 0 ? `Active · ${s}/100`
                        : "Joined · camera off";
                    return (
                      <div key={idx} className="flex items-center gap-3 px-3 py-2 rounded-lg"
                        style={{ background: "#161B22", border: "1px solid #21262D" }}>
                        <div className="w-2 h-2 rounded-full shrink-0" style={{ background: dotColor }} />
                        <span className="text-sm text-white flex-1">{student.name}</span>
                        <span className="text-xs font-mono" style={{ color: dotColor }}>{statusText}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Student grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {students.map((student, idx) => (
            <StudentTile
              key={idx}
              student={student}
              score={scores[idx] !== undefined ? scores[idx] : null}
              isPresent={scores[idx] !== undefined && scores[idx] > 0}
              videoRef={idx === 0 ? (el) => {
                videoRef.current = el;
                if (el && streamRef.current) el.srcObject = streamRef.current;
              } : null}
            />
          ))}
        </div>

        {/* Engagement bar */}
        {avgScore !== null && (
          <div className="card">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-mono text-gray-500 uppercase tracking-widest">Class engagement</span>
              <span className="font-mono font-medium text-white">{avgScore} / 100</span>
            </div>
            <div className="bg-[#21262D] rounded-full h-2 overflow-hidden">
              <div className="h-full rounded-full transition-all duration-700"
                style={{ width: `${avgScore}%`, background: avgScore >= 70 ? "#00FF87" : avgScore >= 40 ? "#FFB800" : "#FF4545" }} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}