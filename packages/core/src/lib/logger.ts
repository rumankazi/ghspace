import { env } from "../env.ts";

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 } as const;
export type Level = keyof typeof LEVELS;

/**
 * Structured single-line JSON logs. Deliberately minimal: the worker's output
 * is the primary operational signal for sync health, and JSON means it stays
 * greppable once it is going somewhere other than a terminal.
 */
function emit(level: Level, message: string, fields?: Record<string, unknown>) {
  if (LEVELS[level] < LEVELS[env().LOG_LEVEL]) return;
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    message,
    ...fields,
  });
  if (level === "error" || level === "warn") console.error(line);
  else console.log(line);
}

export const log = {
  debug: (m: string, f?: Record<string, unknown>) => emit("debug", m, f),
  info: (m: string, f?: Record<string, unknown>) => emit("info", m, f),
  warn: (m: string, f?: Record<string, unknown>) => emit("warn", m, f),
  error: (m: string, f?: Record<string, unknown>) => emit("error", m, f),
};
