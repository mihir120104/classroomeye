import { useState, useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import Navbar from "../components/Navbar";
import PaywallModal from "../components/PaywallModal";
import { useAuth } from "../context/AuthContext";
import api from "../api/client";
import useSession from "../hooks/useSession";

export default function Dashboard() {
  const { user, refreshUser } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showPaywall, setShowPaywall] = useState(false);
  const { startSession, error: sessionError } = useSession();

  useEffect(() => { if (searchParams.get("payment") === "success") refreshUser(); }, []);
  useEffect(() => { api.get("/sessions?limit=10").then(({ data }) => setSessions(data.sessions)).catch(() => { }).finally(() => setLoading(false)); }, []);

  const handleStart = async () => {
    try {
      // Start with empty students — they join themselves via link
      const data = await startSession([]);
      navigate(`/session/${data.sessionId}`);
    } catch (err) {
      if (err.code === "UPGRADE_REQUIRED") {
        setShowPaywall(true);
      }
    }
  };

  const sessionsLeft = user?.plan === "paid" ? "∞" : Math.max(0, 5 - (user?.sessionsUsed || 0));

  return (
    <div className="min-h-screen">
      <Navbar />
      <div className="max-w-5xl mx-auto px-6 py-10">
        {searchParams.get("payment") === "success" && (
          <div className="mb-6 rounded-xl px-5 py-4 flex items-center gap-3" style={{ background: "rgba(0,255,135,0.1)", border: "1px solid rgba(0,255,135,0.3)" }}>
            <span style={{ color: "#00FF87" }}>✓</span>
            <div><p className="font-bold" style={{ color: "#00FF87", fontFamily: "Syne,sans-serif" }}>Pro plan activated!</p><p className="text-xs text-gray-400">Unlimited sessions unlocked.</p></div>
          </div>
        )}
        <div className="flex items-start justify-between mb-8 gap-4 flex-wrap">
          <div>
            <h1 className="font-bold text-3xl mb-1" style={{ fontFamily: "Syne,sans-serif" }}>Hello, {user?.name || "Tutor"} 👋</h1>
            <p className="text-gray-500 text-sm">{user?.plan === "paid" ? "Pro plan · unlimited sessions" : `Free plan · ${sessionsLeft} session${sessionsLeft === 1 ? "" : "s"} remaining`}</p>
          </div>
          <button
            onClick={handleStart}
            className="btn-primary flex items-center gap-2"
          >
            <span className="text-lg">+</span> New session
          </button>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-10">
          {[
            { label: "Sessions used", value: user?.sessionsUsed || 0, color: null },
            { label: "Sessions left", value: sessionsLeft, color: user?.plan === "paid" ? "#00FF87" : "#FFB800" },
            { label: "Plan", value: user?.plan === "paid" ? "Pro" : "Free", color: user?.plan === "paid" ? "#00FF87" : null },
            { label: "Avg engagement", value: sessions.length ? Math.round(sessions.reduce((a, s) => a + (s.averageEngagement || 0), 0) / sessions.length) + "%" : "—", color: null },
          ].map(({ label, value, color }) => (
            <div key={label} className="card">
              <p className="text-xs font-mono text-gray-500 uppercase tracking-widest mb-1">{label}</p>
              <p className="font-bold text-3xl" style={{ fontFamily: "Syne,sans-serif", color: color || "white" }}>{value}</p>
            </div>
          ))}
        </div>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-bold text-lg" style={{ fontFamily: "Syne,sans-serif" }}>Recent sessions</h2>
          {user?.plan === "free" && <button onClick={() => setShowPaywall(true)} className="text-xs font-mono hover:underline" style={{ color: "#00FF87" }}>Upgrade to Pro →</button>}
        </div>
        {loading ? (
          <div className="card text-center py-10 text-gray-600 text-sm font-mono">Loading…</div>
        ) : sessions.length === 0 ? (
          <div className="card text-center py-14">
            <p className="text-gray-600 text-sm mb-4">No sessions yet. Start your first one above.</p>
            <button onClick={() => setSetupModal(true)} className="btn-primary text-sm">
              Start a session →
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {sessions.map((s) => (
              <div
                key={s._id}
                className="card flex items-center justify-between hover:border-[#30363D] transition-colors"
              >
                <div>
                  <div className="flex items-center gap-2 mb-0.5">
                    {s.status === "live" && (
                      <span
                        className="text-[10px] font-mono px-2 py-0.5 rounded-full flex items-center gap-1"
                        style={{ background: "rgba(0,255,135,0.1)", color: "#00FF87", border: "1px solid rgba(0,255,135,0.3)" }}
                      >
                        <span className="w-1.5 h-1.5 bg-[#00FF87] rounded-full animate-pulse inline-block" />
                        LIVE
                      </span>
                    )}
                    <p className="font-medium text-sm text-white">
                      {new Date(s.startTime).toLocaleDateString("en-US", {
                        weekday: "short", month: "short", day: "numeric",
                      })}{" "}
                      · {new Date(s.startTime).toLocaleTimeString("en-US", {
                        hour: "2-digit", minute: "2-digit",
                      })}
                    </p>
                  </div>
                  <p className="text-xs text-gray-500">
                    {s.studentCount} student{s.studentCount !== 1 ? "s" : ""}
                    {s.status === "completed" && ` · ${Math.round((s.durationSeconds || 0) / 60)} min`}
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  {s.status === "live" ? (
                    // Live session — show Resume button
                    <Link
                      to={`/session/${s._id}`}
                      className="px-4 py-2 rounded-lg text-xs font-mono font-medium flex items-center gap-2 transition-all"
                      style={{
                        background: "rgba(0,255,135,0.1)",
                        border: "1px solid rgba(0,255,135,0.3)",
                        color: "#00FF87",
                      }}
                    >
                      ▶ Resume session
                    </Link>
                  ) : (
                    // Completed session — show report link
                    <Link
                      to={`/session/${s._id}/report`}
                      className="flex items-center gap-3 group"
                    >
                      <div className="text-right">
                        <p className="font-mono font-medium text-lg text-white">{s.averageEngagement}</p>
                        <p className="text-xs text-gray-600">avg score</p>
                      </div>
                      <span className="text-gray-700 group-hover:text-gray-400 transition-colors">→</span>
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
        {user?.plan === "paid" && (
          <div className="mt-6 text-center">
            <button onClick={async () => { const { data } = await api.post("/stripe/portal"); window.location.href = data.url; }} className="text-xs text-gray-600 hover:text-gray-400 transition-colors font-mono">Manage billing →</button>
          </div>
        )}
      </div>
     
      {showPaywall && <PaywallModal onClose={() => setShowPaywall(false)} />}
    </div>
  );
}
