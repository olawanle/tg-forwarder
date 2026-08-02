export function ProgressRing({
  fraction,
  size = 214,
  thickness = 15,
  center,
  spinning = false,
}: {
  fraction: number;
  size?: number;
  thickness?: number;
  center: React.ReactNode;
  spinning?: boolean;
}) {
  const deg = Math.max(0, Math.min(1, fraction)) * 360;
  return (
    <div style={{ position: "relative", width: size, height: size }}>
      {spinning && (
        <div
          style={{
            position: "absolute",
            inset: -14,
            borderRadius: "50%",
            background:
              "conic-gradient(from 0deg, rgba(42,171,238,0), rgba(42,171,238,0.55), rgba(0,122,255,0.75), rgba(42,171,238,0))",
            filter: "blur(20px)",
            animation: "glassSpin 6s linear infinite",
          }}
        />
      )}
      <div
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: "50%",
          background: `conic-gradient(#2aabee 0deg, #007aff ${deg}deg, rgba(130,140,160,0.18) ${deg}deg)`,
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: thickness,
          borderRadius: "50%",
          background: "var(--glass-3)",
          backdropFilter: "blur(14px) saturate(180%)",
          WebkitBackdropFilter: "blur(14px) saturate(180%)",
          boxShadow: "inset 0 2px 3px rgba(255,255,255,0.6), 0 6px 18px rgba(19,28,54,0.12)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 2,
        }}
      >
        {center}
      </div>
    </div>
  );
}

export function MiniProgressRing({ fraction, size = 74 }: { fraction: number; size?: number }) {
  const deg = Math.max(0, Math.min(1, fraction)) * 360;
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: "50%",
          background: `conic-gradient(#2aabee 0deg, #007aff ${deg}deg, rgba(120,130,150,0.18) ${deg}deg)`,
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 8,
          borderRadius: "50%",
          background: "var(--glass-3)",
          backdropFilter: "blur(6px)",
          WebkitBackdropFilter: "blur(6px)",
          display: "grid",
          placeItems: "center",
          boxShadow: "inset 0 1px 2px rgba(255,255,255,0.6)",
        }}
      >
        <span style={{ fontSize: 17, fontWeight: 800, letterSpacing: "-0.03em" }}>
          {Math.round(fraction * 100)}%
        </span>
      </div>
    </div>
  );
}
