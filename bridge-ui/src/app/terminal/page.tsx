import Link from "next/link";
import { ArrowLeft, ShieldAlert, Terminal as TerminalIcon } from "lucide-react";

import { Terminal } from "@/components/terminal";
import { ThemeToggle } from "@/components/theme-toggle";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const commands = [
  {
    command: "login",
    description: "Start the Proton account login flow inside Bridge.",
  },
  {
    command: "info",
    description: "Show generated IMAP and SMTP credentials after setup.",
  },
  {
    command: "exit",
    description: "Close the Bridge CLI and restart the supervised Bridge process.",
  },
];

export default function TerminalPage() {
  return (
    <main className="flex-1 bg-muted/30">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-4 border-b pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground">
              Proton Bridge Control
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-normal">
              Browser Terminal
            </h1>
          </div>
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <ThemeToggle />
            <Button asChild variant="outline">
              <Link href="/">
                <ArrowLeft aria-hidden="true" />
                Dashboard
              </Link>
            </Button>
          </div>
        </header>

        <Alert variant="destructive">
          <ShieldAlert aria-hidden="true" />
          <AlertTitle>Credential handling</AlertTitle>
          <AlertDescription>
            Paste Proton credentials only into the live terminal session. Store
            generated Bridge passwords securely after running{" "}
            <span className="font-mono">info</span>; this UI does not save or
            log terminal contents.
          </AlertDescription>
        </Alert>

        <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <Card>
            <CardHeader>
              <CardTitle>Bridge CLI</CardTitle>
              <CardDescription>
                The supervised Bridge process pauses while this session is open.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Terminal />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Commands</CardTitle>
              <CardDescription>
                Type a command and press Enter to send it.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-4">
                {commands.map((item) => (
                  <div key={item.command} className="grid gap-1">
                    <dt className="flex items-center gap-2 font-mono font-medium">
                      <TerminalIcon className="size-4 text-muted-foreground" />
                      {item.command}
                    </dt>
                    <dd className="text-sm leading-6 text-muted-foreground">
                      {item.description}
                    </dd>
                  </div>
                ))}
              </dl>
            </CardContent>
          </Card>
        </section>
      </div>
    </main>
  );
}
