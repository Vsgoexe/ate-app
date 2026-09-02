/**
 * Local mock payloads used when ate_backend.py is unreachable.
 * Keeps the dashboard usable in offline / desktop / next-dev without Render.
 */
import type { DashboardSummary, DieOut, KpiCard, TestLimitOut } from "@/types/api";
import type { EventFilterOptions, TestEvent } from "@/types/events";
import type { Kpi } from "@/types/kpi";

function iso(hoursAgo = 0): string {
  return new Date(Date.now() - hoursAgo * 3600_000).toISOString();
}

function sparkHistory(values: number[]): Kpi["history"] {
  return values.map((value, index) => ({
    timestamp: iso(values.length - index),
    value,
    index,
  }));
}

function kpi(
  id: string,
  name: string,
  value: number,
  unit: string,
  baseline: number,
  target: number,
  previous: number,
  spark: number[],
  description: string,
): Kpi {
  return {
    id,
    name,
    value,
    unit,
    baseline,
    target,
    previous_value: previous,
    improvement: Number((value - previous).toFixed(2)),
    trend: value >= previous ? "up" : "down",
    status: "on_track",
    timestamp: iso(),
    history: sparkHistory(spark),
    description,
  };
}

const KPIS: Kpi[] = [
  kpi("retest_reduction", "Retest Reduction", 22.4, "%", 0, 25, 19.1, [8, 12, 15, 18, 20, 21.5, 22.4], "XGBoost retest-benefit recommendations"),
  kpi("m_bist_shmoo", "SHMOO ML-Based Optimization", 96.4, "%", 90, 98, 94.8, [90, 91.5, 93, 94.2, 95.1, 95.8, 96.4], "LightGBM Shmoo classification + RANSAC boundary"),
  kpi("test_time_reduction", "Test Time Optimization", 18.5, "%", 100, 80, 16.2, [100, 94, 90, 86, 84, 82.5, 81.5], "LSTM pattern selection test cycle speedup"),
  kpi("false_failure_reduction", "False Failure Reduction", 42.1, "%", 0, 50, 38.0, [10, 18, 25, 30, 36, 40, 42.1], "Dynamic guardband Cpk tuning"),
  kpi("yield_improvement", "Yield Improvement", 3.8, "%", 91.2, 95.0, 3.2, [91.2, 92.0, 92.5, 93.1, 93.8, 94.2, 95.0], "AI adaptive limit optimization yield gain"),
  kpi("escape_prevention", "Escape Prevention", 99.1, "%", 97.0, 99.5, 98.6, [97.0, 97.4, 97.9, 98.3, 98.6, 98.9, 99.1], "Marginal-die escape screening"),
  kpi("pattern_count_reduction", "Pattern Count Reduction", 31.0, "%", 0, 40, 27.5, [10, 16, 21, 24, 27, 29, 31], "Vector-memory pattern compression"),
  kpi("shmoo_yield_analysis", "Shmoo Yield Analysis", 96.4, "%", 90, 98, 95.1, [90, 92, 93, 94, 95, 95.8, 96.4], ""),
  kpi("shmoo_debugging", "Shmoo Debugging", 3, "", 0, 0, 4, [6, 5, 5, 4, 4, 3, 3], ""),
  kpi("shmoo_binning", "Shmoo Binning", 8, "", 6, 10, 7, [6, 6, 7, 7, 8, 8, 8], ""),
  kpi("shmoo_characterization", "Shmoo Characterization", 92.5, "%", 88, 95, 91.0, [88, 89, 90, 91, 91.5, 92, 92.5], ""),
  kpi("vector_memory_optimization", "Vector Memory", 24.0, "%", 0, 30, 21.2, [12, 16, 18, 20, 21, 23, 24], ""),
];

const LIMITS: TestLimitOut[] = [
  {
    limit_id: "LIM-VDD-01",
    parameter: "VDD_MIN_V",
    test_name: "Low-VDD Functional Speedpath",
    name: "VDD Core Minimum Voltage",
    site_id: "SITE-01",
    tester_id: "ADV-93K-01",
    lot_id: "LOT-2026-A1",
    previous_limit: 0.75,
    current_limit: 0.72,
    delta: -0.03,
    change_percentage: -4.0,
    change_pct: -4.0,
    change_label: "-0.03 V (Tightened)",
    direction: "tightened",
    cpk: 1.67,
    target_cpk: 1.5,
    confidence: 0.98,
    reason: "Process capability Cpk = 1.67 exceeds target 1.50. Tightened limit to prevent marginal timing escapes.",
    status: "RECOMMENDED",
    created_at: iso(),
    updated_at: iso(),
  },
  {
    limit_id: "LIM-FREQ-02",
    parameter: "FMAX_GHZ",
    test_name: "MBIST Fmax Characterization",
    name: "Maximum Memory Frequency",
    site_id: "SITE-02",
    tester_id: "ADV-93K-02",
    lot_id: "LOT-2026-A1",
    previous_limit: 2.1,
    current_limit: 2.25,
    delta: 0.15,
    change_percentage: 7.1,
    change_pct: 7.1,
    change_label: "+0.15 GHz (Widened)",
    direction: "widened",
    cpk: 1.82,
    target_cpk: 1.5,
    confidence: 0.95,
    reason: "RANSAC Shmoo boundary supports higher frequency binning with 99.2% confidence.",
    status: "ACTIVE",
    created_at: iso(),
    updated_at: iso(),
  },
];

