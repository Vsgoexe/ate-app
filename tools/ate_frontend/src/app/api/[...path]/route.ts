import { NextRequest, NextResponse } from "next/server";
import { offlineFallback } from "@/lib/offlineApiFallback";

/**
 * Same-origin API proxy: browser /api/* → local ate_backend on 127.0.0.1:8000.
 * If the local backend is down, serve built-in dashboard mock data instead of a hard 502.
 */
const DEFAULT_TARGET = "http://127.0.0.1:8000";
const rawTarget = (process.env.API_PROXY_TARGET || DEFAULT_TARGET).replace(/\/$/, "");
const TARGET = /^https?:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/i.test(rawTarget)
  ? rawTarget
  : DEFAULT_TARGET;

function fallbackResponse(method: string, pathSegments: string[]): NextResponse | null {
  const path = `/${pathSegments.join("/")}`;
  const data = offlineFallback(path, method);
  if (data === null) return null;
  return NextResponse.json(data);
}

async function proxy(req: NextRequest, pathSegments: string[]) {
  const path = pathSegments.join("/");
  const url = `${TARGET}/api/${path}${req.nextUrl.search}`;

  const headers = new Headers();
  const auth = req.headers.get("authorization");
  if (auth) headers.set("authorization", auth);
  const contentType = req.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);
  const accept = req.headers.get("accept");
  if (accept) headers.set("accept", accept);

  const init: RequestInit = {
    method: req.method,
    headers,
    cache: "no-store",
    redirect: "manual",
  };

  if (req.method !== "GET" && req.method !== "HEAD") {
    init.body = await req.arrayBuffer();
  }

  let upstream: Response;
  try {
    upstream = await fetch(url, init);
  } catch {
    const local = fallbackResponse(req.method, pathSegments);
    if (local) return local;
    return NextResponse.json(
      {
        detail:
          "Local ATE backend unreachable at http://127.0.0.1:8000. Serving built-in dashboard data.",
      },
      { status: 502 },
    );
  }

  if (upstream.status >= 500 || upstream.status === 404) {
    const local = fallbackResponse(req.method, pathSegments);
    if (local) return local;
  }

  const out = new Headers();
  const ct = upstream.headers.get("content-type");
  if (ct) out.set("content-type", ct);

  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers: out,
  });
}

type Ctx = { params: Promise<{ path: string[] }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  const { path } = await ctx.params;
  return proxy(req, path);
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const { path } = await ctx.params;
  return proxy(req, path);
}

export async function PUT(req: NextRequest, ctx: Ctx) {
  const { path } = await ctx.params;
  return proxy(req, path);
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { path } = await ctx.params;
  return proxy(req, path);
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const { path } = await ctx.params;
  return proxy(req, path);
}
