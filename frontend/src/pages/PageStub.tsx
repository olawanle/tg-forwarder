import { GlassCard } from "../components/GlassCard";

export function PageStub({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="page">
      <div>
        <h1 className="page-title">{title}</h1>
        <div className="page-subtitle">{subtitle}</div>
      </div>
      <GlassCard>
        <div style={{ color: "var(--text3)", fontSize: 13.5, textAlign: "center", padding: "24px 0" }}>
          Coming in Phase 3.
        </div>
      </GlassCard>
    </div>
  );
}
