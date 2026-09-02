"use client";

/**
 * Offline desktop build has no sign-out / role switch.
 */
export function SessionControl() {
  return (
    <div className="flex items-center gap-2 border-l border-[var(--line)] pl-3">
      <div className="text-right leading-tight">
        <div className="font-mono text-[11px] font-semibold text-[var(--text)]">
          viewer
        </div>
        <div className="text-[9px] uppercase tracking-[0.08em] text-[var(--muted-2)]">
          Local offline
        </div>
      </div>
    </div>
  );
}
