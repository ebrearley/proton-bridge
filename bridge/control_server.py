from __future__ import annotations

import asyncio
import errno
import os
import pty
import signal
import subprocess
import select
import shlex
from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from pydantic import BaseModel


BRIDGE_BIN = os.environ.get("BRIDGE_BIN", "protonmail-bridge")
BRIDGE_ARGS = os.environ.get("BRIDGE_ARGS", "--no-window").split()
BRIDGE_CLI_BIN = os.environ.get("BRIDGE_CLI_BIN", BRIDGE_BIN)
BRIDGE_CLI_ARGS = shlex.split(os.environ.get("BRIDGE_CLI_ARGS", "-c"))
CONTROL_HOST = os.environ.get("BRIDGE_CONTROL_HOST", "0.0.0.0")
CONTROL_PORT = int(os.environ.get("BRIDGE_CONTROL_PORT", "8081"))
IMAP_FORWARD_LISTEN = os.environ.get("BRIDGE_IMAP_FORWARD_LISTEN", "0.0.0.0:143")
IMAP_FORWARD_TARGET = os.environ.get("BRIDGE_IMAP_FORWARD_TARGET", "127.0.0.1:1143")
SMTP_FORWARD_LISTEN = os.environ.get("BRIDGE_SMTP_FORWARD_LISTEN", "0.0.0.0:25")
SMTP_FORWARD_TARGET = os.environ.get("BRIDGE_SMTP_FORWARD_TARGET", "127.0.0.1:1025")

bridge_process: subprocess.Popen[bytes] | None = None
forwarder_processes: list[subprocess.Popen[bytes]] = []
terminal_lock = asyncio.Lock()


class Status(BaseModel):
    running: bool
    pid: int | None
    version: str


def bridge_version() -> str:
    try:
        result = subprocess.run(
            [BRIDGE_BIN, "--version"],
            check=False,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            timeout=10,
        )
    except Exception as exc:
        return f"unknown: {exc}"
    return result.stdout.strip() or "unknown"


def bridge_cli_command() -> list[str]:
    return [BRIDGE_CLI_BIN, *BRIDGE_CLI_ARGS]


def split_host_port(value: str) -> tuple[str, int]:
    host, separator, port = value.rpartition(":")
    if not separator or not host or not port:
        raise ValueError(f"Expected host:port, got {value!r}")
    return host, int(port)


def socat_command(listen: str, target: str) -> list[str]:
    listen_host, listen_port = split_host_port(listen)
    target_host, target_port = split_host_port(target)
    return [
        "socat",
        f"TCP-LISTEN:{listen_port},bind={listen_host},fork,reuseaddr",
        f"TCP:{target_host}:{target_port}",
    ]


def start_forwarders() -> None:
    global forwarder_processes
    if forwarder_processes and all(process.poll() is None for process in forwarder_processes):
        return
    stop_forwarders()
    forwarder_processes = [
        subprocess.Popen(socat_command(IMAP_FORWARD_LISTEN, IMAP_FORWARD_TARGET)),
        subprocess.Popen(socat_command(SMTP_FORWARD_LISTEN, SMTP_FORWARD_TARGET)),
    ]


def stop_forwarders() -> None:
    global forwarder_processes
    for process in forwarder_processes:
        if process.poll() is None:
            process.send_signal(signal.SIGTERM)
    for process in forwarder_processes:
        if process.poll() is None:
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=5)
    forwarder_processes = []


def start_bridge() -> None:
    global bridge_process
    if bridge_process and bridge_process.poll() is None:
        return
    bridge_process = subprocess.Popen([BRIDGE_BIN, *BRIDGE_ARGS])
    start_forwarders()


def stop_bridge() -> None:
    global bridge_process
    stop_forwarders()
    if not bridge_process or bridge_process.poll() is not None:
        return
    bridge_process.send_signal(signal.SIGTERM)
    try:
        bridge_process.wait(timeout=20)
    except subprocess.TimeoutExpired:
        bridge_process.kill()
        bridge_process.wait(timeout=10)


def read_pty(master_fd: int) -> bytes:
    ready, _, _ = select.select([master_fd], [], [], 0.1)
    if not ready:
        return b""
    try:
        return os.read(master_fd, 4096)
    except OSError as exc:
        if exc.errno == errno.EIO:
            return b""
        raise


async def pty_to_websocket(master_fd: int, websocket: WebSocket) -> None:
    while True:
        data = await asyncio.to_thread(read_pty, master_fd)
        if not data:
            await asyncio.sleep(0.01)
            continue
        await websocket.send_bytes(data)


async def websocket_to_pty(master_fd: int, websocket: WebSocket) -> None:
    while True:
        message = await websocket.receive()
        message_type = message.get("type")
        if message_type == "websocket.disconnect":
            raise WebSocketDisconnect()
        if text := message.get("text"):
            os.write(master_fd, text.encode())
        if data := message.get("bytes"):
            os.write(master_fd, data)


def spawn_bridge_cli() -> tuple[int, int]:
    command = bridge_cli_command()
    pid, master_fd = pty.fork()
    if pid == 0:
        os.execvp(command[0], command)
    return pid, master_fd


def terminate_pty_child(pid: int) -> None:
    try:
        waited_pid, _ = os.waitpid(pid, os.WNOHANG)
    except ChildProcessError:
        return
    if waited_pid:
        return
    try:
        os.kill(pid, signal.SIGHUP)
    except ProcessLookupError:
        return
    try:
        os.waitpid(pid, 0)
    except ChildProcessError:
        return


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    start_bridge()
    try:
        yield
    finally:
        stop_bridge()


app = FastAPI(lifespan=lifespan)


@app.get("/api/status", response_model=Status)
async def status() -> Status:
    running = bridge_process is not None and bridge_process.poll() is None
    return Status(
        running=running,
        pid=bridge_process.pid if running and bridge_process else None,
        version=bridge_version(),
    )


@app.post("/api/restart", response_model=Status)
async def restart() -> Status:
    stop_bridge()
    await asyncio.sleep(1)
    start_bridge()
    return await status()


@app.websocket("/api/terminal")
async def terminal(websocket: WebSocket) -> None:
    await websocket.accept()
    if terminal_lock.locked():
        await websocket.send_text("Another terminal session is already active.\r\n")
        await websocket.close(code=1013)
        return

    async with terminal_lock:
        await asyncio.to_thread(stop_bridge)
        pid, master_fd = await asyncio.to_thread(spawn_bridge_cli)
        wait_task = asyncio.create_task(asyncio.to_thread(os.waitpid, pid, 0))
        output_task = asyncio.create_task(pty_to_websocket(master_fd, websocket))
        input_task = asyncio.create_task(websocket_to_pty(master_fd, websocket))

        try:
            done, pending = await asyncio.wait(
                {wait_task, output_task, input_task},
                return_when=asyncio.FIRST_COMPLETED,
            )
            for task in pending:
                task.cancel()
            await asyncio.gather(*pending, return_exceptions=True)
            await asyncio.gather(*done, return_exceptions=True)
        finally:
            try:
                os.close(master_fd)
            except OSError:
                pass
            await asyncio.to_thread(terminate_pty_child, pid)
            await asyncio.to_thread(start_bridge)
            if websocket.client_state.name != "DISCONNECTED":
                await websocket.close()


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host=CONTROL_HOST, port=CONTROL_PORT)
