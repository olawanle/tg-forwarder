export function MiniProgressRing({ fraction, size = 74 }: { fraction: number; size?: number }) {
  const deg = Math.max(0, Math.min(1, fraction)) * 360;
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: "50%",
          background: `conic-gradient(var(--accent) 0deg, #ff9a3c ${deg}deg, var(--hair) ${deg}deg)`,
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 8,
          borderRadius: "50%",
          background: "var(--glass)",
          display: "grid",
          placeItems: "center",
          boxShadow: "var(--shadow)",
        }}
      >
        <span className="mono" style={{ fontSize: 17, fontWeight: 800, letterSpacing: "-0.03em" }}>
          {Math.round(fraction * 100)}%
        </span>
      </div>
    </div>
  );
}
