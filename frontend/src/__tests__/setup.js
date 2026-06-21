// frontend/src/__tests__/setup.js
import "@testing-library/jest-dom";
import { vi } from "vitest";

// Mock socket.io-client so WebRTC tests don't need a real server
vi.mock("socket.io-client", () => ({
  io: vi.fn(() => ({
    on: vi.fn(),
    emit: vi.fn(),
    disconnect: vi.fn(),
    id: "mock-socket-id",
  })),
}));

// Mock navigator.mediaDevices for camera tests
Object.defineProperty(global.navigator, "mediaDevices", {
  value: {
    getUserMedia: vi.fn().mockResolvedValue({
      getTracks: () => [],
      getVideoTracks: () => [],
      getAudioTracks: () => [],
    }),
  },
  writable: true,
});

// Mock RTCPeerConnection
global.RTCPeerConnection = vi.fn().mockImplementation(() => ({
  addTrack: vi.fn(),
  addTransceiver: vi.fn(),
  createOffer: vi.fn().mockResolvedValue({ type: "offer", sdp: "mock-sdp" }),
  createAnswer: vi.fn().mockResolvedValue({ type: "answer", sdp: "mock-sdp" }),
  setLocalDescription: vi.fn().mockResolvedValue(undefined),
  setRemoteDescription: vi.fn().mockResolvedValue(undefined),
  addIceCandidate: vi.fn().mockResolvedValue(undefined),
  getSenders: vi.fn().mockReturnValue([]),
  close: vi.fn(),
  ontrack: null,
  onicecandidate: null,
  onconnectionstatechange: null,
  connectionState: "connected",
  signalingState: "stable",
  remoteDescription: { type: "answer" },
}));

global.RTCSessionDescription = vi.fn().mockImplementation((desc) => desc);
global.RTCIceCandidate = vi.fn().mockImplementation((candidate) => candidate);
global.MediaStream = vi.fn().mockImplementation(() => ({
  getTracks: () => [],
  getVideoTracks: () => [],
  getAudioTracks: () => [],
  addTrack: vi.fn(),
}));