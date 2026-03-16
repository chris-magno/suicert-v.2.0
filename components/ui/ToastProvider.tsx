"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

type ToastVariant = "success" | "error" | "info" | "warning";

interface ToastItem {
  id: number;
  title: string;
  description?: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  toast: (input: { title: string; description?: string; variant?: ToastVariant; durationMs?: number }) => void;
}

const ToastContext = createContext<ToastContextValue>({
  toast: () => {},
});

function variantStyles(variant: ToastVariant): { bg: string; border: string; color: string; dot: string } {
  if (variant === "success") {
    return { bg: "var(--mint-subtle)", border: "#a7f3d0", color: "var(--mint)", dot: "var(--mint)" };
  }
  if (variant === "error") {
    return { bg: "var(--coral-subtle)", border: "#fecdd3", color: "var(--coral)", dot: "var(--coral)" };
  }
  if (variant === "warning") {
    return { bg: "var(--gold-subtle)", border: "#fde68a", color: "var(--gold)", dot: "var(--gold)" };
  }
  return { bg: "var(--accent-subtle)", border: "#bae6fd", color: "var(--accent-dark)", dot: "var(--accent-dark)" };
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const toast = useCallback((input: { title: string; description?: string; variant?: ToastVariant; durationMs?: number }) => {
    const id = Date.now() + Math.floor(Math.random() * 10_000);
    const item: ToastItem = {
      id,
      title: input.title,
      description: input.description,
      variant: input.variant ?? "info",
    };

    setItems((prev) => [...prev, item]);

    const duration = input.durationMs ?? 2800;
    window.setTimeout(() => {
      setItems((prev) => prev.filter((x) => x.id !== id));
    }, Math.max(1200, duration));
  }, []);

  const value = useMemo<ToastContextValue>(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div style={{
        position: "fixed",
        bottom: 16,
        right: 16,
        zIndex: 1000,
        display: "flex",
        flexDirection: "column",
        gap: 10,
        pointerEvents: "none",
      }}>
        {items.map((item) => {
          const s = variantStyles(item.variant);
          return (
            <div
              key={item.id}
              style={{
                minWidth: 260,
                maxWidth: 360,
                background: s.bg,
                border: `1px solid ${s.border}`,
                color: s.color,
                borderRadius: "var(--radius-sm)",
                boxShadow: "var(--shadow-md)",
                padding: "10px 12px",
                animation: "fadeUp 0.2s ease-out",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: s.dot, flexShrink: 0 }} />
                <p style={{ fontSize: 12, fontWeight: 800, lineHeight: 1.35 }}>{item.title}</p>
              </div>
              {item.description && (
                <p style={{ marginTop: 6, fontSize: 12, lineHeight: 1.45, opacity: 0.95 }}>{item.description}</p>
              )}
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
