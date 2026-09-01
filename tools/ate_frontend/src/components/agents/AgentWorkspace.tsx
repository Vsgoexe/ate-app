"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { VerilumenBrand } from "@/components/branding/VerilumenBrand";
import { Button } from "@/components/ui/button";
import { AGENTS, isAgentId, type AgentId } from "@/lib/agents";

type LoadState = "booting" | "ready" | "error";

export function AgentWorkspace({ agentId }: { agentId: string | undefined }) {
  const router = useRouter();
  const valid = isAgentId(agentId);
  const agent = valid ? AGENTS[agentId as AgentId] : null;
  const [loadState, setLoadState] = useState<LoadState>("booting");
  const [reloadKey, setReloadKey] = useState(0);

  const src = useMemo(() => {
    if (!agent) return "";
    const join = agent.url.includes("?") ? "&" : "?";
    // _v busts iframe cache so demo=1 always hits a fresh agent bundle after hotfixes.
    return `${agent.url}${join}embed=1&demo=1&_v=${reloadKey}`;
  }, [agent, reloadKey]);

  useEffect(() => {
    setLoadState("booting");
  }, [src, reloadKey]);

  useEffect(() => {
    if (!src || loadState === "ready") return;
    const timer = window.setTimeout(() => {
      setLoadState((prev) => (prev === "ready" ? prev : "error"));
    }, 25_000);
    return () => window.clearTimeout(timer);
  }, [src, loadState, reloadKey]);

  const onIframeLoad = useCallback(() => {
    setLoadState("ready");
  }, []);

  if (!agent) {
    return (
      <div className="mx-auto flex min-h-screen max-w-[720px] flex-col justify-center px-7">
        <p className="text-[14px] text-[var(--text)]">Unknown agent.</p>
        <Button className="mt-4 w-fit" onClick={() => router.push("/")}>
          Back to dashboard
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-screen min-h-0 flex-col bg-[var(--bg)]">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] bg-[var(--panel)] px-5 py-2.5">
        <div className="flex min-w-0 items-center gap-4">
          <Button variant="ghost" onClick={() => router.push("/")}>
            ← Dashboard
          </Button>
          <div className="hidden sm:block">
            <VerilumenBrand size="header" />
          </div>
          <div className="min-w-0 border-l border-[var(--line)] pl-4">
            <div className="truncate text-[13px] font-semibold text-[var(--text-bright)]">
              {agent.title}
            </div>
            <div className="truncate text-[11px] text-[var(--muted)]">
              {agent.description}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span
            className={`rounded px-2 py-0.5 font-mono text-[10px] font-semibold ${
              loadState === "ready"
                ? "bg-[var(--green-dim)] text-[var(--green)]"
                : loadState === "error"
                  ? "bg-[var(--amber-dim)] text-[var(--amber)]"
                  : "bg-[var(--cyan-dim)] text-[var(--cyan)]"
            }`}
          >
            {loadState === "ready"
              ? "Local ready"
              : loadState === "error"
                ? "Waiting for agent"
                : "Starting…"}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setReloadKey((n) => n + 1)}
          >
            Reload
          </Button>
        </div>
      </header>

      <div className="relative min-h-0 flex-1">
        {loadState !== "ready" ? (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-[var(--bg)] px-6 text-center">
            <div className="text-[14px] font-semibold text-[var(--text-bright)]">
              {loadState === "error"
                ? `${agent.title} is not responding yet`
                : `Opening ${agent.title}…`}
            </div>
            <p className="max-w-lg text-[12px] leading-relaxed text-[var(--muted)]">
              This agent runs locally at{" "}
              <span className="font-mono text-[var(--cyan)]">{agent.url}</span>.
              {loadState === "error"
                ? " Keep the suite running and reload once the service is up."
                : " The panel will appear as soon as the local service answers."}
            </p>
            {loadState === "error" ? (
              <Button className="mt-2" onClick={() => setReloadKey((n) => n + 1)}>
                Retry
              </Button>
            ) : null}
          </div>
        ) : null}
        <iframe
          key={`${src}-${reloadKey}`}
          title={agent.title}
          src={src}
          onLoad={onIframeLoad}
          className="h-full w-full border-0 bg-[#05080e]"
          allow="clipboard-read; clipboard-write; fullscreen"
        />
      </div>
    </div>
  );
}
