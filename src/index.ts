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
  /**
   * Auto-capture options for intercepting standard output
   */
  capture?: {
    /**
     * Intercept console.log, console.info, console.warn, console.error
     * and automatically send them to Loggy
     */
    console?: boolean;
    /**
     * Capture uncaught exceptions and unhandled promise rejections
     */
    exceptions?: boolean;
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
    capture,
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

  // Store original console methods for restoration
  const originalConsole = {
    log: console.log,
    info: console.info,
    warn: console.warn,
    error: console.error,
  };

  // Track if we've set up capture handlers
  let consolePatched = false;
  let exceptionHandlersInstalled = false;

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

  // Helper to convert console arguments to a string message
  const argsToMessage = (args: any[]): { message: string; metadata?: any } => {
    if (args.length === 0) return { message: "" };
    if (args.length === 1) {
      if (typeof args[0] === "string") return { message: args[0] };
      if (typeof args[0] === "object") {
        return { message: JSON.stringify(args[0]), metadata: args[0] };
      }
      return { message: String(args[0]) };
    }
    // Multiple args: first string is message, rest is metadata
    const firstString = args.find((a) => typeof a === "string");
    const objects = args.filter((a) => typeof a === "object" && a !== null);
    return {
      message: firstString ?? args.map((a) => String(a)).join(" "),
      metadata:
        objects.length > 0
          ? objects.length === 1
            ? objects[0]
            : { args: objects }
          : undefined,
    };
  };

  // Exception handler references for cleanup
  let uncaughtExceptionHandler: ((err: Error) => void) | null = null;
  let unhandledRejectionHandler: ((reason: any) => void) | null = null;

  // Set up console capture if enabled
  const setupConsoleCapture = () => {
    if (consolePatched || !capture?.console) return;

    console.log = (...args: any[]) => {
      originalConsole.log(...args);
      const { message, metadata } = argsToMessage(args);
      if (message)
        queueLog({
          level: "debug",
          message,
          metadata,
          timestamp: new Date().toISOString(),
        });
    };

    console.info = (...args: any[]) => {
      originalConsole.info(...args);
      const { message, metadata } = argsToMessage(args);
      if (message)
        queueLog({
          level: "info",
          message,
          metadata,
          timestamp: new Date().toISOString(),
        });
    };

    console.warn = (...args: any[]) => {
      originalConsole.warn(...args);
      const { message, metadata } = argsToMessage(args);
      if (message)
        queueLog({
          level: "warn",
          message,
          metadata,
          timestamp: new Date().toISOString(),
        });
    };

    console.error = (...args: any[]) => {
      originalConsole.error(...args);
      const { message, metadata } = argsToMessage(args);
      if (message)
        queueLog({
          level: "error",
          message,
          metadata,
          timestamp: new Date().toISOString(),
        });
    };

    consolePatched = true;
  };

  // Set up exception capture if enabled
  const setupExceptionCapture = () => {
    if (exceptionHandlersInstalled || !capture?.exceptions) return;

    uncaughtExceptionHandler = (err: Error) => {
      queueLog({
        level: "error",
        message: `Uncaught Exception: ${err.message}`,
        metadata: { stack: err.stack, name: err.name },
        timestamp: new Date().toISOString(),
      });
      // Flush immediately on exception
      flushLogs();
    };

    unhandledRejectionHandler = (reason: any) => {
      const message = reason instanceof Error ? reason.message : String(reason);
      const metadata =
        reason instanceof Error
          ? { stack: reason.stack, name: reason.name }
          : { reason };
      queueLog({
        level: "error",
        message: `Unhandled Promise Rejection: ${message}`,
        metadata,
        timestamp: new Date().toISOString(),
      });
      flushLogs();
    };

    process.on("uncaughtException", uncaughtExceptionHandler);
    process.on("unhandledRejection", unhandledRejectionHandler);
    exceptionHandlersInstalled = true;
  };

  // Restore original console methods
  const restoreConsole = () => {
    if (!consolePatched) return;
    console.log = originalConsole.log;
    console.info = originalConsole.info;
    console.warn = originalConsole.warn;
    console.error = originalConsole.error;
    consolePatched = false;
  };

  // Remove exception handlers
  const removeExceptionHandlers = () => {
    if (!exceptionHandlersInstalled) return;
    if (uncaughtExceptionHandler) {
      process.removeListener("uncaughtException", uncaughtExceptionHandler);
    }
    if (unhandledRejectionHandler) {
      process.removeListener("unhandledRejection", unhandledRejectionHandler);
    }
    exceptionHandlersInstalled = false;
  };

  // Initialize capture if configured
  setupConsoleCapture();
  setupExceptionCapture();

  return {
    log: createLogger("LOG", "debug", originalConsole.log),
    info: createLogger("INFO", "info", originalConsole.info),
    warn: createLogger("WARN", "warn", originalConsole.warn),
    error: createLogger("ERROR", "error", originalConsole.error),
    blank: (lines: number = 1) => originalConsole.log("\n".repeat(lines)),
    flush: flushLogs,
    destroy: () => {
      if (flushTimer) {
        clearInterval(flushTimer);
        flushTimer = null;
      }
      restoreConsole();
      removeExceptionHandlers();
      return flushLogs();
    },
    /**
     * Restore original console methods without destroying the logger
     */
    restoreConsole,
    /**
     * Re-enable console capture after it was disabled
     */
    enableConsoleCapture: setupConsoleCapture,
  };
};
