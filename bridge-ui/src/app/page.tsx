import Link from "next/link";
import { AlertCircle, CheckCircle2, Server, Terminal } from "lucide-react";
import { connection } from "next/server";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getBridgeStatus, type BridgeStatus } from "@/lib/bridge";

type StatusResult =
  | { ok: true; status: BridgeStatus }
  | { ok: false; error: string };

async function loadBridgeStatus(): Promise<StatusResult> {
  try {
    return { ok: true, status: await getBridgeStatus() };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Bridge status failed",
    };
  }
}

function envPort(name: string, fallback: string) {
  return process.env[name]?.trim() || fallback;
}

function mailClientSettings(imapPort: string, smtpPort: string) {
  return [
    {
      service: "IMAP",
      port: imapPort,
      security: "STARTTLS",
      purpose: "Incoming mail",
    },
    {
      service: "SMTP",
      port: smtpPort,
      security: "STARTTLS",
      purpose: "Outgoing mail",
    },
  ];
}

export default async function Home() {
  await connection();

  const result = await loadBridgeStatus();
  const isRunning = result.ok && result.status.running;
  const imapPort =
    result.ok && result.status.imap_port
      ? result.status.imap_port
      : envPort("PROTON_BRIDGE_IMAP_PORT", "1143");
  const smtpPort =
    result.ok && result.status.smtp_port
      ? result.status.smtp_port
      : envPort("PROTON_BRIDGE_SMTP_PORT", "1025");
  const settings = mailClientSettings(imapPort, smtpPort);

  return (
    <main className="flex-1 bg-muted/30">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-4 border-b pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground">
              Proton Bridge Control
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-normal">
              Status Dashboard
            </h1>
          </div>
          <Badge
            variant={isRunning ? "default" : "destructive"}
            className="h-7 gap-1.5 self-start px-3 text-sm sm:self-auto"
          >
            {isRunning ? (
              <CheckCircle2 aria-hidden="true" />
            ) : (
              <AlertCircle aria-hidden="true" />
            )}
            {isRunning ? "Running" : "Stopped"}
          </Badge>
        </header>

        {!result.ok ? (
          <Alert variant="destructive">
            <AlertCircle aria-hidden="true" />
            <AlertTitle>Bridge status unavailable</AlertTitle>
            <AlertDescription>
              The dashboard could not reach the Bridge control API. Last error:{" "}
              <span className="font-mono">{result.error}</span>
            </AlertDescription>
          </Alert>
        ) : null}

        <section className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle>Bridge Process</CardTitle>
              <CardDescription>Runtime state from the control API.</CardDescription>
              <CardAction>
                <Server className="size-5 text-muted-foreground" aria-hidden="true" />
              </CardAction>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-3">
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-muted-foreground">State</dt>
                  <dd className="font-medium">
                    {result.ok
                      ? result.status.running
                        ? "Running"
                        : "Stopped"
                      : "Unavailable"}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-muted-foreground">PID</dt>
                  <dd className="font-mono">
                    {result.ok ? result.status.pid ?? "Not assigned" : "Unknown"}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-muted-foreground">Version</dt>
                  <dd className="font-mono">
                    {result.ok ? result.status.version || "Unknown" : "Unknown"}
                  </dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle>Mail Client Settings</CardTitle>
              <CardDescription>
                Configure mail clients against the local Bridge listeners.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Service</TableHead>
                    <TableHead>Port</TableHead>
                    <TableHead>Security</TableHead>
                    <TableHead>Use</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {settings.map((setting) => (
                    <TableRow key={setting.service}>
                      <TableCell className="font-medium">
                        {setting.service}
                      </TableCell>
                      <TableCell className="font-mono">{setting.port}</TableCell>
                      <TableCell>{setting.security}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {setting.purpose}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </section>

        <Card>
          <CardHeader>
            <CardTitle>First Run</CardTitle>
            <CardDescription>
              Account setup will happen through the browser terminal.
            </CardDescription>
            <CardAction>
              <Terminal
                className="size-5 text-muted-foreground"
                aria-hidden="true"
              />
            </CardAction>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
              Use the browser terminal to complete the first Bridge login and
              account setup flow. This dashboard will continue to show process
              status and local mail client connection settings without displaying
              or requesting secrets.
            </p>
            <Button asChild className="self-start">
              <Link href="/terminal">
                <Terminal aria-hidden="true" />
                Open terminal
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
