/**
 * Span implementation for Loggy tracing
 */

import { generateSpanId } from "./context";
import type {
  Span,
  SpanAttributes,
  SpanContext,
  SpanData,
  SpanEvent,
  SpanKind,
  SpanStatus,
} from "./types";

export class LoggySpan implements Span {
  readonly context: SpanContext;
  readonly operationName: string;
  readonly serviceName: string;
  readonly startTime: Date;
  readonly spanKind: SpanKind;

  private _status: SpanStatus = "unset";
  private _statusMessage?: string;
  private _attributes: SpanAttributes = {};
  private _events: SpanEvent[] = [];
  private _endTime?: Date;
  private _recording = true;
  private _parentSpanId?: string;
  private _resourceAttributes?: SpanAttributes;
  private _onEnd?: (span: LoggySpan) => void;

  constructor(
    operationName: string,
    serviceName: string,
    options: {
      traceId: string;
      parentSpanId?: string;
      kind?: SpanKind;
      attributes?: SpanAttributes;
      startTime?: Date;
      resourceAttributes?: SpanAttributes;
      onEnd?: (span: LoggySpan) => void;
    },
  ) {
    this.operationName = operationName;
    this.serviceName = serviceName;
    this.spanKind = options.kind || "internal";
    this.startTime = options.startTime || new Date();
    this._parentSpanId = options.parentSpanId;
    this._resourceAttributes = options.resourceAttributes;
    this._onEnd = options.onEnd;

    this.context = {
      traceId: options.traceId,
      spanId: generateSpanId(),
      traceFlags: 1, // Sampled
    };

    if (options.attributes) {
      this._attributes = { ...options.attributes };
    }
  }

  setStatus(status: SpanStatus, message?: string): void {
    if (!this._recording) return;
    this._status = status;
    this._statusMessage = message;
  }

  setAttribute(key: string, value: string | number | boolean): void {
    if (!this._recording) return;
    this._attributes[key] = value;
  }

  setAttributes(attributes: SpanAttributes): void {
    if (!this._recording) return;
    Object.assign(this._attributes, attributes);
  }

  addEvent(name: string, attributes?: SpanAttributes): void {
    if (!this._recording) return;
    this._events.push({
      name,
      timestamp: new Date().toISOString(),
      attributes,
    });
  }

  end(endTime?: Date): void {
    if (!this._recording) return;
    this._endTime = endTime || new Date();
    this._recording = false;

    if (this._onEnd) {
      this._onEnd(this);
    }
  }

  isRecording(): boolean {
    return this._recording;
  }

  /**
   * Convert span to data format for sending to server
   */
  toData(): SpanData {
    return {
      traceId: this.context.traceId,
      spanId: this.context.spanId,
      parentSpanId: this._parentSpanId || null,
      operationName: this.operationName,
      serviceName: this.serviceName,
      spanKind: this.spanKind,
      startTime: this.startTime.toISOString(),
      endTime: this._endTime?.toISOString(),
      status: this._status,
      statusMessage: this._statusMessage,
      attributes:
        Object.keys(this._attributes).length > 0 ? this._attributes : undefined,
      events: this._events.length > 0 ? this._events : undefined,
      resourceAttributes: this._resourceAttributes,
    };
  }

  get parentSpanId(): string | undefined {
    return this._parentSpanId;
  }

  get status(): SpanStatus {
    return this._status;
  }

  get endTime(): Date | undefined {
    return this._endTime;
  }
}
