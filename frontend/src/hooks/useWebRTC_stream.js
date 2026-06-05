import { useRef, useEffect, useState } from "react";
import { io } from "socket.io-client";

const STUN = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
  ],
};

const SOCKET_URL = import.meta.env.VITE_API_URL || "http://localhost:4000";

// ── TUTOR HOOK ─────────────────────────────────────────────────────────────
export function useTutorStream(sessionId, micStream, screenStream) {
  const socketRef = useRef(null);
  const peersRef  = useRef({}); // { socketId: { pc, studentIndex } }
  const [remoteStreams, setRemoteStreams] = useState({});

  // Helper — add tutor's outgoing tracks to a peer connection
  const addTutorTracks = (pc) => {
    // Add mic audio if available
    if (micStream) {
      micStream.getAudioTracks().forEach(track => {
        pc.addTrack(track, micStream);
      });
    }
    // Add screen share if active
    if (screenStream) {
      screenStream.getTracks().forEach(track => {
        pc.addTrack(track, screenStream);
      });
    }
  };

  // When mic or screen changes — renegotiate all existing peers
  useEffect(() => {
    Object.values(peersRef.current).forEach(({ pc, socketId }) => {
      // Replace tracks on existing senders
      const senders = pc.getSenders();

      // Update audio track
      const audioSender = senders.find(s => s.track?.kind === "audio");
      const newAudioTrack = micStream?.getAudioTracks()[0] || null;
      if (audioSender) {
        audioSender.replaceTrack(newAudioTrack);
      } else if (newAudioTrack) {
        pc.addTrack(newAudioTrack, micStream);
      }

      // Update screen track
      const videoSender = senders.find(s => s.track?.kind === "video" && s.track?.label?.includes("screen"));
      const newScreenTrack = screenStream?.getVideoTracks()[0] || null;
      if (videoSender) {
        videoSender.replaceTrack(newScreenTrack);
      } else if (newScreenTrack && screenStream) {
        screenStream.getTracks().forEach(t => pc.addTrack(t, screenStream));
      }
    });
  }, [micStream, screenStream]);

  useEffect(() => {
    if (!sessionId) return;

    const socket = io(SOCKET_URL, { transports: ["websocket", "polling"] });
    socketRef.current = socket;

    socket.on("connect", () => {
      socket.emit("join-session", { sessionId, role: "tutor" });
    });

    socket.on("student-ready", async ({ studentIndex, socketId, name }) => {
      const pc = new RTCPeerConnection(STUN);
      peersRef.current[socketId] = { pc, studentIndex, socketId };

      // Add tutor's outgoing tracks (mic + screen)
      addTutorTracks(pc);

      // Receive student's tracks (video + audio)
      pc.ontrack = (e) => {
        if (e.streams[0]) {
          setRemoteStreams(prev => ({ ...prev, [studentIndex]: e.streams[0] }));
        }
      };

      pc.onicecandidate = (e) => {
        if (e.candidate) {
          socket.emit("ice-candidate", {
            sessionId, to: socketId,
            candidate: e.candidate,
            studentIndex,
          });
        }
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "failed") {
          pc.restartIce();
        }
      };

      // Add transceivers to receive student video+audio
      pc.addTransceiver("video", { direction: "sendrecv" });
      pc.addTransceiver("audio", { direction: "sendrecv" });

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit("webrtc-offer", { sessionId, studentIndex, offer });
    });

    socket.on("webrtc-answer", async ({ answer, studentIndex }) => {
      const peer = Object.values(peersRef.current)
        .find(p => p.studentIndex === studentIndex);
      if (peer?.pc && peer.pc.signalingState !== "stable") {
        await peer.pc.setRemoteDescription(new RTCSessionDescription(answer));
      }
    });

    socket.on("ice-candidate", async ({ candidate, from }) => {
      const peer = peersRef.current[from];
      if (peer?.pc?.remoteDescription) {
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
      // Clean up peer
      const entry = Object.entries(peersRef.current)
        .find(([, v]) => v.studentIndex === studentIndex);
      if (entry) {
        entry[1].pc.close();
        delete peersRef.current[entry[0]];
      }
    });

    return () => {
      Object.values(peersRef.current).forEach(({ pc }) => pc.close());
      peersRef.current = {};
      socket.disconnect();
    };
  }, [sessionId]);

  return { remoteStreams };
}

// ── STUDENT HOOK ───────────────────────────────────────────────────────────
export function useStudentStream(sessionId, studentIndex, name, stream) {
  const socketRef = useRef(null);
  const pcRef     = useRef(null);
  const [tutorStream, setTutorStream] = useState(null);
  const [tutorScreenStream, setTutorScreenStream] = useState(null);

  useEffect(() => {
    if (!sessionId || studentIndex === null || !stream) return;

    const socket = io(SOCKET_URL, { transports: ["websocket", "polling"] });
    socketRef.current = socket;

    socket.on("connect", () => {
      socket.emit("join-session", {
        sessionId, role: "student", studentIndex, name,
      });
    });

    socket.on("webrtc-offer", async ({ offer, from }) => {
      const pc = new RTCPeerConnection(STUN);
      pcRef.current = pc;

      // Add student's video + audio tracks
      stream.getTracks().forEach(track => pc.addTrack(track, stream));

      // Receive tutor's tracks (audio + screen)
      const tutorAudioCtx = new MediaStream();
      const tutorScreenCtx = new MediaStream();

      pc.ontrack = (e) => {
        const track = e.track;
        if (track.kind === "audio") {
          tutorAudioCtx.addTrack(track);
          setTutorStream(new MediaStream([track]));
        }
        if (track.kind === "video") {
          tutorScreenCtx.addTrack(track);
          setTutorScreenStream(new MediaStream([track]));
        }
      };

      pc.onicecandidate = (e) => {
        if (e.candidate) {
          socket.emit("ice-candidate", {
            sessionId, to: from,
            candidate: e.candidate,
            studentIndex,
          });
        }
      };

      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit("webrtc-answer", { to: from, answer, studentIndex });
    });

    socket.on("ice-candidate", async ({ candidate }) => {
      if (pcRef.current?.remoteDescription) {
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

  return { tutorStream, tutorScreenStream };
}