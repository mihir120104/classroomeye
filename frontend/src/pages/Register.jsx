import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const handle = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault(); setError("");
    if (form.password.length < 8) { setError("Password must be at least 8 characters"); return; }
    setLoading(true);
    try { await register(form.email, form.password, form.name); navigate("/dashboard"); }
    catch (err) { setError(err.response?.data?.error || "Registration failed"); }
    finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen dot-grid flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <Link to="/" className="font-bold text-2xl tracking-tight" style={{fontFamily:"Syne,sans-serif"}}>Classroom<span style={{color:"#00FF87"}}>Eye</span></Link>
          <p className="text-gray-500 text-sm mt-2">Create your free account · 5 sessions included</p>
        </div>
        <div className="card">
          <form onSubmit={submit} className="space-y-4">
            {[{n:"name",t:"text",p:"Your name"},{n:"email",t:"email",p:"you@example.com"},{n:"password",t:"password",p:"Min 8 characters"}].map(({n,t,p}) => (
              <div key={n}>
                <label className="block text-xs text-gray-500 mb-1.5 font-mono uppercase tracking-wider">{n}</label>
                <input type={t} name={n} value={form[n]} onChange={handle} required={n!=="name"}
                  className="w-full bg-[#21262D] border border-[#30363D] rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#00FF87] transition-colors"
                  placeholder={p} />
              </div>
            ))}
            {error && <p className="text-[#FF4545] text-sm">{error}</p>}
            <button type="submit" disabled={loading} className="btn-primary w-full py-2.5 flex items-center justify-center gap-2">
              {loading ? <><span className="animate-spin w-4 h-4 border-2 border-[#080B0F] border-t-transparent rounded-full" />Creating…</> : "Create free account →"}
            </button>
          </form>
        </div>
        <p className="text-center text-sm text-gray-600 mt-2">Already have an account? <Link to="/login" style={{color:"#00FF87"}} className="hover:underline">Sign in</Link></p>
      </div>
    </div>
  );
}
