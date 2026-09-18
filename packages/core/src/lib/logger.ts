const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 } as const;

export type Level = keyof typeof LEVELS;

/**
 * Reads `LOG_LEVEL` straight from the environment rather than through `env()`.
 *
 * Logging must work everywhere, including in processes that legitimately have
 * almost no configuration — `db:migrate` needs a database URL and nothing else,
 * and CI deliberately runs it without GitHub App credentials. Routing the log
 * level through the full schema made emitting a single line require every
 * credential in the application, so migrations failed with a list of unrelated
 * missing variables.
 *
 * An unrecognised or absent value falls back to `info` rather than throwing:
 * a logger that refuses to start denies you the very output that would explain
 * why.
 */
function threshold(): number {
  const configured = process.env.LOG_LEVEL as Level | undefined;

  return configured && configured in LEVELS ? LEVELS[configured] : LEVELS.info;
}

/**
 * Structured logs, rendered for whoever is reading them.
 *
 * Piped or redirected, output is single-line JSON so it stays greppable and
 * machine-parseable. Attached to a terminal, it is a compact human line
 * instead — the sync is a long-running foreground command, and watching it work
 * should not mean reading JSON.
 */
const COLOUR: Record<Level, string> = {
  debug: "\x1b[2m",
  info: "\x1b[36m",
  warn: "\x1b[33m",
  error: "\x1b[31m",
};

const DIM = "\x1b[2m";

const RESET = "\x1b[0m";

function useHumanFormat(): boolean {
  // NO_COLOR is honoured by convention; an explicit LOG_FORMAT wins over both.
  const configured = process.env.LOG_FORMAT;

  if (configured === "json") return false;

  if (configured === "pretty") return true;

  return Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "-";

  if (typeof value === "number") return Number.isInteger(value) ? String(value) : value.toFixed(1);
  const text = String(value);

  return text.includes(" ") ? `"${text}"` : text;
}

function emit(level: Level, message: string, fields?: Record<string, unknown>) {
  if (LEVELS[level] < threshold()) return;

  const toStderr = level === "error" || level === "warn";

  if (!useHumanFormat()) {
    const line = JSON.stringify({
      ts: new Date().toISOString(),
      level,
      message,
      ...fields,
    });

    if (toStderr) console.error(line);
    else console.log(line);

    return;
  }

  const time = new Date().toTimeString().slice(0, 8);

  const pairs = Object.entries(fields ?? {})
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}=${formatValue(value)}`)
    .join(" ");

  const line =
    `${DIM}${time}${RESET} ${COLOUR[level]}${level.padEnd(5)}${RESET} ${message}` +
    (pairs ? `  ${DIM}${pairs}${RESET}` : "");

  if (toStderr) console.error(line);
  else console.log(line);
}

export const log = {
  debug: (m: string, f?: Record<string, unknown>) => emit("debug", m, f),
  info: (m: string, f?: Record<string, unknown>) => emit("info", m, f),
  warn: (m: string, f?: Record<string, unknown>) => emit("warn", m, f),
  error: (m: string, f?: Record<string, unknown>) => emit("error", m, f),
};

/**
 * A step that reports how long it took.
 *
 * Long syncs are otherwise silent between milestones, which reads as a hang.
 * Logging the start as well as the finish is the difference between "it is
 * working" and "is it working?".
 */
export async function timed<T>(
  message: string,
  fields: Record<string, unknown>,
  work: () => Promise<T>,
): Promise<T> {
  const startedAt = Date.now();
  log.info(`${message}…`, fields);

  try {
    const result = await work();
    log.info(`${message} done`, { ...fields, ms: Date.now() - startedAt });

    return result;
  } catch (error) {
    log.error(`${message} failed`, {
      ...fields,
      ms: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
