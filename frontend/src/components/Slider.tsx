export function Slider({
  label,
  value,
  min,
  max,
  step,
  suffix = "",
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix?: string;
  onChange: (v: number) => void;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 13.5, fontWeight: 700 }}>{label}</span>
        <span
          style={{
            fontSize: 13,
            fontWeight: 800,
            color: "var(--accent)",
            background: "var(--accent-soft)",
            padding: "3px 10px",
            borderRadius: 999,
          }}
        >
          {value}
          {suffix}
        </span>
      </div>
      <div style={{ position: "relative", height: 22, display: "flex", alignItems: "center" }}>
        <div
          style={{
            height: 7,
            width: "100%",
            borderRadius: 999,
            background: "var(--field)",
            boxShadow: "var(--field-in)",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: 0,
            height: 7,
            width: `${pct}%`,
            borderRadius: 999,
            background: "linear-gradient(90deg, #4aa8ff, #007aff)",
            pointerEvents: "none",
          }}
        />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            opacity: 0,
            cursor: "pointer",
            margin: 0,
          }}
        />
        <div
          style={{
            position: "absolute",
            left: `${pct}%`,
            width: 22,
            height: 22,
            borderRadius: "50%",
            background: "#fff",
            boxShadow: "0 2px 7px rgba(0,0,0,0.28)",
            transform: "translateX(-50%)",
            pointerEvents: "none",
          }}
        />
      </div>
    </div>
  );
}
