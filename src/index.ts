import chalk from "chalk";
import { inspect } from "node:util";
import { encryptPayload } from "./crypto";

export {
  CreateMetrics,
  type LoggyMetrics,
  type MetricsConfig,
} from "./metrics";

// Tracing exports
export {
  CreateTracer,
  createTracingMiddleware,
  generateSpanId,
  generateTraceId,
  LoggySpan,
  LoggyTracer,
  withSpan,
  type Span,
  type SpanAttributes,
  type SpanContext,
  type SpanData,
  type SpanEvent,
  type SpanKind,
  type SpanOptions,
  type SpanStatus,
  type Tracer,
  type TracerConfig,
} from "./tracing";

/**
 * Loggy - A lightweight and pretty logger for Node.js applications.
 * @module CreateLoggy
 *
 * @typedef {Object} LoggyConfig
 * @property {string} identifier - An identifier for the logger (e.g., "app", "server", "test").
 * @property {boolean} color - Whether to use colored output.
 * @property {boolean} compact - Compact output for tags.
 */

interface LoggyConfig {
  identifier: string;
  color?: boolean;
  compact?: boolean;
  timestamp?: boolean;
  remote?: {
    token: string;
    endpoint?: string;
    batchSize?: number;
    flushInterval?: number;
    publicKey?: string;
  };
}

const LEVEL_COLORS = {
  LOG: "#ADD8E6",
  INFO: "#ADD8E6",
  WARN: "#FFBF00",
  ERROR: "#CC5500",
};

const formatTags = (compact: boolean, color: boolean, tags?: any): string => {
  return tags ? `\n${inspect(tags, { compact, depth: 5, colors: color })}` : "";
};

const formatTimestamp = (color: boolean): string => {
  const date = new Date();
  if (!color) return date.toLocaleString();

  return `${chalk.hex("#9F2B68")(date.toLocaleDateString())} ${chalk.hex(
    "#C2B280",
  )(date.toLocaleTimeString())}`;
};

interface LogEntry {
  level: string;
  message: string;
  metadata?: any;
  tags?: string[];
  timestamp: string;
}

interface LogOptions {
  metadata?: any;
  tags?: string[];
}

export const CreateLoggy = (config: LoggyConfig) => {
  const {
    identifier,
    color = true,
    compact = false,
    timestamp = true,
    remote,
  } = config;
  const styledIdentifier = color
    ? chalk.hex("#B2BEB5")(identifier)
    : identifier;

  // Remote logging state
  let logBuffer: LogEntry[] = [];
  let flushTimer: ReturnType<typeof setInterval> | null = null;
  const batchSize = remote?.batchSize ?? 50;
  const flushInterval = remote?.flushInterval ?? 5000;
  const endpoint = remote?.endpoint ?? "https://loggy.dev/api/logs/ingest";

  const flushLogs = async () => {
    if (!remote?.token || logBuffer.length === 0) return;

    const logsToSend = [...logBuffer];
    logBuffer = [];
    try {
      let body: string;
      let contentType = "application/json";

      if (remote.publicKey) {
        // Encrypt the payload using hybrid encryption
        const encrypted = encryptPayload(
          { logs: logsToSend },
          remote.publicKey,
        );
        body = JSON.stringify(encrypted);
        contentType = "application/json+encrypted";
      } else {
        body = JSON.stringify({ logs: logsToSend });
      }

      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": contentType,
          "x-loggy-token": remote.token,
        },
        body,
      });

      if (!response.ok) {
        logBuffer = [...logsToSend, ...logBuffer];
      } else {
      }
    } catch (err) {
      logBuffer = [...logsToSend, ...logBuffer];
    }
  };

  const queueLog = (entry: LogEntry) => {
    if (!remote?.token) return;

    logBuffer.push(entry);

    if (logBuffer.length >= batchSize) {
      flushLogs();
    }
  };

  // Start flush timer if remote is configured
  if (remote?.token) {
    flushTimer = setInterval(flushLogs, flushInterval);
  }

  const formatMessage = (
    levelLabel: keyof typeof LEVEL_COLORS,
    message: string,
    tags?: any,
  ): string => {
    const timestampStr = timestamp ? formatTimestamp(color) : "";
    const levelStr = color
      ? chalk.hex(LEVEL_COLORS[levelLabel])(levelLabel)
      : levelLabel;
    const tagsStr = formatTags(compact, color, tags);

    const prefix = timestampStr ? `${timestampStr} ` : "";
    return `${prefix}[${levelStr}] ${styledIdentifier}: ${message}${tagsStr}`;
  };

  const createLogger =
    (
      levelLabel: keyof typeof LEVEL_COLORS,
      level: string,
      consoleFn: typeof console.log,
    ) =>
    (message: string, optionsOrMetadata?: LogOptions | any) => {
      // Support both old API (metadata as second param) and new API (options object with metadata and tags)
      let metadata: any = undefined;
      let tags: string[] | undefined = undefined;

      if (optionsOrMetadata !== undefined) {
        // Check if it's the new LogOptions format (has tags or metadata property)
        if (
          typeof optionsOrMetadata === "object" &&
          optionsOrMetadata !== null &&
          ("tags" in optionsOrMetadata || "metadata" in optionsOrMetadata)
        ) {
          metadata = optionsOrMetadata.metadata;
          tags = optionsOrMetadata.tags;
        } else {
          // Old API: treat second param as metadata directly
          metadata = optionsOrMetadata;
        }
      }

      consoleFn(formatMessage(levelLabel, message, metadata));

      // Queue for remote logging
      queueLog({
        level,
        message,
        metadata,
        tags,
        timestamp: new Date().toISOString(),
      });
    };

  return {
    log: createLogger("LOG", "debug", console.log),
    info: createLogger("INFO", "info", console.info),
    warn: createLogger("WARN", "warn", console.warn),
    error: createLogger("ERROR", "error", console.error),
    blank: (lines: number = 1) => console.log("\n".repeat(lines)),
    flush: flushLogs,
    destroy: () => {
      if (flushTimer) {
        clearInterval(flushTimer);
        flushTimer = null;
      }
      return flushLogs();
    },
  };
};
