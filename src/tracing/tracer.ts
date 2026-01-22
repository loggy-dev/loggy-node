/**
 * Tracer implementation for Loggy distributed tracing
 */

import { encryptPayload } from "../crypto";
import { extractContext, generateTraceId, injectContext } from "./context";
import { LoggySpan } from "./span";
import type {
  SpanAttributes,
  SpanContext,
  SpanData,
  SpanOptions,
  Tracer,
  TracerConfig,
} from "./types";

// Active span storage (for context propagation within async operations)
const activeSpans = new Map<string, LoggySpan>();

export class LoggyTracer implements Tracer {
  private serviceName: string;
  private serviceVersion?: string;
  private environment?: string;
  private remote?: TracerConfig["remote"];
  private spanBuffer: SpanData[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private batchSize: number;
  private flushInterval: number;
  private endpoint: string;
  private resourceAttributes: SpanAttributes;

  constructor(config: TracerConfig) {
    this.serviceName = config.serviceName;
    this.serviceVersion = config.serviceVersion;
    this.environment = config.environment;
    this.remote = config.remote;
    this.batchSize = config.remote?.batchSize ?? 100;
    this.flushInterval = config.remote?.flushInterval ?? 5000;
    this.endpoint =
      config.remote?.endpoint ?? "https://loggy.dev/api/traces/ingest";

    // Build resource attributes
    this.resourceAttributes = {
      "service.name": this.serviceName,
    };
    if (this.serviceVersion) {
      this.resourceAttributes["service.version"] = this.serviceVersion;
    }
    if (this.environment) {
      this.resourceAttributes["deployment.environment"] = this.environment;
    }

    // Start flush timer if remote is configured
    if (this.remote?.token) {
      this.flushTimer = setInterval(() => this.flush(), this.flushInterval);
    }
  }

  startSpan(operationName: string, options?: SpanOptions): LoggySpan {
    // Determine trace ID - either from parent or generate new
    let traceId: string;
    let parentSpanId: string | undefined;

    if (options?.parent) {
      traceId = options.parent.traceId;
      parentSpanId = options.parent.spanId;
    } else {
      traceId = generateTraceId();
    }

    const span = new LoggySpan(operationName, this.serviceName, {
      traceId,
      parentSpanId,
      kind: options?.kind,
      attributes: options?.attributes,
      startTime: options?.startTime,
      resourceAttributes: this.resourceAttributes,
      onEnd: (endedSpan) => this.onSpanEnd(endedSpan),
    });

    // Store as active span
    activeSpans.set(span.context.spanId, span);

    return span;
  }

  private onSpanEnd(span: LoggySpan): void {
    // Remove from active spans
    activeSpans.delete(span.context.spanId);

    // Queue for remote sending
    if (this.remote?.token) {
      this.spanBuffer.push(span.toData());

      if (this.spanBuffer.length >= this.batchSize) {
        this.flush();
      }
    }
  }

  inject(carrier: Record<string, string>): Record<string, string> {
    // Get the most recently created active span as current context
    const activeSpanArray = Array.from(activeSpans.values());
    if (activeSpanArray.length === 0) {
      return carrier;
    }

    const currentSpan = activeSpanArray[activeSpanArray.length - 1];
    return injectContext(currentSpan.context, carrier);
  }

  extract(carrier: Record<string, string>): SpanContext | null {
    return extractContext(carrier);
  }

  async flush(): Promise<void> {
    if (!this.remote?.token || this.spanBuffer.length === 0) return;

    const spansToSend = [...this.spanBuffer];
    this.spanBuffer = [];

    try {
      let body: string;
      let contentType = "application/json";

      if (this.remote.publicKey) {
        // Encrypt the payload using hybrid encryption
        const encrypted = encryptPayload(
          { spans: spansToSend },
          this.remote.publicKey,
        );
        body = JSON.stringify(encrypted);
        contentType = "application/json+encrypted";
      } else {
        body = JSON.stringify({ spans: spansToSend });
      }

      const response = await fetch(this.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": contentType,
          "x-loggy-token": this.remote.token,
        },
        body,
      });

      if (!response.ok) {
        // Put spans back in buffer for retry
        this.spanBuffer = [...spansToSend, ...this.spanBuffer];
      }
    } catch {
      // Put spans back in buffer for retry
      this.spanBuffer = [...spansToSend, ...this.spanBuffer];
    }
  }

  async destroy(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    await this.flush();
  }

  /**
   * Get the current active span (if any)
   */
  getCurrentSpan(): LoggySpan | undefined {
    const activeSpanArray = Array.from(activeSpans.values());
    return activeSpanArray[activeSpanArray.length - 1];
  }

  /**
   * Get current trace context for log correlation
   */
  getCurrentContext(): { traceId?: string; spanId?: string } {
    const currentSpan = this.getCurrentSpan();
    if (!currentSpan) return {};
    return {
      traceId: currentSpan.context.traceId,
      spanId: currentSpan.context.spanId,
    };
  }
}

/**
 * Create a new Loggy tracer instance
 */
export function CreateTracer(config: TracerConfig): LoggyTracer {
  return new LoggyTracer(config);
}
