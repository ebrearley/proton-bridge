export type BridgeStatus = {
  running: boolean;
  pid: number | null;
  version: string;
  imap_port?: string;
  smtp_port?: string;
};

const bridgeBaseUrl =
  process.env.BRIDGE_CONTROL_URL ?? "http://proton-bridge:8081";

export async function getBridgeStatus(): Promise<BridgeStatus> {
  const response = await fetch(`${bridgeBaseUrl}/api/status`, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Bridge status failed: ${response.status}`);
  }

  return response.json() as Promise<BridgeStatus>;
}