const FLOOR_EVENTS: TestEvent[] = [
  {
    event_id: "EVT-1001",
    timestamp: iso(1),
    severity: "INFO",
    event_type: "dynamic_limit_updated",
    source: "local-ate",
    tester_id: "ADV-93K-01",
    site_id: "SITE-01",
    lot_id: "LOT-2026-A1",
    wafer_id: "WFR-9082",
    die_id: null,
    message: "Dynamic limit LIM-VDD-01 recommended tightening based on 3-month Cpk trend.",
    metadata: {},
    acknowledged: false,
    sequence_number: 1,
  },
  {
    event_id: "EVT-1002",
    timestamp: iso(0.5),
    severity: "PASS",
    event_type: "optimization_completed",
    source: "local-ate",
    tester_id: "ADV-93K-02",
    site_id: "SITE-01",
    lot_id: "LOT-2026-A1",
    wafer_id: "WFR-9082",
    die_id: null,
    message: "Shmoo ML classifier verified Normal Pass region for Wafer WFR-9082.",
    metadata: {},
    acknowledged: false,
    sequence_number: 2,
  },
  {
    event_id: "EVT-1003",
    timestamp: iso(0.2),
    severity: "WARN",
    event_type: "escape_risk_detected",
    source: "local-ate",
    tester_id: "ADV-93K-01",
    site_id: "SITE-01",
    lot_id: "LOT-2026-A1",
    wafer_id: "WFR-9082",
    die_id: "DIE-07-08",
    message: "Marginal timing die flagged on SITE-01 — escape screen applied.",
    metadata: {},
    acknowledged: false,
    sequence_number: 3,
  },
];

function generateDies(waferId: string): DieOut[] {
  const grid: DieOut[] = [];
  const size = 15;
  const center = size / 2;
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      const dist = Math.hypot(row - center, col - center);
      if (dist > center) continue;
      const rand = Math.sin((row + 1) * 12.9898 + (col + 1) * 78.233) * 43758.5453;
      const u = rand - Math.floor(rand);
      const result: DieOut["bin"] = u > 0.15 ? "pass" : u > 0.08 ? "retest" : u > 0.03 ? "fail" : "reclass";
      grid.push({
        die_id: `DIE-${String(row).padStart(2, "0")}-${String(col).padStart(2, "0")}`,
        wafer_id: waferId,
        x: col,
        y: row,
        row,
        column: col,
        result,
        bin: result,
        fail_code: result === "fail" ? "FREQ_MARGIN" : null,
        test_time_ms: 45 + Math.floor(u * 75),
        confidence: 0.85 + u * 0.14,
        timestamp: iso(),
      });
    }
  }
  return grid;
}

const DIES = generateDies("WFR-9082");

const SUMMARY: DashboardSummary = {
  header: {
    lots_in_test: 4,
    test_time_saved_hours: 142.5,
    overall_yield_pct: 94.2,
  },
  active_wafer: {
    wafer_id: "WFR-9082",
    lot_id: "LOT-2026-A1",
    status: "COMPLETED",
    yield_pct: 94.2,
    total_dies: 180,
    tested_dies: 180,
    caption: "Lot 2026-A1 - Wafer 12 (300mm Silicon)",
    bin_counts: { pass: 169, retest: 6, fail: 4, reclass: 1 },
    pass_count: 169,
    fail_count: 4,
    retest_count: 6,
    reclass_count: 1,
    updated_at: iso(),
  },
  kpis: KPIS as unknown as KpiCard[],
  maintenance: {
    flagged_count: 1,
    model_available: true,
    assets: [
      {
        asset_id: "AST-ADV-93K-01",
        name: "Advantest V93000 Tester #1 Pin Electronics",
        health_pct: 92.5,
        status: "HEALTHY",
        rul_days: 145,
        tester_id: "ADV-93K-01",
        component: "PE_CARD_3",
        failure_probability: 0.04,
        confidence: 0.96,
        severity: "LOW",
        recommended_action: "Routine calibration at next planned maintenance cycle.",
        model_available: true,
        updated_at: iso(),
      },
    ],
  },
  test_limits: { adjustments_today: LIMITS.length, items: LIMITS },
  recent_events: [
    {
      event_id: "EVT-1001",
      event_type: "LIMIT_RECOMMENDATION",
      timestamp: iso(1),
      tag: "info",
      text: "Dynamic limit LIM-VDD-01 recommended tightening based on 3-month Cpk trend.",
      lot_id: "LOT-2026-A1",
      wafer_id: "WFR-9082",
      tester_id: "ADV-93K-01",
    },
    {
      event_id: "EVT-1002",
      event_type: "SHMOO_OPTIMIZATION",
      timestamp: iso(0.5),
      tag: "pass",
      text: "Shmoo ML classifier verified Normal Pass region for Wafer WFR-9082.",
      lot_id: "LOT-2026-A1",
      wafer_id: "WFR-9082",
      tester_id: "ADV-93K-02",
    },
  ],
  connection_hint: "Local fallback — ATE backend was unreachable, serving built-in summary data",
};

