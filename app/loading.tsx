export default function Loading() {
  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)" }}>
      {/* Navbar skeleton */}
      <div style={{
        height: 60, borderBottom: "1px solid var(--border)",
        background: "var(--bg-card)", display: "flex", alignItems: "center",
        padding: "0 24px", gap: 16,
      }}>
        <div className="skeleton" style={{ width: 120, height: 28, borderRadius: "var(--radius-sm)" }} />
        <div style={{ flex: 1 }} />
        <div className="skeleton" style={{ width: 80, height: 32, borderRadius: "var(--radius-sm)" }} />
      </div>

      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "40px 24px" }}>
        {/* Page title skeleton */}
        <div className="skeleton" style={{ width: 280, height: 36, borderRadius: "var(--radius-sm)", marginBottom: 8 }} />
        <div className="skeleton" style={{ width: 200, height: 18, borderRadius: "var(--radius-sm)", marginBottom: 32 }} />

        {/* Stats row skeleton */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16, marginBottom: 32 }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} style={{
              background: "var(--bg-card)", border: "1.5px solid var(--border)",
              borderRadius: "var(--radius-lg)", padding: "20px 24px",
            }}>
              <div className="skeleton" style={{ width: 100, height: 12, borderRadius: 4, marginBottom: 12 }} />
              <div className="skeleton" style={{ width: 60, height: 28, borderRadius: 4 }} />
            </div>
          ))}
        </div>

        {/* Card grid skeleton */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(360px, 1fr))", gap: 20 }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} style={{
              background: "var(--bg-card)", border: "1.5px solid var(--border)",
              borderRadius: "var(--radius-lg)", padding: "20px 22px",
              animationDelay: `${i * 0.1}s`,
            }}>
              <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                <div className="skeleton" style={{ width: 64, height: 20, borderRadius: 99 }} />
                <div className="skeleton" style={{ width: 48, height: 20, borderRadius: 99 }} />
              </div>
              <div className="skeleton" style={{ width: "85%", height: 20, borderRadius: 4, marginBottom: 8 }} />
              <div className="skeleton" style={{ width: "60%", height: 20, borderRadius: 4, marginBottom: 16 }} />
              <div className="skeleton" style={{ width: "100%", height: 56, borderRadius: "var(--radius-sm)", marginBottom: 16 }} />
              <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 14, borderTop: "1px solid var(--border)" }}>
                <div className="skeleton" style={{ width: 80, height: 14, borderRadius: 4 }} />
                <div className="skeleton" style={{ width: 80, height: 14, borderRadius: 4 }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
