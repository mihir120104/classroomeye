import { useState } from "react";
import api from "../api/client";
import { useAuth } from "../context/AuthContext";

export default function PaywallModal({ onClose }) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleUpgrade = async () => {
    setLoading(true); setError("");
    try {
      const { data } = await api.post("/stripe/checkout");
      window.location.href = data.url;
    } catch (err) { setError(err.response?.data?.error || "Something went wrong"); setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#080B0F]/80 backdrop-blur-sm">
      <div className="card max-w-md w-full mx-4">
        <div className="flex items-start justify-between mb-6">
          <div>
            <p className="text-xs font-mono text-[#FFB800] uppercase tracking-widest mb-1">Free plan limit reached</p>
            <h2 className="text-2xl font-bold" style={{fontFamily:"Syne,sans-serif"}}>Unlock unlimited sessions</h2>
          </div>
          <button onClick={onClose} className="text-gray-600 hover:text-white text-xl">×</button>
        </div>
        <div className="bg-[#21262D] rounded-lg p-5 mb-6 text-center">
          <div className="text-5xl font-bold mb-1">$39<span className="text-2xl text-gray-400 font-normal">/mo</span></div>
          <p className="text-gray-400 text-sm">Cancel anytime · No contracts</p>
        </div>
        <ul className="space-y-3 mb-6">
          {["Unlimited sessions","Up to 30 students per session","AI class summary after every session","Weekly email reports","Attention drop alerts"].map((f) => (
            <li key={f} className="flex items-center gap-3 text-sm text-gray-300"><span style={{color:"#00FF87"}}>✓</span>{f}</li>
          ))}
        </ul>
        {error && <p className="text-[#FF4545] text-sm mb-4">{error}</p>}
        <button onClick={handleUpgrade} disabled={loading} className="btn-primary w-full py-3 flex items-center justify-center gap-2">
          {loading ? <><span className="animate-spin inline-block w-4 h-4 border-2 border-[#080B0F] border-t-transparent rounded-full" />Redirecting…</> : "Upgrade to Pro — $39/month"}
        </button>
        <p className="text-center text-xs text-gray-600 mt-3">Secured by Stripe · {user?.email}</p>
      </div>
    </div>
  );
}
