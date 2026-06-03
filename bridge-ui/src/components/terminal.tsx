"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Circle, Play } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { applyTerminalOutput, type TerminalOutput } from "@/lib/terminal-output";
import { cn } from "@/lib/utils";

const maxOutputLength = 100_000;

type ConnectionState = "connecting" | "open" | "closed" | "error";

type TerminalProps = {
  webSocketUrl?: string;
};

function defaultTerminalUrl() {
  const configured = process.env.NEXT_PUBLIC_TERMINAL_WS_URL;
  if (configured) {
    return configured;
  }

  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/api/terminal`;
}

function statusLabel(state: ConnectionState) {
  switch (state) {
    case "connecting":
      return "Connecting";
    case "open":
      return "Connected";
    case "error":
      return "Connection error";
    case "closed":
      return "Disconnected";
  }
}

export function Terminal({ webSocketUrl }: TerminalProps) {
  const [output, setOutput] = useState<TerminalOutput>({ text: "", cursor: 0 });
  const [command, setCommand] = useState("");
  const [connectionState, setConnectionState] =
    useState<ConnectionState>("connecting");
  const socketRef = useRef<WebSocket | null>(null);
  const outputRef = useRef<HTMLPreElement | null>(null);
  const decoder = useMemo(() => new TextDecoder(), []);

  const connect = useCallback(() => {
    socketRef.current?.close();
    const socket = new WebSocket(webSocketUrl ?? defaultTerminalUrl());
    socket.binaryType = "arraybuffer";
    socketRef.current = socket;

    socket.addEventListener("open", () => {
      setConnectionState("open");
    });

    socket.addEventListener("message", (event) => {
      const chunk =
        typeof event.data === "string"
          ? event.data
          : decoder.decode(event.data);

      setOutput((current) => applyTerminalOutput(current, chunk, maxOutputLength));
    });

    socket.addEventListener("close", () => {
      setConnectionState("closed");
      socketRef.current = null;
    });

    socket.addEventListener("error", () => {
      setConnectionState("error");
    });
  }, [decoder, webSocketUrl]);

  useEffect(() => {
    connect();

    return () => {
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [connect]);

  useEffect(() => {
    outputRef.current?.scrollIntoView({ block: "end" });
  }, [output.text]);

  const sendCommand = (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN || command.length === 0) {
      return;
    }
    socket.send(`${command}\n`);
    setCommand("");
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div
          className={cn(
            "inline-flex h-7 w-fit items-center gap-2 rounded-md border px-2.5 text-sm",
            connectionState === "open"
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-border bg-muted text-muted-foreground"
          )}
        >
          <Circle className="size-2 fill-current" aria-hidden="true" />
          {statusLabel(connectionState)}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            setConnectionState("connecting");
            connect();
          }}
          disabled={connectionState === "open" || connectionState === "connecting"}
        >
          <Play aria-hidden="true" />
          Reconnect
        </Button>
      </div>

      <ScrollArea className="h-[28rem] rounded-lg border bg-zinc-950 text-zinc-50">
        <pre className="min-h-full whitespace-pre-wrap break-words p-4 font-mono text-sm leading-6">
          {output.text || "Waiting for Bridge CLI output..."}
          <span ref={outputRef} />
        </pre>
      </ScrollArea>

      <form className="flex gap-2" onSubmit={sendCommand}>
        <Input
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          value={command}
          onChange={(event) => setCommand(event.target.value)}
          placeholder="Type a command and press Enter"
          className="font-mono"
          disabled={connectionState !== "open"}
        />
      </form>
    </div>
  );
}
