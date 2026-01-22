/**
 * Tracing types for Loggy distributed tracing
 */

export type SpanKind =
  | "client"
  | "server"
  | "producer"
  | "consumer"
  | "internal";
export type SpanStatus = "ok" | "error" | "unset";

export interface SpanContext {
  traceId: string;
  spanId: string;
  traceFlags: number;
  traceState?: string;
}

export interface SpanAttributes {
  [key: string]: string | number | boolean | string[] | number[] | boolean[];
}

export interface SpanEvent {
  name: string;
  timestamp: string;
  attributes?: SpanAttributes;
}

export interface SpanData {
  traceId: string;
  spanId: string;
  parentSpanId?: string | null;
  operationName: string;
  serviceName: string;
  spanKind: SpanKind;
  startTime: string;
  endTime?: string;
  status: SpanStatus;
  statusMessage?: string;
  attributes?: SpanAttributes;
  events?: SpanEvent[];
  resourceAttributes?: SpanAttributes;
}

export interface TracerConfig {
  serviceName: string;
  serviceVersion?: string;
  environment?: string;
  remote?: {
    token: string;
    endpoint?: string;
    batchSize?: number;
    flushInterval?: number;
    publicKey?: string;
  };
}

export interface SpanOptions {
  kind?: SpanKind;
  attributes?: SpanAttributes;
  parent?: SpanContext | null;
  startTime?: Date;
}

export interface Span {
  readonly context: SpanContext;
  readonly operationName: string;
  readonly serviceName: string;
  readonly startTime: Date;

  setStatus(status: SpanStatus, message?: string): void;
  setAttribute(key: string, value: string | number | boolean): void;
  setAttributes(attributes: SpanAttributes): void;
  addEvent(name: string, attributes?: SpanAttributes): void;
  end(endTime?: Date): void;
  isRecording(): boolean;
}

export interface Tracer {
  startSpan(operationName: string, options?: SpanOptions): Span;
  inject(carrier: Record<string, string>): Record<string, string>;
  extract(carrier: Record<string, string>): SpanContext | null;
  flush(): Promise<void>;
  destroy(): Promise<void>;
}
