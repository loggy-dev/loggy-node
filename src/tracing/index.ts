/**
 * Loggy Distributed Tracing
 *
 * Track requests across services with spans and traces.
 *
 * @example
 * ```typescript
 * import { CreateTracer, createTracingMiddleware } from '@loggydev/loggy-node';
 *
 * const tracer = CreateTracer({
 *   serviceName: 'api-gateway',
 *   serviceVersion: '1.0.0',
 *   environment: 'production',
 *   remote: {
 *     token: 'your-project-token',
 *   },
 * });
 *
 * // Express middleware
 * app.use(createTracingMiddleware({ tracer }));
 *
 * // Manual spans
 * const span = tracer.startSpan('db.query');
 * // ... do work
 * span.end();
 * ```
 */

export {
  extractContext,
  formatTraceparent,
  generateSpanId,
  generateTraceId,
  injectContext,
  parseTraceparent,
} from "./context";
export { createTracingMiddleware, withSpan } from "./middleware";
export { LoggySpan } from "./span";
export { CreateTracer, LoggyTracer } from "./tracer";
export type {
  Span,
  SpanAttributes,
  SpanContext,
  SpanData,
  SpanEvent,
  SpanKind,
  SpanOptions,
  SpanStatus,
  Tracer,
  TracerConfig,
} from "./types";