const FILTERS: EventFilterOptions = {
  testers: ["ADV-93K-01", "ADV-93K-02"],
  sites: ["SITE-01", "SITE-02"],
  lots: ["LOT-2026-A1"],
  wafers: ["WFR-9082"],
  severities: ["INFO", "PASS", "WARN", "ERROR", "CRITICAL"],
  event_types: ["dynamic_limit_updated", "optimization_completed", "escape_risk_detected"],
};

export function allowOfflineFallback(): boolean {
  return true;
}

/** Map `/dashboard/summary` or `dashboard/summary` to a mock payload. */
export function offlineFallback(path: string, method = "GET"): unknown | null {
  const clean = path.replace(/^\/api/, "").split("?")[0].replace(/\/+$/, "") || "/";
  const normalized = clean.startsWith("/") ? clean : `/${clean}`;
  const m = method.toUpperCase();

  if (normalized === "/health") return { status: "ok", database: true, redis: true };
  if (normalized === "/ready") {
    return { status: "ready", database: true, redis: true, websocket_clients: 0 };
  }
  if (normalized === "/auth/login" && m === "POST") {
    return {
      access_token: "local-verilumen-jwt-token",
      token_type: "bearer",
      role: "VIEWER",
      username: "viewer",
      user_id: "USR-LOCAL-01",
      expires_in_minutes: 1440,
    };
  }
  if (normalized === "/auth/me") {
    return {
      user_id: "USR-LOCAL-01",
      username: "viewer",
      full_name: "ATE Test Engineer",
      role: "VIEWER",
      permissions: ["*"],
    };
  }
  if (normalized === "/dashboard/summary") return SUMMARY;
  if (normalized === "/kpis") return { kpis: KPIS };
  if (normalized.startsWith("/kpis/") && normalized.endsWith("/history")) {
    const id = normalized.split("/")[2];
    const found = KPIS.find((k) => k.id === id) ?? KPIS[0];
    return { id: found.id, name: found.name, unit: found.unit, history: found.history };
  }
  if (normalized.startsWith("/kpis/") && normalized !== "/kpis") {
    const id = normalized.slice("/kpis/".length);
    const found = KPIS.find((k) => k.id === id) ?? KPIS[0];
    return { ...found, lots: 4, wafers: 12, testers: 2, sites: 2, recent_events: SUMMARY.recent_events };
  }
  if (normalized.startsWith("/wafers/") && normalized.endsWith("/dies")) {
    return DIES;
  }
  if (normalized.startsWith("/wafers/")) return SUMMARY.active_wafer;
  if (normalized === "/events/filters") return FILTERS;
  if (normalized === "/events") {
    return { total: FLOOR_EVENTS.length, unacknowledged: FLOOR_EVENTS.length, items: FLOOR_EVENTS };
  }
  if (normalized.startsWith("/events/") && normalized.endsWith("/acknowledge") && m === "POST") {
    const id = normalized.split("/")[2];
    const found = FLOOR_EVENTS.find((e) => e.event_id === id) ?? FLOOR_EVENTS[0];
    return { ...found, acknowledged: true };
  }
  if (normalized.startsWith("/events/") && normalized !== "/events") {
    const id = normalized.slice("/events/".length);
    return FLOOR_EVENTS.find((e) => e.event_id === id) ?? FLOOR_EVENTS[0];
  }
  if (normalized === "/maintenance") return SUMMARY.maintenance;
  if (normalized === "/maintenance/predict" && m === "POST") {
    return { predictions: SUMMARY.maintenance.assets };
  }
  if (normalized.startsWith("/maintenance/")) {
    const testerId = decodeURIComponent(normalized.slice("/maintenance/".length));
    const asset = SUMMARY.maintenance.assets[0];
    return {
      tester_id: testerId,
      name: asset.name,
      status: asset.status,
      site_id: "SITE-01",
      overall_severity: "healthy",
      model_available: true,
      components: SUMMARY.maintenance.assets,
      history: [],
      health_series: [],
    };
  }
  if (normalized === "/test-limits") return SUMMARY.test_limits;
  if (normalized.startsWith("/test-limits/")) {
    const limitId = normalized.split("/")[2];
    return LIMITS.find((l) => l.limit_id === limitId) ?? LIMITS[0];
  }
  if (normalized === "/shmoo/latest") return { status: "empty" };
  if ((normalized === "/uploads" || normalized === "/shmoo/upload") && m === "POST") {
    return {
      status: "ok",
      kind: "auto",
      filename: "offline.csv",
      wafer_id: "WFR-9082",
      dies: 180,
      yield_pct: 94.2,
      session_id: "SHMOO-LOCAL-01",
    };
  }
  return null;
}
