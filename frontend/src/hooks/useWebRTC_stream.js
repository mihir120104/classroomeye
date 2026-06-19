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

// ── TUTOR HOOK — receives all student streams ─────────────────────────────────
export function useTutorStream(sessionId, micStream, screenStream) {
  const socketRef = useRef(null);
  const peersRef = useRef({});
  const [remoteStreams, setRemoteStreams] = useState({});

  const addTutorTracks = (pc) => {
    if (micStream) micStream.getAudioTracks().forEach(t => pc.addTrack(t, micStream));
    if (screenStream) screenStream.getTracks().forEach(t => pc.addTrack(t, screenStream));
  };

  socket.on("webrtc-answer", async ({ answer, studentIndex, answerType }) => {
    const peer = Object.values(peersRef.current).find(p => p.studentIndex === studentIndex);
    if (peer?.pc) {
      try {
        if (peer.pc.signalingState !== "stable") {
          await peer.pc.setRemoteDescription(new RTCSessionDescription(answer));
        }
      } catch (e) { }
    }
  });

  // Renegotiate when mic/screen changes
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket || !sessionId) return;

    Object.entries(peersRef.current).forEach(async ([socketId, { pc, studentIndex }]) => {
      const senders = pc.getSenders();

      // Update audio track
      const audioSender = senders.find(s => s.track?.kind === "audio");
      const newAudio = micStream?.getAudioTracks()[0] || null;
      if (audioSender) {
        audioSender.replaceTrack(newAudio).catch(() => { });
      } else if (newAudio && micStream) {
        pc.addTrack(newAudio, micStream);
      }

      // Update video/screen track
      const videoSender = senders.find(s => s.track?.kind === "video");
      const newVideo = screenStream?.getVideoTracks()[0] || null;
      if (videoSender) {
        videoSender.replaceTrack(newVideo).catch(() => { });
      } else if (newVideo && screenStream) {
        screenStream.getTracks().forEach(t => pc.addTrack(t, screenStream));
      }

      // Renegotiate — create new offer so student receives updated tracks
      try {
        if (pc.signalingState === "stable") {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          socket.emit("webrtc-offer", {
            sessionId,
            studentIndex,
            offer,
            to: socketId,
            offerType: "renegotiate",
          });
        }
      } catch (e) {
        console.warn("Renegotiation failed:", e.message);
      }
    });
  }, [micStream, screenStream, sessionId]);

  useEffect(() => {
    if (!sessionId) return;
    const socket = io(SOCKET_URL, { transports: ["websocket", "polling"] });
    socketRef.current = socket;

    socket.on("connect", () => {
      socket.emit("join-session", { sessionId, role: "tutor" });
    });

    socket.on("student-ready", async ({ studentIndex, socketId }) => {
      const pc = new RTCPeerConnection(STUN);
      peersRef.current[socketId] = { pc, studentIndex, socketId };

      addTutorTracks(pc);

      pc.ontrack = (e) => {
        if (e.streams[0]) {
          setRemoteStreams(prev => ({ ...prev, [studentIndex]: e.streams[0] }));
        }
      };

      pc.onicecandidate = (e) => {
        if (e.candidate) socket.emit("ice-candidate", { sessionId, to: socketId, candidate: e.candidate, studentIndex });
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "failed") pc.restartIce();
      };

      pc.addTransceiver("video", { direction: "sendrecv" });
      pc.addTransceiver("audio", { direction: "sendrecv" });

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit("webrtc-offer", { sessionId, studentIndex, offer });
    });

    socket.on("webrtc-answer", async ({ answer, studentIndex }) => {
      const peer = Object.values(peersRef.current).find(p => p.studentIndex === studentIndex);
      if (peer?.pc && peer.pc.signalingState !== "stable") {
        await peer.pc.setRemoteDescription(new RTCSessionDescription(answer)).catch(() => { });
      }
    });

    socket.on("ice-candidate", async ({ candidate, from }) => {
      const peer = peersRef.current[from];
      if (peer?.pc?.remoteDescription) {
        await peer.pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => { });
      }
    });

    socket.on("student-disconnected", ({ studentIndex }) => {
      setRemoteStreams(prev => { const n = { ...prev }; delete n[studentIndex]; return n; });
      const entry = Object.entries(peersRef.current).find(([, v]) => v.studentIndex === studentIndex);
      if (entry) { entry[1].pc.close(); delete peersRef.current[entry[0]]; }
    });

    return () => {
      Object.values(peersRef.current).forEach(({ pc }) => pc.close());
      peersRef.current = {};
      socket.disconnect();
    };
  }, [sessionId]);

  return { remoteStreams };
}

