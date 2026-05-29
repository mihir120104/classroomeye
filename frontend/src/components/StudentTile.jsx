const SCORE_COLOR = (score) => {
  if (score === null) return { text: "#6B7280", bg: "rgba(107,114,128,0.1)", border: "rgba(107,114,128,0.3)" };
  if (score >= 70) return { text: "#00FF87", bg: "rgba(0,255,135,0.1)", border: "rgba(0,255,135,0.3)" };
  if (score >= 40) return { text: "#FFB800", bg: "rgba(255,184,0,0.1)", border: "rgba(255,184,0,0.3)" };
  return { text: "#FF4545", bg: "rgba(255,69,69,0.1)", border: "rgba(255,69,69,0.3)" };
};

const RING_COLOR = (score) =>
  !score ? "#30363D" : score >= 70 ? "#00FF87" : score >= 40 ? "#FFB800" : "#FF4545";

const getLabel = (score, isPresent) => {
  if (score === null) return "waiting";
  if (!isPresent)     return "not in frame";
  if (score >= 70)    return "focused";
  if (score >= 40)    return "looking away";
  return "distracted";
};

const getReason = (score, isPresent) => {
  if (score === null || score >= 70) return null;
  if (!isPresent)  return "Student not visible in camera";
  if (score >= 40) return "Head turned away from screen";
  return "Not looking at screen";
};

export default function StudentTile({ student, score, isPresent, videoRef }) {
  const circumference = 2 * Math.PI * 40;
  const offset = score !== null
    ? circumference - (score / 100) * circumference
    : circumference;
  const colors = SCORE_COLOR(score);
  const label  = getLabel(score, isPresent);
  const reason = getReason(score, isPresent);

  // Flash red border when critically distracted
  const isCritical = score !== null && score < 40 && isPresent;

  return (
    <div
      className="relative bg-[#161B22] rounded-xl overflow-hidden transition-all duration-300"
      style={{
        border: isCritical
          ? "1px solid rgba(255,69,69,0.6)"
          : "1px solid #21262D",
        boxShadow: isCritical
          ? "0 0 12px rgba(255,69,69,0.2)"
          : "none",
      }}
    >
      {/* Video feed */}
      <div className="relative aspect-video bg-[#0D1117] flex items-center justify-center">
        {videoRef ? (
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="flex flex-col items-center gap-2 text-gray-700">
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0" />
            </svg>
            <span className="text-xs font-mono">No feed</span>
          </div>
        )}

        {/* Presence dot */}
        <div
          className="absolute top-2 left-2 w-2 h-2 rounded-full"
          style={{ background: isPresent ? "#00FF87" : "#FF4545" }}
        />

        {/* Critical alert flash */}
        {isCritical && (
          <div className="absolute top-2 right-10 flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono"
            style={{ background: "rgba(255,69,69,0.2)", color: "#FF4545", border: "1px solid rgba(255,69,69,0.4)" }}>
            ⚠ alert
          </div>
        )}

        {/* Score ring */}
        <div className="absolute bottom-2 right-2">
          <svg width="44" height="44" viewBox="0 0 100 100" className="-rotate-90">
            <circle cx="50" cy="50" r="40" fill="none" stroke="#21262D" strokeWidth="8" />
            <circle
              cx="50" cy="50" r="40" fill="none"
              stroke={RING_COLOR(score)}
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={offset}
              style={{ transition: "stroke-dashoffset 0.6s ease" }}
            />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center font-mono text-[10px] font-medium text-white">
            {score !== null ? score : "—"}
          </span>
        </div>
      </div>

      {/* Footer */}
      <div className="px-3 py-2">
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-300 truncate max-w-[120px]">
            {student?.name || "Student"}
          </span>
          <span
            className="text-[10px] font-mono px-2 py-0.5 rounded-md border"
            style={{ color: colors.text, background: colors.bg, borderColor: colors.border }}
          >
            {label}
          </span>
        </div>

        {/* Reason text — only shows when score is low */}
        {reason && (
          <p className="text-[10px] text-gray-600 mt-1 font-mono truncate">
            {reason}
          </p>
        )}
      </div>
    </div>
  );
}