/**
 * W3C Trace Context propagation for Loggy tracing
 * https://www.w3.org/TR/trace-context/
 */

import type { SpanContext } from "./types";

const TRACEPARENT_HEADER = "traceparent";
const TRACESTATE_HEADER = "tracestate";
const VERSION = "00";

/**
 * Generate a random 128-bit trace ID (32 hex chars)
 */
export function generateTraceId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Generate a random 64-bit span ID (16 hex chars)
 */
export function generateSpanId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Parse a traceparent header into a SpanContext
 * Format: {version}-{trace-id}-{parent-id}-{trace-flags}
 * Example: 00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01
 */
export function parseTraceparent(header: string): SpanContext | null {
  if (!header) return null;

  const parts = header.trim().split("-");
  if (parts.length !== 4) return null;

  const [version, traceId, spanId, flags] = parts;

  // Validate version
  if (version !== VERSION) return null;

  // Validate trace ID (32 hex chars, not all zeros)
  if (!/^[0-9a-f]{32}$/.test(traceId) || traceId === "0".repeat(32)) {
    return null;
  }

  // Validate span ID (16 hex chars, not all zeros)
  if (!/^[0-9a-f]{16}$/.test(spanId) || spanId === "0".repeat(16)) {
    return null;
  }

  // Validate flags (2 hex chars)
  if (!/^[0-9a-f]{2}$/.test(flags)) {
    return null;
  }

  return {
    traceId,
    spanId,
    traceFlags: parseInt(flags, 16),
  };
}

/**
 * Format a SpanContext into a traceparent header
 */
export function formatTraceparent(context: SpanContext): string {
  const flags = context.traceFlags.toString(16).padStart(2, "0");
  return `${VERSION}-${context.traceId}-${context.spanId}-${flags}`;
}

/**
 * Parse a tracestate header
 * Format: key1=value1,key2=value2
 */
export function parseTracestate(header: string): Map<string, string> {
  const state = new Map<string, string>();
  if (!header) return state;

  const pairs = header.split(",");
  for (const pair of pairs) {
    const [key, value] = pair.trim().split("=");
    if (key && value) {
      state.set(key, value);
    }
  }

  return state;
}

/**
 * Format a tracestate map into a header value
 */
export function formatTracestate(state: Map<string, string>): string {
  return Array.from(state.entries())
    .map(([key, value]) => `${key}=${value}`)
    .join(",");
}

/**
 * Inject trace context into carrier (HTTP headers)
 */
export function injectContext(
  context: SpanContext,
  carrier: Record<string, string>,
  traceState?: Map<string, string>,
): Record<string, string> {
  carrier[TRACEPARENT_HEADER] = formatTraceparent(context);

  if (traceState && traceState.size > 0) {
    carrier[TRACESTATE_HEADER] = formatTracestate(traceState);
  }

  return carrier;
}

/**
 * Extract trace context from carrier (HTTP headers)
 */
export function extractContext(
  carrier: Record<string, string>,
): SpanContext | null {
  // Try lowercase first (standard), then original case
  const traceparent =
    carrier[TRACEPARENT_HEADER] ||
    carrier["Traceparent"] ||
    carrier["TRACEPARENT"];

  if (!traceparent) return null;

  return parseTraceparent(traceparent);
}

/**
 * Extract tracestate from carrier
 */
export function extractTracestate(
  carrier: Record<string, string>,
): Map<string, string> {
  const tracestate =
    carrier[TRACESTATE_HEADER] ||
    carrier["Tracestate"] ||
    carrier["TRACESTATE"];

  return parseTracestate(tracestate || "");
}
