export const AGENT_IDS = ["shmoo", "test-time", "retest", "dtl"] as const;
export type AgentId = (typeof AGENT_IDS)[number];

export type AgentDef = {
  id: AgentId;
  title: string;
  description: string;
  url: string;
};

export const AGENTS: Record<AgentId, AgentDef> = {
  shmoo: {
    id: "shmoo",
    title: "SHMOO ML-Based Optimization",
    description: "LightGBM Shmoo classification and RANSAC boundary reports",
    url:
      process.env.NEXT_PUBLIC_KPI_M_BIST_SHMOO_URL?.trim() ||
      "http://127.0.0.1:5000",
  },
  "test-time": {
    id: "test-time",
    title: "Test Time Optimization",
    description: "LSTM pattern selection for test time and vector memory",
    url:
      process.env.NEXT_PUBLIC_KPI_TEST_TIME_URL?.trim() ||
      "http://127.0.0.1:5173",
  },
  retest: {
    id: "retest",
    title: "ATE Retest AI Agent",
    description: "XGBoost retest-benefit prediction",
    url:
      process.env.NEXT_PUBLIC_KPI_RETEST_URL?.trim() ||
      "http://127.0.0.1:5175",
  },
  dtl: {
    id: "dtl",
    title: "Dynamic Test Limits",
    description: "GRU / RLS three-month limit recommendations",
    url:
      process.env.NEXT_PUBLIC_KPI_DTL_URL?.trim() ||
      "http://127.0.0.1:5174/three-month",
  },
};

export const KPI_TO_AGENT: Record<string, AgentId> = {
  m_bist_shmoo: "shmoo",
  test_time_reduction: "test-time",
  retest_reduction: "retest",
};

export function isAgentId(value: string | undefined | null): value is AgentId {
  return (
    value === "shmoo" ||
    value === "test-time" ||
    value === "retest" ||
    value === "dtl"
  );
}

export function agentHref(id: AgentId): string {
  return `/agents/${id}`;
}
