import { Link } from "react-router-dom";
import Navbar from "../components/Navbar";

const FEATURES = [
  { icon: "👁", title: "Live engagement scores", desc: "MediaPipe FaceMesh detects head pose, eye openness, and face presence. Every student gets a 0–100 score every 5 seconds." },
  { icon: "📊", title: "Post-class dashboard", desc: "Engagement timelines, attention drop timestamps, and a 3-sentence AI summary written automatically after every session." },
  { icon: "📬", title: "Weekly email reports", desc: "Every Monday, receive trend analysis showing which students are declining — with recommended actions." },
];

export default function Landing() {
  return (
    <div className="min-h-screen dot-grid">
      <Navbar />
      <section className="max-w-5xl mx-auto px-6 pt-24 pb-20 text-center">
        <div className="inline-flex items-center gap-2 text-xs font-mono px-3 py-1.5 rounded-full mb-8" style={{background:"rgba(0,255,135,0.1)",border:"1px solid rgba(0,255,135,0.2)",color:"#00FF87"}}>
          <span className="w-1.5 h-1.5 bg-[#00FF87] rounded-full" />Real-time · No manual work · $39/month
        </div>
        <h1 className="font-bold text-5xl sm:text-6xl leading-tight tracking-tight mb-6" style={{fontFamily:"Syne,sans-serif"}}>
          Know exactly which<br /><span style={{color:"#00FF87"}}>students are paying</span><br />attention.
        </h1>
        <p className="text-gray-400 text-lg max-w-xl mx-auto mb-10 leading-relaxed">ClassroomEye monitors webcam engagement in real time — so you can teach better, not just teach more.</p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link to="/register" className="btn-primary px-8 py-3.5 text-sm">Start free — 5 sessions included →</Link>
          <Link to="/login" className="btn-ghost px-8 py-3.5 text-sm">Sign in</Link>
        </div>
        <div className="mt-16 max-w-lg mx-auto card text-left">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-mono text-gray-500 uppercase tracking-widest">Live session · 4 students</span>
            <span className="w-2 h-2 bg-[#00FF87] rounded-full" />
          </div>
          {[{name:"Priya S.",score:91,c:"#00FF87"},{name:"Arjun M.",score:67,c:"#FFB800"},{name:"Sarah K.",score:44,c:"#FFB800"},{name:"Dev R.",score:18,c:"#FF4545"}].map(({name,score,c})=>(
            <div key={name} className="flex items-center gap-3 mb-2 last:mb-0">
              <span className="text-sm text-gray-300 w-20 shrink-0">{name}</span>
              <div className="flex-1 bg-[#21262D] rounded-full h-1.5 overflow-hidden">
                <div className="h-full rounded-full" style={{width:`${score}%`,background:c}} />
              </div>
              <span className="font-mono text-xs text-gray-400 w-7 text-right">{score}</span>
            </div>
          ))}
        </div>
      </section>
      <section className="max-w-5xl mx-auto px-6 pb-24">
        <div className="grid sm:grid-cols-3 gap-5">
          {FEATURES.map((f) => (
            <div key={f.title} className="card">
              <div className="text-3xl mb-4">{f.icon}</div>
              <h3 className="font-bold text-base mb-2" style={{fontFamily:"Syne,sans-serif"}}>{f.title}</h3>
              <p className="text-gray-400 text-sm leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>
      <section className="max-w-5xl mx-auto px-6 pb-32 text-center">
        <h2 className="font-bold text-3xl mb-3" style={{fontFamily:"Syne,sans-serif"}}>Simple pricing</h2>
        <p className="text-gray-400 mb-10 text-sm">Start free. Upgrade when you're ready.</p>
        <div className="grid sm:grid-cols-2 gap-5 max-w-2xl mx-auto">
          <div className="card text-left">
            <p className="font-bold text-xl mb-1" style={{fontFamily:"Syne,sans-serif"}}>Free</p>
            <p className="font-bold text-4xl mb-4" style={{fontFamily:"Syne,sans-serif"}}>$0</p>
            <ul className="space-y-2 mb-6 text-sm text-gray-400">{["5 sessions lifetime","Live engagement scores","Post-class dashboard"].map(f=><li key={f}>✓ {f}</li>)}</ul>
            <Link to="/register" className="btn-ghost w-full text-center block py-2.5 text-sm">Get started free</Link>
          </div>
          <div className="card text-left relative" style={{borderColor:"rgba(0,255,135,0.3)",background:"rgba(0,255,135,0.05)"}}>
            <span className="absolute top-4 right-4 text-xs font-mono px-2 py-0.5 rounded-full" style={{color:"#00FF87",background:"rgba(0,255,135,0.1)"}}>Popular</span>
            <p className="font-bold text-xl mb-1" style={{fontFamily:"Syne,sans-serif"}}>Pro</p>
            <p className="font-bold text-4xl mb-4" style={{fontFamily:"Syne,sans-serif"}}>$39<span className="text-xl text-gray-400 font-normal">/mo</span></p>
            <ul className="space-y-2 mb-6 text-sm text-gray-300">{["Unlimited sessions","Up to 30 students","AI class summary","Weekly email reports"].map(f=><li key={f}>✓ {f}</li>)}</ul>
            <Link to="/register" className="btn-primary w-full text-center block py-2.5 text-sm">Start with Pro →</Link>
          </div>
        </div>
      </section>
      <footer className="border-t border-[#21262D] py-8 text-center text-xs text-gray-600 font-mono">ClassroomEye © {new Date().getFullYear()}</footer>
    </div>
  );
}
