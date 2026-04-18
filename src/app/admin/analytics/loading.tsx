export default function AnalyticsLoading() {
  return (
    <div className="min-h-screen bg-[#667470]">
      {/* Matching header */}
      <header className="bg-[#7b8b87] sticky top-0 z-10 h-[52px]" />

      <div className="max-w-3xl mx-auto px-4 py-6 space-y-6 animate-pulse">
        {/* Period picker placeholder */}
        <div className="h-9 bg-black/10 rounded-xl w-72" />

        {/* KPI cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className={`h-24 rounded-2xl ${i === 0 ? "bg-white/20" : "bg-white/10"}`} />
          ))}
        </div>

        {/* Chart cards */}
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-white/10 rounded-2xl h-48" />
        ))}
      </div>
    </div>
  );
}
