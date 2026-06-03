export type TerminalOutput = {
  text: string;
  cursor: number;
};

const maxCsiLength = 64;

function lineStart(text: string, cursor: number) {
  return text.lastIndexOf("\n", Math.max(0, cursor - 1)) + 1;
}

function lineEnd(text: string, cursor: number) {
  const end = text.indexOf("\n", cursor);
  return end === -1 ? text.length : end;
}

function eraseLineToEnd(state: TerminalOutput): TerminalOutput {
  const end = lineEnd(state.text, state.cursor);
  return {
    text: `${state.text.slice(0, state.cursor)}${state.text.slice(end)}`,
    cursor: state.cursor,
  };
}

function eraseEntireLine(state: TerminalOutput): TerminalOutput {
  const start = lineStart(state.text, state.cursor);
  const end = lineEnd(state.text, state.cursor);
  return {
    text: `${state.text.slice(0, start)}${state.text.slice(end)}`,
    cursor: start,
  };
}

function writeCharacter(state: TerminalOutput, character: string): TerminalOutput {
  if (state.cursor < state.text.length && state.text[state.cursor] !== "\n") {
    return {
      text: `${state.text.slice(0, state.cursor)}${character}${state.text.slice(
        state.cursor + 1
      )}`,
      cursor: state.cursor + 1,
    };
  }

  return {
    text: `${state.text.slice(0, state.cursor)}${character}${state.text.slice(
      state.cursor
    )}`,
    cursor: state.cursor + 1,
  };
}

function applyCsi(state: TerminalOutput, sequence: string): TerminalOutput {
  const final = sequence.at(-1);
  const parameter = sequence.slice(0, -1);

  if (final === "J") {
    if (parameter === "2") {
      return { text: "", cursor: 0 };
    }
    return {
      text: state.text.slice(0, state.cursor),
      cursor: state.cursor,
    };
  }

  if (final === "K") {
    if (parameter === "2") {
      return eraseEntireLine(state);
    }
    return eraseLineToEnd(state);
  }

  return state;
}

export function applyTerminalOutput(
  current: TerminalOutput,
  chunk: string,
  maxLength = 100_000
): TerminalOutput {
  let state = current;

  for (let index = 0; index < chunk.length; index += 1) {
    const character = chunk[index];

    if (character === "\x1b" && chunk[index + 1] === "[") {
      const start = index + 2;
      let end = start;
      while (
        end < chunk.length &&
        end - start < maxCsiLength &&
        !/[@-~]/.test(chunk[end])
      ) {
        end += 1;
      }

      if (end < chunk.length && /[@-~]/.test(chunk[end])) {
        state = applyCsi(state, chunk.slice(start, end + 1));
        index = end;
        continue;
      }
    }

    if (character === "\r") {
      state = { ...state, cursor: lineStart(state.text, state.cursor) };
      continue;
    }

    if (character === "\b") {
      state = { ...state, cursor: Math.max(0, state.cursor - 1) };
      continue;
    }

    if (character === "\u007f") {
      if (state.cursor > 0) {
        state = {
          text: `${state.text.slice(0, state.cursor - 1)}${state.text.slice(
            state.cursor
          )}`,
          cursor: state.cursor - 1,
        };
      }
      continue;
    }

    if (character >= " " || character === "\n" || character === "\t") {
      state = writeCharacter(state, character);
    }
  }

  if (state.text.length <= maxLength) {
    return state;
  }

  const text = state.text.slice(-maxLength);
  return {
    text,
    cursor: Math.max(0, state.cursor - (state.text.length - text.length)),
  };
}
