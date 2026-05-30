import { useRef, useState, useCallback, useEffect } from "react";
import api from "../api/client";

export default function useWebRTC({ sessionId, onScores }) {
  const [stream, setStream] = useState(null);
  const [error, setError] = useState(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const framesRef = useRef([]);
  const captureTimer = useRef(null);
  const sendTimer = useRef(null);

  const captureFrame = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !video.readyState || video.readyState < 2) return;
    // Lazy canvas creation for mobile
    if (!canvasRef.current) {
      canvasRef.current = document.createElement("canvas");
    }
    // ... rest of code
  }, []);

  const sendFrames = useCallback(async () => {
    if (!framesRef.current.length || !sessionId) return;
    const latest = framesRef.current[framesRef.current.length - 1];
    framesRef.current = [];
    try {
      const { data } = await api.post(`/sessions/${sessionId}/frames`, { frames: [latest] });
      onScores?.(data.scores);
    } catch (err) { console.warn("[ClassroomEye] Frame send failed:", err.message); }
  }, [sessionId, onScores]);

  const startCapture = useCallback(async () => {
    setError(null);
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, facingMode: "user" }, audio: false });
      setStream(mediaStream);
      if (videoRef.current) videoRef.current.srcObject = mediaStream;
      setIsCapturing(true);
      captureTimer.current = setInterval(captureFrame, 1000);
      sendTimer.current = setInterval(sendFrames, 5000);
    } catch (err) {
      setError(err.name === "NotAllowedError" ? "Camera permission denied. Please allow camera access and refresh." : `Camera error: ${err.message}`);
    }
  }, [captureFrame, sendFrames]);

  const stopCapture = useCallback(() => {
    clearInterval(captureTimer.current);
    clearInterval(sendTimer.current);
    stream?.getTracks().forEach((t) => t.stop());
    setStream(null);
    setIsCapturing(false);
    framesRef.current = [];
  }, [stream]);

  const attachRef = useCallback((el) => {
    videoRef.current = el;
    if (el && stream) el.srcObject = stream;
  }, [stream]);

  useEffect(() => () => {
    clearInterval(captureTimer.current);
    clearInterval(sendTimer.current);
    stream?.getTracks().forEach((t) => t.stop());
  }, [stream]);

  return { startCapture, stopCapture, isCapturing, error, attachRef, stream };
}
