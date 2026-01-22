import {
  CreateTracer,
  LoggySpan,
  LoggyTracer,
  generateSpanId,
  generateTraceId,
  withSpan,
} from "../src/tracing";
import {
  extractContext,
  formatTraceparent,
  injectContext,
  parseTraceparent,
} from "../src/tracing/context";

describe("Tracing", () => {
  describe("ID Generation", () => {
    test("generateTraceId creates valid 32-char hex string", () => {
      const traceId = generateTraceId();
      expect(traceId).toHaveLength(32);
      expect(traceId).toMatch(/^[0-9a-f]{32}$/);
    });

    test("generateSpanId creates valid 16-char hex string", () => {
      const spanId = generateSpanId();
      expect(spanId).toHaveLength(16);
      expect(spanId).toMatch(/^[0-9a-f]{16}$/);
    });

    test("generates unique IDs", () => {
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        ids.add(generateTraceId());
        ids.add(generateSpanId());
      }
      expect(ids.size).toBe(200);
    });
  });

  describe("W3C Trace Context", () => {
    test("parseTraceparent parses valid traceparent header", () => {
      const traceparent =
        "00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01";
      const result = parseTraceparent(traceparent);

      expect(result).not.toBeNull();
      expect(result?.traceId).toBe("0af7651916cd43dd8448eb211c80319c");
      expect(result?.spanId).toBe("b7ad6b7169203331");
      expect(result?.traceFlags).toBe(1);
    });

    test("parseTraceparent returns null for invalid header", () => {
      expect(parseTraceparent("invalid")).toBeNull();
      expect(parseTraceparent("")).toBeNull();
      expect(parseTraceparent("00-abc-def-01")).toBeNull();
    });

    test("formatTraceparent creates valid traceparent header", () => {
      const context = {
        traceId: "0af7651916cd43dd8448eb211c80319c",
        spanId: "b7ad6b7169203331",
        traceFlags: 1,
      };
      const result = formatTraceparent(context);

      expect(result).toBe(
        "00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01",
      );
    });

    test("injectContext adds traceparent header", () => {
      const context = {
        traceId: "0af7651916cd43dd8448eb211c80319c",
        spanId: "b7ad6b7169203331",
        traceFlags: 1,
      };
      const carrier: Record<string, string> = {};
      const result = injectContext(context, carrier);

      expect(result.traceparent).toBe(
        "00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01",
      );
    });

    test("extractContext extracts context from headers", () => {
      const carrier = {
        traceparent: "00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01",
      };
      const result = extractContext(carrier);

      expect(result).not.toBeNull();
      expect(result?.traceId).toBe("0af7651916cd43dd8448eb211c80319c");
      expect(result?.spanId).toBe("b7ad6b7169203331");
    });

    test("extractContext returns null when no traceparent", () => {
      const result = extractContext({});
      expect(result).toBeNull();
    });
  });

  describe("LoggySpan", () => {
    test("creates span with correct properties", () => {
      const span = new LoggySpan("test-operation", "test-service", {
        traceId: "0af7651916cd43dd8448eb211c80319c",
        kind: "server",
        attributes: { "http.method": "GET" },
      });

      expect(span.operationName).toBe("test-operation");
      expect(span.serviceName).toBe("test-service");
      expect(span.spanKind).toBe("server");
      expect(span.context.traceId).toBe("0af7651916cd43dd8448eb211c80319c");
      expect(span.context.spanId).toHaveLength(16);
      expect(span.isRecording()).toBe(true);
    });

    test("setStatus updates span status", () => {
      const span = new LoggySpan("test", "service", {
        traceId: generateTraceId(),
      });

      span.setStatus("error", "Something went wrong");
      expect(span.status).toBe("error");
    });

    test("setAttribute adds attribute", () => {
      const span = new LoggySpan("test", "service", {
        traceId: generateTraceId(),
      });

      span.setAttribute("http.status_code", 200);
      const data = span.toData();
      expect(data.attributes?.["http.status_code"]).toBe(200);
    });

    test("setAttributes adds multiple attributes", () => {
      const span = new LoggySpan("test", "service", {
        traceId: generateTraceId(),
      });

      span.setAttributes({
        "http.method": "POST",
        "http.url": "/api/users",
      });
      const data = span.toData();
      expect(data.attributes?.["http.method"]).toBe("POST");
      expect(data.attributes?.["http.url"]).toBe("/api/users");
    });

    test("addEvent adds event with timestamp", () => {
      const span = new LoggySpan("test", "service", {
        traceId: generateTraceId(),
      });

      span.addEvent("exception", { "exception.message": "Test error" });
      const data = span.toData();

      expect(data.events).toHaveLength(1);
      expect(data.events?.[0].name).toBe("exception");
      expect(data.events?.[0].attributes?.["exception.message"]).toBe(
        "Test error",
      );
      expect(data.events?.[0].timestamp).toBeDefined();
    });

    test("end() stops recording and sets endTime", () => {
      const span = new LoggySpan("test", "service", {
        traceId: generateTraceId(),
      });

      expect(span.isRecording()).toBe(true);
      span.end();
      expect(span.isRecording()).toBe(false);
      expect(span.endTime).toBeDefined();
    });

    test("operations after end() are ignored", () => {
      const span = new LoggySpan("test", "service", {
        traceId: generateTraceId(),
      });

      span.end();
      span.setAttribute("should.not.exist", true);
      span.addEvent("should-not-exist");

      const data = span.toData();
      expect(data.attributes?.["should.not.exist"]).toBeUndefined();
      expect(data.events).toBeUndefined();
    });

    test("toData returns correct SpanData format", () => {
      const span = new LoggySpan("GET /users", "api-gateway", {
        traceId: "0af7651916cd43dd8448eb211c80319c",
        parentSpanId: "b7ad6b7169203331",
        kind: "server",
        attributes: { "http.method": "GET" },
        resourceAttributes: { "service.version": "1.0.0" },
      });

      span.setStatus("ok");
      span.end();

      const data = span.toData();

      expect(data.traceId).toBe("0af7651916cd43dd8448eb211c80319c");
      expect(data.parentSpanId).toBe("b7ad6b7169203331");
      expect(data.operationName).toBe("GET /users");
      expect(data.serviceName).toBe("api-gateway");
      expect(data.spanKind).toBe("server");
      expect(data.status).toBe("ok");
      expect(data.startTime).toBeDefined();
      expect(data.endTime).toBeDefined();
      expect(data.attributes?.["http.method"]).toBe("GET");
      expect(data.resourceAttributes?.["service.version"]).toBe("1.0.0");
    });
  });

  describe("LoggyTracer", () => {
    test("creates tracer with service info", () => {
      const tracer = new LoggyTracer({
        serviceName: "test-service",
        serviceVersion: "1.0.0",
        environment: "test",
      });

      expect(tracer).toBeDefined();
    });

    test("startSpan creates new span", () => {
      const tracer = new LoggyTracer({
        serviceName: "test-service",
      });

      const span = tracer.startSpan("test-operation");

      expect(span).toBeInstanceOf(LoggySpan);
      expect(span.operationName).toBe("test-operation");
      expect(span.serviceName).toBe("test-service");
    });

    test("startSpan with parent creates child span", () => {
      const tracer = new LoggyTracer({
        serviceName: "test-service",
      });

      const parentSpan = tracer.startSpan("parent");
      const childSpan = tracer.startSpan("child", {
        parent: parentSpan.context,
      });

      expect(childSpan.context.traceId).toBe(parentSpan.context.traceId);
      expect(childSpan.parentSpanId).toBe(parentSpan.context.spanId);
    });

    test("inject adds trace context to carrier", () => {
      const tracer = new LoggyTracer({
        serviceName: "test-service",
      });

      const span = tracer.startSpan("test");
      const carrier = tracer.inject({});

      expect(carrier.traceparent).toBeDefined();
      expect(carrier.traceparent).toContain(span.context.traceId);
    });

    test("extract parses trace context from carrier", () => {
      const tracer = new LoggyTracer({
        serviceName: "test-service",
      });

      const carrier = {
        traceparent: "00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01",
      };
      const context = tracer.extract(carrier);

      expect(context).not.toBeNull();
      expect(context?.traceId).toBe("0af7651916cd43dd8448eb211c80319c");
    });

    test("getCurrentContext returns active span context", () => {
      const tracer = new LoggyTracer({
        serviceName: "test-service",
      });

      // Start a span and verify context
      const span = tracer.startSpan("test");
      const context = tracer.getCurrentContext();

      expect(context.traceId).toBe(span.context.traceId);
      expect(context.spanId).toBe(span.context.spanId);

      // End the span
      span.end();

      // After ending, context should be empty (no active spans for this tracer)
      // Note: The global activeSpans map may have spans from other tests
    });
  });

  describe("CreateTracer factory", () => {
    test("creates tracer instance", () => {
      const tracer = CreateTracer({
        serviceName: "test-service",
      });

      expect(tracer).toBeInstanceOf(LoggyTracer);
    });
  });

  describe("withSpan helper", () => {
    test("wraps async function with span", async () => {
      const tracer = new LoggyTracer({
        serviceName: "test-service",
      });

      const result = await withSpan(tracer, "test-operation", async () => {
        return "success";
      });

      expect(result).toBe("success");
    });

    test("sets ok status on success", async () => {
      const tracer = new LoggyTracer({
        serviceName: "test-service",
      });

      let capturedSpan: LoggySpan | undefined;
      const originalStartSpan = tracer.startSpan.bind(tracer);
      tracer.startSpan = (name, options) => {
        capturedSpan = originalStartSpan(name, options);
        return capturedSpan;
      };

      await withSpan(tracer, "test", async () => "done");

      expect(capturedSpan?.status).toBe("ok");
      expect(capturedSpan?.isRecording()).toBe(false);
    });

    test("sets error status on failure", async () => {
      const tracer = new LoggyTracer({
        serviceName: "test-service",
      });

      let capturedSpan: LoggySpan | undefined;
      const originalStartSpan = tracer.startSpan.bind(tracer);
      tracer.startSpan = (name, options) => {
        capturedSpan = originalStartSpan(name, options);
        return capturedSpan;
      };

      await expect(
        withSpan(tracer, "test", async () => {
          throw new Error("Test error");
        }),
      ).rejects.toThrow("Test error");

      expect(capturedSpan?.status).toBe("error");
      expect(capturedSpan?.isRecording()).toBe(false);
    });

    test("passes attributes to span", async () => {
      const tracer = new LoggyTracer({
        serviceName: "test-service",
      });

      let capturedSpan: LoggySpan | undefined;
      const originalStartSpan = tracer.startSpan.bind(tracer);
      tracer.startSpan = (name, options) => {
        capturedSpan = originalStartSpan(name, options);
        return capturedSpan;
      };

      await withSpan(tracer, "test", async () => "done", {
        "custom.attr": "value",
      });

      const data = capturedSpan?.toData();
      expect(data?.attributes?.["custom.attr"]).toBe("value");
    });
  });
});
