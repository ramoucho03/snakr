// Liveness probe for the compose healthcheck. Deliberately dependency-free — no
// DB call — so it reports process liveness, not downstream readiness. Node runtime
// (never edge) and force-dynamic so it is never cached or statically optimized.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return new Response('ok', { status: 200 });
}
