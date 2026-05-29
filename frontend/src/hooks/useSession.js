import { useState, useCallback, useRef } from "react";
import api from "../api/client";

export default function useSession() {
  const [session, setSession] = useState(null);
  const [scores, setScores] = useState({});
  const [elapsed, setElapsed] = useState(0);
  const [ending, setEnding] = useState(false);
  const [error, setError] = useState(null);
  const timerRef = useRef(null);

  const startSession = useCallback(async (studentNames) => {
    setError(null);
    try {
      const { data } = await api.post("/sessions/start", { studentNames });
      setSession(data);
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
      return data;
    } catch (err) {
      const msg = err.response?.data?.error || "Failed to start session";
      const code = err.response?.data?.code;
      setError({ message: msg, code });
      throw { message: msg, code };
    }
  }, []);

  const updateScores = useCallback((incoming) => {
    setScores((prev) => {
      const next = { ...prev };
      incoming.forEach(({ studentIndex, engagementScore }) => { next[studentIndex] = engagementScore; });
      return next;
    });
  }, []);

  const endSession = useCallback(async () => {
    if (!session?.sessionId) return null;
    setEnding(true);
    clearInterval(timerRef.current);
    try {
      const { data } = await api.post(`/sessions/${session.sessionId}/end`);
      return data;
    } catch (err) {
      setError({ message: err.response?.data?.error || "Failed to end session" });
      return null;
    } finally { setEnding(false); }
  }, [session]);

  const formatElapsed = () => {
    const m = Math.floor(elapsed / 60).toString().padStart(2, "0");
    const s = (elapsed % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  return { session, scores, elapsed, ending, error, startSession, updateScores, endSession, formatElapsed };
}
