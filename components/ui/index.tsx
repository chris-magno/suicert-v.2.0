"use client";
import { ReactNode, ButtonHTMLAttributes } from "react";
import { Loader2 } from "lucide-react";

// ── Button ──────────────────────────────────────────────────────────────────
interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger" | "sui";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  icon?: ReactNode;
  children: ReactNode;
}

export function Button({
  variant = "primary", size = "md", loading, icon, children, disabled, style, ...props
}: ButtonProps) {
  const styles: Record<string, React.CSSProperties> = {
    primary: { background: "var(--text-primary)", color: "white", border: "none" },
    secondary: { background: "var(--bg-card)", color: "var(--text-primary)", border: "1.5px solid var(--border)" },
    ghost: { background: "transparent", color: "var(--text-secondary)", border: "none" },
    danger: { background: "var(--coral-subtle)", color: "var(--coral)", border: "1.5px solid #fecdd3" },
    sui: { background: "linear-gradient(135deg, #4DA2FF, #097EED)", color: "white", border: "none" },
  };
  const sizes: Record<string, React.CSSProperties> = {
    sm: { padding: "6px 12px", fontSize: 12, borderRadius: "var(--radius-sm)", gap: 4 },
    md: { padding: "9px 16px", fontSize: 14, borderRadius: "var(--radius-sm)", gap: 6 },
    lg: { padding: "12px 24px", fontSize: 15, borderRadius: "var(--radius)", gap: 8 },
  };
  return (
    <button
      disabled={disabled || loading}
      style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        fontFamily: "var(--font-display)", fontWeight: 600, cursor: "pointer",
        transition: "opacity 0.15s, transform 0.1s",
        opacity: disabled || loading ? 0.5 : 1,
        ...styles[variant], ...sizes[size], ...style,
      }}
      onMouseEnter={(e) => { if (!disabled && !loading) (e.currentTarget as HTMLElement).style.opacity = "0.85"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = "1"; }}
      {...props}
    >
      {loading ? <Loader2 size={14} style={{ animation: "spin 0.8s linear infinite" }} /> : icon}
      {children}
    </button>
  );
}

// ── Card ─────────────────────────────────────────────────────────────────────
export function Card({ children, style, hover = false, className = "" }: {
  children: ReactNode; style?: React.CSSProperties; hover?: boolean; className?: string;
}) {
  return (
    <div
      className={`${hover ? "card-hover" : ""} ${className}`}
      style={{
        background: "var(--bg-card)", border: "1.5px solid var(--border)",
        borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-sm)", ...style,
      }}
    >{children}</div>
  );
}

// ── Badge/Tag ─────────────────────────────────────────────────────────────────
type BadgeVariant = "default" | "success" | "warning" | "danger" | "info" | "sui";
export function Badge({ children, variant = "default", dot = false }: {
  children: ReactNode; variant?: BadgeVariant; dot?: boolean;
}) {
  const colors: Record<BadgeVariant, { bg: string; color: string; border: string }> = {
    default: { bg: "var(--bg-subtle)", color: "var(--text-secondary)", border: "var(--border)" },
    success: { bg: "var(--mint-subtle)", color: "var(--mint)", border: "#a7f3d0" },
    warning: { bg: "var(--gold-subtle)", color: "var(--gold)", border: "#fde68a" },
    danger: { bg: "var(--coral-subtle)", color: "var(--coral)", border: "#fecdd3" },
    info: { bg: "var(--accent-subtle)", color: "var(--accent-dark)", border: "#bae6fd" },
    sui: { bg: "#eff8ff", color: "#4DA2FF", border: "#bfdbfe" },
  };
  const c = colors[variant];
  return (
    <span className="tag" style={{ background: c.bg, color: c.color, border: `1px solid ${c.border}` }}>
      {dot && <span style={{ width: 6, height: 6, borderRadius: "50%", background: "currentColor", flexShrink: 0 }} />}
      {children}
    </span>
  );
}

