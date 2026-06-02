from __future__ import annotations

import asyncio
import os
import signal
import subprocess
from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI
from pydantic import BaseModel


BRIDGE_BIN = os.environ.get("BRIDGE_BIN", "protonmail-bridge")
BRIDGE_ARGS = os.environ.get("BRIDGE_ARGS", "--no-window").split()
CONTROL_HOST = os.environ.get("BRIDGE_CONTROL_HOST", "0.0.0.0")
CONTROL_PORT = int(os.environ.get("BRIDGE_CONTROL_PORT", "8081"))

bridge_process: subprocess.Popen[bytes] | None = None


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


def start_bridge() -> None:
    global bridge_process
    if bridge_process and bridge_process.poll() is None:
        return
    bridge_process = subprocess.Popen([BRIDGE_BIN, *BRIDGE_ARGS])


def stop_bridge() -> None:
    global bridge_process
    if not bridge_process or bridge_process.poll() is not None:
        return
    bridge_process.send_signal(signal.SIGTERM)
    try:
        bridge_process.wait(timeout=20)
    except subprocess.TimeoutExpired:
        bridge_process.kill()
        bridge_process.wait(timeout=10)


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


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host=CONTROL_HOST, port=CONTROL_PORT)
