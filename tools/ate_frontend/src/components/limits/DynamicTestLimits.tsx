"use client";

import { useRouter } from "next/navigation";
import { agentHref } from "@/lib/agents";
import {
  DTL_CARD_MONTHS,
  DTL_CARD_ROWS,
  formatDtlCell,
} from "@/lib/dtlCardPreview";
import type { TestLimitsOut } from "@/types/api";

/**
 * Dashboard DTL card — three-month AI recommended limits matrix.
 * Click anywhere on the card to open the DTL agent.
 */
export function DynamicTestLimits({ data }: { data: TestLimitsOut | null }) {
  const router = useRouter();
  const badge = data?.adjustments_today;

  return (
    <button
      type="button"
      onClick={() => router.push(agentHref("dtl"))}
      className="vl-card flex h-full min-h-0 flex-col overflow-hidden p-4 text-left transition-[border-color,box-shadow] duration-200 hover:border-[rgba(107,193,242,0.45)]"
    >
      <div className="flex shrink-0 items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#f2f7fc]">
            AI Recommended Dynamic Test Limits
          </div>
          <div className="mt-0.5 text-[10px] leading-snug text-[var(--muted)]">
            AI-recommended Dynamic Test Limits across January, February, and March 2026.
          </div>
          <div className="mt-1 text-[10px] font-semibold text-[var(--cyan)]">
            Open DTL agent →
          </div>
        </div>
        <span className="shrink-0 rounded bg-[var(--cyan-dim)] px-[7px] py-0.5 text-[10px] font-semibold text-[var(--cyan)]">
          {badge != null ? `${badge} today` : "9 params"}
        </span>
      </div>

      <div className="mt-2.5 min-h-0 flex-1 overflow-auto">
        <table className="w-full border-collapse text-left text-[10px]">
          <thead>
            <tr className="border-b border-[var(--line)] text-[9px] font-semibold uppercase tracking-wider text-[var(--muted)]">
              <th className="py-1.5 pr-2 font-semibold">Parameter</th>
              {DTL_CARD_MONTHS.map((m) => (
                <th key={m.key} className="py-1.5 pr-2 font-semibold">
                  {m.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {DTL_CARD_ROWS.map((row) => (
              <tr
                key={row.parameter}
                className={
                  row.changesAcrossMonths
                    ? "bg-[rgba(107,193,242,0.08)]"
                    : undefined
                }
              >
                <td
                  className={`py-1 pr-2 font-mono text-[10px] ${
                    row.changesAcrossMonths
                      ? "font-semibold text-[var(--cyan)]"
                      : "text-[var(--cyan)]"
                  }`}
                >
                  {row.parameter}
                </td>
                {DTL_CARD_MONTHS.map((m) => (
                  <td
                    key={m.key}
                    className={`py-1 pr-2 font-mono ${
                      row.changesAcrossMonths
                        ? "font-semibold text-[var(--cyan)]"
                        : "text-[var(--text)]"
                    }`}
                  >
                    {formatDtlCell(row.months[m.key])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </button>
  );
}
