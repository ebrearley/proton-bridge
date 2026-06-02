export const runtime = "nodejs";

export function GET() {
  return new Response(
    "This endpoint expects a WebSocket upgrade. Next.js forwards it with the /api/terminal rewrite.",
    {
      status: 426,
      headers: {
        Connection: "Upgrade",
        Upgrade: "websocket",
      },
    }
  );
}
