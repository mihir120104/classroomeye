import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import Navbar from "../components/Navbar";
import EngagementChart from "../components/EngagementChart";
import api from "../api/client";

function buildChartData(session) {
  if (!session?.timeline?.length) return [];
  const start = new Date(session.startTime).getTime();
  return session.timeline.map((entry) => {
    const elapsed = Math.round((new Date(entry.timestamp).getTime() - start) / 1000);
    const point = { time: `${Math.floor(elapsed/60)}:${(elapsed%60).toString().padStart(2,"0")}` };
    session.students.forEach((s,idx) => { point[s.name||`Student ${idx+1}`] = entry.scores[idx]??0; });
    return point;
  });
}

export default function SessionReport() {
  const { id } = useParams();
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => { api.get(`/sessions/${id}`).then(({data})=>setSession(data.session)).catch(()=>setError("Session not found")).finally(()=>setLoading(false)); }, [id]);

  if (loading) return <div className="min-h-screen flex items-center justify-center"><span className="animate-spin w-6 h-6 border-2 border-[#00FF87] border-t-transparent rounded-full"/></div>;
  if (error||!session) return <div className="min-h-screen flex flex-col items-center justify-center gap-4"><p style={{color:"#FF4545"}} className="font-mono">{error||"Not found"}</p><Link to="/dashboard" className="btn-ghost text-sm">← Back</Link></div>;

  const chartData = buildChartData(session);
  const durationMin = Math.round((session.durationSeconds||0)/60);
  const totalDrops = session.students.reduce((a,s)=>a+(s.attentionDrops?.length||0),0);

  return (
    <div className="min-h-screen">
      <Navbar />
      <div className="max-w-5xl mx-auto px-6 py-10 space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <Link to="/dashboard" className="text-xs text-gray-600 hover:text-gray-400 font-mono mb-3 block">← Back to dashboard</Link>
            <h1 className="font-bold text-3xl" style={{fontFamily:"Syne,sans-serif"}}>Session report</h1>
            <p className="text-gray-500 text-sm mt-1">{new Date(session.startTime).toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric"})} at {new Date(session.startTime).toLocaleTimeString("en-US",{hour:"2-digit",minute:"2-digit"})}</p>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[{l:"Avg engagement",v:`${session.averageEngagement}/100`},{l:"Duration",v:`${durationMin} min`},{l:"Students",v:session.studentCount},{l:"Attention drops",v:totalDrops}].map(({l,v})=>(
            <div key={l} className="card"><p className="text-xs font-mono text-gray-500 uppercase tracking-widest mb-1">{l}</p><p className="font-bold text-3xl text-white" style={{fontFamily:"Syne,sans-serif"}}>{v}</p></div>
          ))}
        </div>
        {session.aiSummary ? (
          <div className="card" style={{borderColor:"rgba(0,255,135,0.2)",background:"rgba(0,255,135,0.05)"}}>
            <p className="text-xs font-mono uppercase tracking-widest mb-3" style={{color:"#00FF87"}}>AI class summary</p>
            <p className="text-gray-300 text-sm leading-relaxed">{session.aiSummary}</p>
          </div>
        ) : (
          <div className="card"><p className="text-xs font-mono text-gray-600 uppercase tracking-widest mb-2">AI class summary</p><p className="text-gray-600 text-sm font-mono">Generating summary… refresh in a moment.</p></div>
        )}
        <div className="card">
          <h2 className="font-bold text-base mb-5" style={{fontFamily:"Syne,sans-serif"}}>Engagement timeline</h2>
          <EngagementChart data={chartData} students={session.students} />
        </div>
        <div className="card">
          <h2 className="font-bold text-base mb-5" style={{fontFamily:"Syne,sans-serif"}}>Student breakdown</h2>
          <div className="space-y-4">
            {session.students.map((student,idx)=>{
              const score = student.averageScore||0;
              const color = score>=70?"#00FF87":score>=40?"#FFB800":"#FF4545";
              return (
                <div key={idx}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm text-gray-300">{student.name||`Student ${idx+1}`}
                      {!student.attendanceFlag&&<span className="ml-2 text-xs font-mono px-1.5 py-0.5 rounded" style={{color:"#FF4545",background:"rgba(255,69,69,0.1)"}}>absent</span>}
                    </span>
                    <span className="text-xs text-gray-600 font-mono">{student.attentionDrops?.length||0} drop{student.attentionDrops?.length!==1?"s":""}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 bg-[#21262D] rounded-full h-1.5 overflow-hidden">
                      <div className="h-full rounded-full" style={{width:`${score}%`,background:color,transition:"width 0.7s"}} />
                    </div>
                    <span className="font-mono text-sm font-medium w-8 text-right" style={{color}}>{score}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        {session.students.some(s=>s.attentionDrops?.length>0)&&(
          <div className="card">
            <h2 className="font-bold text-base mb-4" style={{fontFamily:"Syne,sans-serif"}}>Attention drop timestamps</h2>
            <div className="space-y-2">
              {session.students.map((student,idx)=>(student.attentionDrops||[]).map((ts,di)=>{
                const offset=Math.round((new Date(ts).getTime()-new Date(session.startTime).getTime())/1000);
                return (
                  <div key={`${idx}-${di}`} className="flex items-center gap-3 text-sm">
                    <span className="font-mono text-xs px-2 py-0.5 rounded" style={{color:"#FFB800",background:"rgba(255,184,0,0.1)"}}>{Math.floor(offset/60)}:{(offset%60).toString().padStart(2,"0")}</span>
                    <span className="text-gray-400">{student.name||`Student ${idx+1}`} dropped below attention threshold</span>
                  </div>
                );
              }))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
