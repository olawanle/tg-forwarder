import { useId } from "react";

/** The redesign's signature visual: three expanding "ping" rings around a
 * progress arc, standing in for the literal broadcast — one send fanning
 * out to many groups at once — instead of a generic circular loader. */
export function PulseRing({
  fraction,
  size = 168,
  thickness = 10,
  active = true,
  children,
}: {
  fraction: number;
  size?: number;
  thickness?: number;
  active?: boolean;
  children?: React.ReactNode;
}) {
  const gradId = useId();
  const core = Math.round(size * 0.78);
  const r = core / 2 - thickness;
  const circumference = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(1, fraction));
  const dashoffset = circumference * (1 - clamped);

  return (
    <div className="pulse-wrap" style={{ width: size, height: size }}>
      {active && (
        <>
          <div className="ping" />
          <div className="ping" />
          <div className="ping" />
        </>
      )}
      <div className="ring-core" style={{ width: core, height: core }}>
        <svg viewBox={`0 0 ${core} ${core}`} width={core} height={core}>
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="var(--accent)" />
              <stop offset="100%" stopColor="#ff9a3c" />
            </linearGradient>
          </defs>
          <circle className="ring-track" cx={core / 2} cy={core / 2} r={r} fill="none" strokeWidth={thickness} />
          <circle
            className="ring-fill"
            cx={core / 2}
            cy={core / 2}
            r={r}
            fill="none"
            strokeWidth={thickness}
            stroke={`url(#${gradId})`}
            strokeDasharray={circumference}
            strokeDashoffset={dashoffset}
          />
        </svg>
        <div className="ring-label">{children}</div>
      </div>
    </div>
  );
}