// ── Progress Bar ──────────────────────────────────────────────────────────────
export function ProgressBar({ percent, showLabel = true, size = "md", inactive = false }: {
  percent: number; showLabel?: boolean; size?: "sm" | "md" | "lg"; inactive?: boolean;
}) {
  const heights = { sm: 4, md: 6, lg: 10 };
  const pct = Math.min(100, Math.max(0, percent));
  const done = pct >= 100;

  return (
    <div className={inactive ? "subscription-inactive" : ""}>
      {showLabel && (
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 12, color: "var(--text-muted)" }}>
          <span style={{ fontFamily: "var(--font-mono)" }}>Attendance progress</span>
          <span style={{ fontWeight: 600, color: done ? "var(--mint)" : "var(--accent)", fontFamily: "var(--font-mono)" }}>{pct}%</span>
        </div>
      )}
      <div className="progress-track" style={{ height: heights[size] }}>
        <div
          className="progress-fill"
          style={{
            width: `${pct}%`,
            background: done
              ? "linear-gradient(90deg, var(--mint), #34d399)"
              : "linear-gradient(90deg, var(--accent), var(--sui-teal))",
          }}
        />
      </div>
    </div>
  );
}

// ── Stat Card ─────────────────────────────────────────────────────────────────
export function StatCard({ label, value, icon, trend, color = "var(--accent)" }: {
  label: string; value: string | number; icon: ReactNode; trend?: string; color?: string;
}) {
  return (
    <Card style={{ padding: "20px 24px" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        <div>
          <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 8, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</p>
          <p style={{ fontSize: 28, fontWeight: 800, fontFamily: "var(--font-display)", lineHeight: 1 }}>{value}</p>
          {trend && <p style={{ fontSize: 12, color: "var(--mint)", marginTop: 6, fontWeight: 500 }}>{trend}</p>}
        </div>
        <div style={{ width: 40, height: 40, borderRadius: "var(--radius-sm)", background: `${color}18`, display: "flex", alignItems: "center", justifyContent: "center", color }}>
          {icon}
        </div>
      </div>
    </Card>
  );
}

// ── Input ─────────────────────────────────────────────────────────────────────
export function Input({ label, error, hint, ...props }: {
  label?: string; error?: string; hint?: string;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {label && <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", fontFamily: "var(--font-display)" }}>{label}</label>}
      <input className="input" style={{ borderColor: error ? "var(--coral)" : undefined }} {...props} />
      {hint && !error && <p style={{ fontSize: 12, color: "var(--text-muted)" }}>{hint}</p>}
      {error && <p style={{ fontSize: 12, color: "var(--coral)", fontWeight: 500 }}>{error}</p>}
    </div>
  );
}

// ── Textarea ──────────────────────────────────────────────────────────────────
export function Textarea({ label, error, hint, rows = 4, ...props }: {
  label?: string; error?: string; hint?: string; rows?: number;
} & React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {label && <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", fontFamily: "var(--font-display)" }}>{label}</label>}
      <textarea
        rows={rows}
        className="input"
        style={{ resize: "vertical", borderColor: error ? "var(--coral)" : undefined }}
        {...props}
      />
      {hint && !error && <p style={{ fontSize: 12, color: "var(--text-muted)" }}>{hint}</p>}
      {error && <p style={{ fontSize: 12, color: "var(--coral)", fontWeight: 500 }}>{error}</p>}
    </div>
  );
}

// ── Empty State ───────────────────────────────────────────────────────────────
export function EmptyState({ icon, title, description, action }: {
  icon: ReactNode; title: string; description: string; action?: ReactNode;
}) {
  return (
    <div style={{ textAlign: "center", padding: "64px 24px", display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
      <div style={{ width: 56, height: 56, borderRadius: "var(--radius)", background: "var(--bg-subtle)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)" }}>
        {icon}
      </div>
      <h3 style={{ fontFamily: "var(--font-display)", fontSize: 17, fontWeight: 700 }}>{title}</h3>
      <p style={{ color: "var(--text-muted)", fontSize: 14, maxWidth: 320 }}>{description}</p>
      {action}
    </div>
  );
}

// ── Divider ───────────────────────────────────────────────────────────────────
export function Divider({ label }: { label?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "8px 0" }}>
      <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
      {label && <span style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 500, whiteSpace: "nowrap" }}>{label}</span>}
      <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
    </div>
  );
}
