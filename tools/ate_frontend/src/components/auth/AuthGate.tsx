"use client";

import { useEffect, useState } from "react";
import { VerilumenBrand } from "@/components/branding/VerilumenBrand";
import { useAuthStore } from "@/stores/authStore";

const LOCAL_SESSION = {
  accessToken: "local-verilumen-jwt-token",
  username: "viewer",
  role: "VIEWER" as const,
  permissions: ["*"],
};

/**
 * Desktop / offline build: no password, no cloud auth.
 * Hydrate a local session and render the dashboard immediately.
 */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const setSession = useAuthStore((s) => s.setSession);
  const token = useAuthStore((s) => s.accessToken);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const unsub = useAuthStore.persist.onFinishHydration(() => setHydrated(true));
    setHydrated(useAuthStore.persist.hasHydrated());
    return unsub;
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    setSession(LOCAL_SESSION);
  }, [hydrated, setSession]);

  if (!hydrated || !token) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
        <div className="vl-enter mb-6">
          <VerilumenBrand size="auth" />
        </div>
        <p className="text-[12px] text-[var(--muted)]">Opening local dashboard…</p>
      </div>
    );
  }

  return <>{children}</>;
}
