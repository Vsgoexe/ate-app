import { DTL_AGENT_URL, RETEST_URL, SHMOO_VL_BASE, TEST_TIME_OPT_URL } from "./kpiExternalPages";

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
    url: SHMOO_VL_BASE,
  },
  "test-time": {
    id: "test-time",
    title: "Test Time Optimization",
    description: "LSTM pattern selection for test time and vector memory",
    url: TEST_TIME_OPT_URL,
  },
  retest: {
    id: "retest",
    title: "ATE Retest AI Agent",
    description: "XGBoost retest-benefit prediction",
    url: RETEST_URL,
  },
  dtl: {
    id: "dtl",
    title: "Dynamic Test Limits",
    description: "GRU / RLS three-month limit recommendations",
    url: DTL_AGENT_URL,
  },
};

export const KPI_TO_AGENT: Record<string, AgentId> = {
  m_bist_shmoo: "shmoo",
  test_time_reduction: "test-time",
  retest_reduction: "retest",
  dtl: "dtl",
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
