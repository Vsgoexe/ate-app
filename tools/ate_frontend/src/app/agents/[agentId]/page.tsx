"use client";

import { useParams } from "next/navigation";
import { AuthGate } from "@/components/auth/AuthGate";
import { AgentWorkspace } from "@/components/agents/AgentWorkspace";

export default function AgentPage() {
  const params = useParams<{ agentId: string }>();
  return (
    <AuthGate>
      <AgentWorkspace agentId={params?.agentId} />
    </AuthGate>
  );
}
