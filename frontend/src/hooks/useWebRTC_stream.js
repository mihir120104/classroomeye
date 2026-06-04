import { useRef, useEffect, useCallback, useState } from "react";
import { io } from "socket.io-client";

const STUN_SERVERS = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
};

const SOCKET_URL = import.meta.env.VITE_API_URL || "http://localhost:4000";

// ── TUTOR HOOK — receives streams from all students ────────────────────────
export function useTutorStream(sessionId) {
  const socketRef = useRef(null);
  const peersRef  = useRef({}); // { socketId: RTCPeerConnection }
  const [remoteStreams, setRemoteStreams] = useState({}); // { studentIndex: MediaStream }

  useEffect(() => {
    if (!sessionId) return;

    const socket = io(SOCKET_URL, { transports: ["websocket", "polling"] });
    socketRef.current = socket;

    socket.on("connect", () => {
      socket.emit("join-session", { sessionId, role: "tutor" });
    });

    // Student is ready — initiate peer connection
    socket.on("student-ready", async ({ studentIndex, socketId }) => {
      const pc = new RTCPeerConnection(STUN_SERVERS);
      peersRef.current[socketId] = { pc, studentIndex };

      pc.onicecandidate = (e) => {
        if (e.candidate) {
          socket.emit("ice-candidate", {
            sessionId, to: socketId,
            candidate: e.candidate,
            studentIndex,
          });
        }
      };

      pc.ontrack = (e) => {
        if (e.streams[0]) {
          setRemoteStreams(prev => ({ ...prev, [studentIndex]: e.streams[0] }));
        }
      };

      // Create offer to receive student's stream
      pc.addTransceiver("video", { direction: "recvonly" });
      pc.addTransceiver("audio", { direction: "recvonly" });

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      socket.emit("webrtc-offer", { sessionId, studentIndex, offer });
    });

    socket.on("webrtc-answer", async ({ answer, studentIndex }) => {
      // Find peer by studentIndex
      const peer = Object.values(peersRef.current)
        .find(p => p.studentIndex === studentIndex);
      if (peer) {
        await peer.pc.setRemoteDescription(new RTCSessionDescription(answer));
      }
    });

    socket.on("ice-candidate", async ({ candidate, from, studentIndex }) => {
      const peer = peersRef.current[from];
      if (peer?.pc) {
        try {
          await peer.pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (e) {}
      }
    });

    socket.on("student-disconnected", ({ studentIndex }) => {
      setRemoteStreams(prev => {
        const next = { ...prev };
        delete next[studentIndex];
        return next;
      });
    });

    return () => {
      Object.values(peersRef.current).forEach(({ pc }) => pc.close());
      peersRef.current = {};
      socket.disconnect();
    };
  }, [sessionId]);

  return { remoteStreams };
}

// ── STUDENT HOOK — sends stream to tutor ──────────────────────────────────
export function useStudentStream(sessionId, studentIndex, name, stream) {
  const socketRef = useRef(null);
  const pcRef     = useRef(null);

  useEffect(() => {
    if (!sessionId || studentIndex === null || !stream) return;

    const socket = io(SOCKET_URL, { transports: ["websocket", "polling"] });
    socketRef.current = socket;

    socket.on("connect", () => {
      socket.emit("join-session", { sessionId, role: "student", studentIndex, name });
    });

    // Tutor sent offer — create answer
    socket.on("webrtc-offer", async ({ offer, from }) => {
      const pc = new RTCPeerConnection(STUN_SERVERS);
      pcRef.current = pc;

      pc.onicecandidate = (e) => {
        if (e.candidate) {
          socket.emit("ice-candidate", {
            sessionId, to: from,
            candidate: e.candidate,
            studentIndex,
          });
        }
      };

      // Add student's tracks (video + audio)
      stream.getTracks().forEach(track => pc.addTrack(track, stream));

      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      socket.emit("webrtc-answer", { to: from, answer, studentIndex });
    });

    socket.on("ice-candidate", async ({ candidate }) => {
      if (pcRef.current) {
        try {
          await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (e) {}
      }
    });

    return () => {
      pcRef.current?.close();
      socket.disconnect();
    };
  }, [sessionId, studentIndex, stream]);
}