import assert from "node:assert/strict";
import { test } from "node:test";

import { applyTerminalOutput, type TerminalOutput } from "./terminal-output.ts";

function apply(chunks: string[]): TerminalOutput {
  let state: TerminalOutput = { text: "", cursor: 0 };
  for (const chunk of chunks) {
    state = applyTerminalOutput(state, chunk);
  }
  return state;
}

test("erases terminal redraw sequences instead of rendering CSI text", () => {
  assert.equal(apply(["\x1b[J>>> l", "\r\x1b[J>>> login"]).text, ">>> login");
});

test("handles backspace cursor movement without printing control characters", () => {
  const state = apply(["Username: xx\b\b  \b\b"]);

  assert.equal(state.text.includes("\b"), false);
  assert.equal(state.cursor, "Username: ".length);
});

test("keeps normal multiline terminal output", () => {
  assert.equal(apply(["Welcome\n", ">>> "]).text, "Welcome\n>>> ");
});