// ── STUDENT HOOK — sends stream to tutor, receives tutor + peers ──────────────
export function useStudentStream(sessionId, studentIndex, name, stream) {
  const socketRef = useRef(null);
  const tutorPcRef = useRef(null);   // peer connection to tutor
  const peerPcsRef = useRef({});     // peer connections to other students
  const socketIdRef = useRef(null);

  const [tutorStream, setTutorStream] = useState(null);
  const [tutorScreenStream, setTutorScreenStream] = useState(null);
  const [peerStreams, setPeerStreams] = useState({}); // { studentIndex: MediaStream }

  useEffect(() => {
    if (!sessionId || studentIndex === null || !stream) return;

    const socket = io(SOCKET_URL, { transports: ["websocket", "polling"] });
    socketRef.current = socket;

    socket.on("connect", () => {
      socketIdRef.current = socket.id;
      socket.emit("join-session", { sessionId, role: "student", studentIndex, name });
    });

    // Tutor sends offer → student answers
    socket.on("webrtc-offer", async ({ offer, from, offerType }) => {
      if (offerType === "renegotiate" && tutorPcRef.current) {
        const pc = tutorPcRef.current;
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(offer));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          socket.emit("webrtc-answer", { to: from, answer, studentIndex, answerType: "renegotiate" });
        } catch (e) {
          console.warn("Renegotiation answer failed:", e.message);
        }
        return;
      }

      if (offerType === "peer") {
        // Peer-to-peer offer from another student
        const pc = new RTCPeerConnection(STUN);
        peerPcsRef.current[from] = pc;

        stream.getTracks().forEach(t => pc.addTrack(t, stream));

        pc.ontrack = (e) => {
          if (e.streams[0]) {
            const peerIdx = e.streams[0].id; // we'll use socket ID as key
            setPeerStreams(prev => ({ ...prev, [from]: e.streams[0] }));
          }
        };

        pc.onicecandidate = (e) => {
          if (e.candidate) socket.emit("ice-candidate", { sessionId, to: from, candidate: e.candidate, studentIndex });
        };

        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit("webrtc-answer", { to: from, answer, studentIndex, answerType: "peer" });
        return;
      }

      // Tutor offer
      const pc = new RTCPeerConnection(STUN);
      tutorPcRef.current = pc;

      stream.getTracks().forEach(t => pc.addTrack(t, stream));

      const tutorAudio = new MediaStream();
      const tutorScreen = new MediaStream();

      pc.ontrack = (e) => {
        const track = e.track;
        if (track.kind === "audio") {
          tutorAudio.addTrack(track);
          setTutorStream(new MediaStream([track]));
        }
        if (track.kind === "video") {
          tutorScreen.addTrack(track);
          setTutorScreenStream(new MediaStream([track]));
        }
      };

      pc.onicecandidate = (e) => {
        if (e.candidate) socket.emit("ice-candidate", { sessionId, to: from, candidate: e.candidate, studentIndex });
      };

      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit("webrtc-answer", { to: from, answer, studentIndex });
    });

    socket.on("ice-candidate", async ({ candidate, from }) => {
      const pc = tutorPcRef.current || peerPcsRef.current[from];
      if (pc?.remoteDescription) {
        await pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => { });
      }
    });

    // Another student joined — initiate peer connection
    socket.on("peer-joined", async ({ socketId, peerStudentIndex }) => {
      if (peerStudentIndex === studentIndex) return; // don't connect to self

      const pc = new RTCPeerConnection(STUN);
      peerPcsRef.current[socketId] = pc;

      stream.getTracks().forEach(t => pc.addTrack(t, stream));

      pc.ontrack = (e) => {
        if (e.streams[0]) {
          setPeerStreams(prev => ({ ...prev, [peerStudentIndex]: e.streams[0] }));
        }
      };

      pc.onicecandidate = (e) => {
        if (e.candidate) socket.emit("ice-candidate", { sessionId, to: socketId, candidate: e.candidate, studentIndex });
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit("webrtc-offer", { sessionId, studentIndex: peerStudentIndex, offer, to: socketId, offerType: "peer" });
    });

    socket.on("peer-disconnected", ({ socketId, peerStudentIndex }) => {
      setPeerStreams(prev => { const n = { ...prev }; delete n[peerStudentIndex]; return n; });
      peerPcsRef.current[socketId]?.close();
      delete peerPcsRef.current[socketId];
    });

    return () => {
      tutorPcRef.current?.close();
      Object.values(peerPcsRef.current).forEach(pc => pc.close());
      peerPcsRef.current = {};
      socket.disconnect();
    };
  }, [sessionId, studentIndex, stream]);

  return { tutorStream, tutorScreenStream, peerStreams };
}