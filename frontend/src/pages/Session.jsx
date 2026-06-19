//  Session.jsx

import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Navbar from "../components/Navbar";
import StudentTile from "../components/StudentTile";
import api from "../api/client";
import { useTutorStream } from "../hooks/useWebRTC_stream";
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

function fireNotification(title, body) {
  try {
    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      new Notification(title, { body });
    }
  } catch (e) { }
}

export default function Session() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [micStream, setMicStream] = useState(null);
  const [screenStream, setScreenStream] = useState(null);
  const [sessionData, setSessionData] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [ending, setEnding] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [scores, setScores] = useState({});
  const [camError, setCamError] = useState(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [showLinks, setShowLinks] = useState(true);
  const [micOn, setMicOn] = useState(false);
  const [screenSharing, setScreenSharing] = useState(false);
  const [snapshots, setSnapshots] = useState({});
  const { remoteStreams } = useTutorStream(id, micStream, screenStream);

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const captureTimer = useRef(null);
  const sendTimer = useRef(null);
  const elapsedTimer = useRef(null);
  const pollTimer = useRef(null);
  const micStreamRef = useRef(null);
  const screenStreamRef = useRef(null);
  const framesRef = useRef([]);

  // Load session on mount
  useEffect(() => {
    api.get(`/sessions/${id}`)
      .then(({ data }) => {
        setSessionData(data.session);
        if (data.session?.startTime) {
          const secs = Math.round((Date.now() - new Date(data.session.startTime).getTime()) / 1000);
          setElapsed(Math.max(0, secs));
        }
      })
      .catch(() => setLoadError("Session not found"));
  }, [id]);

  // Elapsed timer
  useEffect(() => {
    elapsedTimer.current = setInterval(() => setElapsed(e => e + 1), 1000);
    return () => clearInterval(elapsedTimer.current);
  }, []);

  // ── MASTER POLLING — refreshes BOTH students list AND scores every 4s ─────
  useEffect(() => {
    if (!id) return;

    const poll = async () => {
      try {
        // Get full session to update student list
        const { data: sessionResp } = await api.get(`/sessions/${id}`);
        const session = sessionResp.session;
        if (!session) return;

        // Update student list so newly joined students appear
        setSessionData(prev => {
          if (!prev) return session;
          // Merge — keep existing but add new students
          const merged = { ...prev, students: session.students };
          return merged;
        });

        // Update scores from each student's latest timeline entry
        setScores(prev => {
          const next = { ...prev };
          session.students.forEach((student, idx) => {
            const timeline = student.engagementTimeline;
            if (timeline && timeline.length > 0) {
              const latest = timeline[timeline.length - 1];
              if (latest?.score !== undefined && latest?.score !== null) {
                // Don't overwrite tutor's local camera score if it's newer
                if (idx === 0 && prev[0] !== undefined) {
                  // Keep local score — it updates faster via camera
                  return;
                }
                next[idx] = Math.round(latest.score * 100) / 100;
              }
            }
          });
          return next;
        });

        if (session.status === "completed") {
          navigate(`/session/${id}/report`);
        }
      } catch (e) {
        // Silent fail
      }
    };

    // Poll immediately then every 4 seconds
    poll();
    pollTimer.current = setInterval(poll, 4000);
    return () => clearInterval(pollTimer.current);
  }, [id]);

  // Poll snapshots every 5s — shows student camera frames on tutor dashboard
  useEffect(() => {
    if (!id) return;

    const pollSnapshots = async () => {
      try {
        const { data } = await api.get(`/sessions/${id}/snapshots`);
        if (!data.snapshots) return;
        const newSnapshots = {};
        data.snapshots.forEach(({ studentIndex, frame }) => {
          if (frame) newSnapshots[studentIndex] = frame;
        });
        setSnapshots(newSnapshots);
      } catch (e) { }
    };

    pollSnapshots();
    const t = setInterval(pollSnapshots, 5000);
    return () => clearInterval(t);
  }, [id]);

  // Camera start
  const startCapture = useCallback(async () => {
    setCamError(null);
    try {
      if (typeof Notification !== "undefined" && Notification.permission === "default") {
        Notification.requestPermission().catch(() => { });
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" },
        audio: false,
      });

      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      setIsCapturing(true);

      captureTimer.current = setInterval(() => {
        const video = videoRef.current;
        if (!video || video.readyState < 2) return;
        if (!canvasRef.current) canvasRef.current = document.createElement("canvas");
        const canvas = canvasRef.current;
        canvas.width = 320; canvas.height = 240;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.drawImage(video, 0, 0, 320, 240);
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
                const name = sessionData?.students?.[studentIndex]?.name || `Student ${studentIndex + 1}`;
                fireNotification("ClassroomEye ⚠", `${name} is distracted (${engagementScore})`);
              }
              next[studentIndex] = engagementScore;
            });
            return next;
          });
        } catch (err) {
          console.warn("[CE] Frame error:", err.message);
        }
      }, 5000);

    } catch (err) {
      setCamError(
        err.name === "NotAllowedError" ? "Camera permission denied — allow access and refresh"
          : err.name === "NotReadableError" ? "Camera in use by another app — close Zoom/Meet and retry"
            : `Camera error: ${err.message}`
      );
    }
  }, [id, sessionData]);

  // Auto-start camera when session loads
  useEffect(() => {
    if (sessionData && !isCapturing && sessionData.status !== "completed") {
      startCapture();
    }
  }, [sessionData?.status]);

  const toggleMic = async () => {
    if (micOn) {
      micStreamRef.current?.getTracks().forEach(t => t.stop());
      micStreamRef.current = null;
      setMicStream(null);
      setMicOn(false);
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        micStreamRef.current = stream;
        setMicStream(stream);
        setMicOn(true);
      } catch {
        alert("Microphone permission denied.");
      }
    }
  };

  const toggleScreenShare = async () => {
    if (screenSharing) {
      screenStreamRef.current?.getTracks().forEach(t => t.stop());
      screenStreamRef.current = null;
      setScreenStream(null);
      setScreenSharing(false);
    } else {
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({
          video: { cursor: "always" },
          audio: true,
        });
        screenStreamRef.current = stream;
        setScreenStream(stream);
        setScreenSharing(true);
        stream.getVideoTracks()[0].onended = () => {
          screenStreamRef.current = null;
          setScreenStream(null);
          setScreenSharing(false);
        };
      } catch { }
    }
  };

  const handleEnd = async () => {
    setEnding(true);
    clearInterval(captureTimer.current);
    clearInterval(sendTimer.current);
    clearInterval(elapsedTimer.current);
    clearInterval(pollTimer.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
    micStreamRef.current?.getTracks().forEach(t => t.stop());
    screenStreamRef.current?.getTracks().forEach(t => t.stop());
    try { await api.post(`/sessions/${id}/end`); } catch { }
    navigate(`/session/${id}/report`);
  };

  const fmt = (s) => `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;

  const scoreValues = Object.values(scores).filter(s => s !== null && s !== undefined);
  const avgScore = scoreValues.length
    ? Math.round(scoreValues.reduce((a, b) => a + b, 0) / scoreValues.length)
    : null;

  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
  const joinLink = `${baseUrl}/join/${id}`;

  if (loadError) return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4">
      <p style={{ color: "#FF4545" }} className="font-mono">{loadError}</p>
      <button onClick={() => navigate("/dashboard")} className="btn-ghost text-sm">← Back</button>
    </div>
  );

  if (!sessionData) return (
    <div className="min-h-screen flex items-center justify-center">
      <span className="animate-spin w-6 h-6 border-2 border-[#00FF87] border-t-transparent rounded-full" />
    </div>
  );

  if (sessionData.status === "completed") return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4">
      <p className="text-gray-400 font-mono text-sm">This session has ended.</p>
      <button onClick={() => navigate(`/session/${id}/report`)} className="btn-primary text-sm">
        View report →
      </button>
    </div>
  );

  const students = sessionData.students || [];

  return (
    <div className="min-h-screen">
      <Navbar />

      {/* Header */}
      <div className="border-b sticky z-40"
        style={{ top: "56px", background: "rgba(13,17,23,0.95)", borderColor: "#21262D" }}>
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 bg-[#00FF87] rounded-full animate-pulse" />
              <span className="text-xs font-mono uppercase tracking-widest" style={{ color: "#00FF87" }}>Live</span>
            </div>
            <span className="font-mono text-xl font-medium text-white tabular-nums">{fmt(elapsed)}</span>
            <span className="text-xs text-gray-600 font-mono">{students.length} students</span>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {avgScore !== null && (
              <div className="text-center px-2">
                <span className="font-mono font-medium text-lg text-white">{avgScore}</span>
                <span className="text-xs text-gray-600 ml-1">avg</span>
              </div>
            )}
            <button onClick={toggleMic}
              className="px-3 py-1.5 rounded-lg text-xs font-mono transition-all flex items-center gap-1.5"
              style={{
                background: micOn ? "rgba(0,255,135,0.1)" : "rgba(255,69,69,0.1)",
                border: micOn ? "1px solid rgba(0,255,135,0.3)" : "1px solid rgba(255,69,69,0.3)",
                color: micOn ? "#00FF87" : "#FF4545",
              }}>
              {micOn ? "🎙 Mic on" : "🔇 Mic off"}
            </button>
            <button onClick={toggleScreenShare}
              className="px-3 py-1.5 rounded-lg text-xs font-mono transition-all"
              style={{
                background: screenSharing ? "rgba(59,130,246,0.1)" : "rgba(255,255,255,0.05)",
                border: screenSharing ? "1px solid rgba(59,130,246,0.5)" : "1px solid #30363D",
                color: screenSharing ? "#3B82F6" : "#9CA3AF",
              }}>
              {screenSharing ? "🖥 Sharing" : "🖥 Share screen"}
            </button>
            <button onClick={() => setShowLinks(v => !v)}
              className="px-3 py-1.5 rounded-lg text-xs font-mono transition-all"
              style={{
                background: showLinks ? "rgba(0,255,135,0.1)" : "rgba(255,255,255,0.05)",
                border: showLinks ? "1px solid rgba(0,255,135,0.3)" : "1px solid #30363D",
                color: showLinks ? "#00FF87" : "#9CA3AF",
              }}>
              🔗 {showLinks ? "Hide" : "Links"}
            </button>
            <button onClick={handleEnd} disabled={ending}
              className="px-3 py-1.5 rounded-lg text-sm font-medium flex items-center gap-1.5 transition-all"
              style={{ background: "rgba(255,69,69,0.1)", border: "1px solid rgba(255,69,69,0.3)", color: "#FF4545" }}>
              {ending ? <><span className="animate-spin w-3 h-3 border-2 border-current border-t-transparent rounded-full" />Ending…</> : "End session"}
            </button>
          </div>
        </div>
      </div>

      {/* Camera error */}
      {camError && (
        <div className="px-4 py-2 text-xs border-b font-mono flex items-center justify-between"
          style={{ background: "rgba(255,184,0,0.1)", borderColor: "rgba(255,184,0,0.3)", color: "#FFB800" }}>
          <span>⚠ {camError}</span>
          <button onClick={() => { setCamError(null); setIsCapturing(false); startCapture(); }}
            className="ml-4 px-3 py-1 rounded text-xs"
            style={{ background: "rgba(255,184,0,0.2)", border: "1px solid rgba(255,184,0,0.4)" }}>
            Retry
          </button>
        </div>
      )}

      <div className="max-w-6xl mx-auto px-4 py-4 space-y-4">

        {/* Share links panel */}
        {showLinks && (
          <div className="rounded-xl p-4" style={{ background: "#0D1117", border: "1px solid rgba(0,255,135,0.2)" }}>
            <div className="flex items-start justify-between mb-3">
              <div>
                <p className="text-xs font-mono uppercase tracking-widest mb-0.5" style={{ color: "#00FF87" }}>
                  Session join link
                </p>
                <p className="text-xs text-gray-500">Share one link — students enter their name to join.</p>
              </div>
              <button onClick={() => setShowLinks(false)} className="text-gray-600 hover:text-white text-xl ml-2">×</button>
            </div>
            <div className="flex items-center gap-2 p-3 rounded-lg mb-3"
              style={{ background: "#161B22", border: "1px solid rgba(0,255,135,0.2)" }}>
              <p className="font-mono text-xs text-white truncate flex-1">{joinLink}</p>
              <CopyButton text={joinLink} />
            </div>
            <button
              onClick={() => { const msg = `Join my ClassroomEye session:\n${joinLink}`; window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank"); }}
              className="w-full py-2 rounded-lg text-xs font-mono flex items-center justify-center gap-2 mb-3"
              style={{ background: "rgba(37,211,102,0.1)", border: "1px solid rgba(37,211,102,0.3)", color: "#25D366" }}>
              💬 Share via WhatsApp
            </button>

            {/* Live student list */}
            {students.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-mono text-gray-600 uppercase tracking-widest">
                  Joined ({students.length})
                </p>
                {students.map((student, idx) => {
                  const s = scores[idx];
                  const hasScore = s !== undefined && s !== null;
                  const dotColor = !hasScore ? "#6B7280" : s > 0 ? "#00FF87" : "#FF4545";
                  const scoreText = !hasScore ? "Waiting…" : `${Math.round(s * 100) / 100}/100`;
                  return (
                    <div key={idx} className="flex items-center gap-2 px-3 py-2 rounded-lg"
                      style={{ background: "#161B22", border: "1px solid #21262D" }}>
                      <div className="w-1.5 h-1.5 rounded-full" style={{ background: dotColor }} />
                      <span className="text-sm text-white flex-1">{student.name}</span>
                      <span className="text-xs font-mono font-medium" style={{ color: dotColor }}>
                        {!hasScore ? "Waiting…" : `${Math.round(s)}/100`}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Student grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {students.map((student, idx) => (
            <StudentTile
              key={`${student.name}-${idx}`}
              student={student}
              score={scores[idx] !== undefined ? Math.round(scores[idx]) : null}
              isPresent={scores[idx] !== undefined && scores[idx] > 0}
              snapshotSrc={idx !== 0 && !remoteStreams[idx] ? snapshots[idx] : null}
              remoteStream={idx !== 0 ? remoteStreams[idx] || null : null}
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
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-mono text-gray-500 uppercase tracking-widest">Class engagement</span>
              <span className="font-mono font-medium text-white">{avgScore}/100</span>
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