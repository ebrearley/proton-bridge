"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AttachAddon } from "@xterm/addon-attach";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal as XTerm } from "@xterm/xterm";
import { Circle, Play } from "lucide-react";
import "@xterm/xterm/css/xterm.css";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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
  const [connectionState, setConnectionState] =
    useState<ConnectionState>("connecting");
  const containerRef = useRef<HTMLDivElement | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const terminalRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);

  const disposeSession = useCallback(() => {
    resizeObserverRef.current?.disconnect();
    resizeObserverRef.current = null;
    const socket = socketRef.current;
    const terminal = terminalRef.current;
    socketRef.current = null;
    terminalRef.current = null;
    fitAddonRef.current = null;
    socket?.close();
    terminal?.dispose();
  }, []);

  const connect = useCallback(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    disposeSession();
    setConnectionState("connecting");

    const terminal = new XTerm({
      convertEol: true,
      cursorBlink: true,
      fontFamily:
        "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
      fontSize: 14,
      lineHeight: 1.4,
      scrollback: 5000,
      theme: {
        background: "#09090b",
        foreground: "#f4f4f5",
        cursor: "#f4f4f5",
        selectionBackground: "#3f3f46",
      },
    });
    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(container);
    terminal.writeln("Connecting to Bridge CLI...");
    fitAddon.fit();
    terminal.focus();

    const socket = new WebSocket(webSocketUrl ?? defaultTerminalUrl());
    socket.binaryType = "arraybuffer";
    socketRef.current = socket;
    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;

    socket.addEventListener("open", () => {
      terminal.clear();
      terminal.loadAddon(new AttachAddon(socket));
      setConnectionState("open");
      terminal.focus();
    });

    socket.addEventListener("close", () => {
      if (socketRef.current !== socket) {
        return;
      }
      setConnectionState("closed");
      socketRef.current = null;
      terminal.writeln("");
      terminal.writeln("[Bridge CLI session closed]");
    });

    socket.addEventListener("error", () => {
      if (socketRef.current !== socket) {
        return;
      }
      setConnectionState("error");
      terminal.writeln("");
      terminal.writeln("[Bridge CLI connection error]");
    });

    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit();
    });
    resizeObserver.observe(container);
    resizeObserverRef.current = resizeObserver;
  }, [disposeSession, webSocketUrl]);

  useEffect(() => {
    connect();

    return disposeSession;
  }, [connect, disposeSession]);

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
            connect();
          }}
          disabled={connectionState === "open" || connectionState === "connecting"}
        >
          <Play aria-hidden="true" />
          Reconnect
        </Button>
      </div>

      <div
        ref={containerRef}
        aria-label="Bridge CLI terminal"
        className="h-[28rem] overflow-hidden rounded-lg border bg-zinc-950 p-3"
        onClick={() => terminalRef.current?.focus()}
      />
    </div>
  );
}
