import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  return (
    <nav className="border-b border-[#21262D] bg-[#0D1117]/80 backdrop-blur-sm sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
        <Link to={user ? "/dashboard" : "/"} className="font-bold text-lg tracking-tight" style={{fontFamily:"Syne,sans-serif"}}>
          Classroom<span style={{color:"#00FF87"}}>Eye</span>
        </Link>
        <div className="flex items-center gap-4">
          {user ? (
            <>
              <span className="text-xs text-gray-500 font-mono hidden sm:block">
                {user.plan === "paid" ? <span style={{color:"#00FF87"}}>● PRO</span> : <span style={{color:"#FFB800"}}>● FREE · {5 - user.sessionsUsed} left</span>}
              </span>
              <Link to="/dashboard" className="text-sm text-gray-400 hover:text-white transition-colors">Dashboard</Link>
              <button onClick={() => { logout(); navigate("/"); }} className="text-sm text-gray-500 hover:text-white transition-colors">Sign out</button>
            </>
          ) : (
            <>
              <Link to="/login" className="text-sm text-gray-400 hover:text-white transition-colors">Sign in</Link>
              <Link to="/register" className="btn-primary py-2 px-4 text-xs">Get started</Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
