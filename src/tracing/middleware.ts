/**
 * Express middleware for automatic tracing
 */

import type { NextFunction, Request, Response } from "express";
import type { LoggyTracer } from "./tracer";
import type { SpanAttributes } from "./types";

export interface TracingMiddlewareOptions {
  tracer: LoggyTracer;
  ignoreRoutes?: string[];
  recordRequestBody?: boolean;
  recordResponseBody?: boolean;
}

/**
 * Create Express middleware for automatic request tracing
 */
export function createTracingMiddleware(options: TracingMiddlewareOptions) {
  const {
    tracer,
    ignoreRoutes = [],
    recordRequestBody = false,
    recordResponseBody = false,
  } = options;

  return (req: Request, res: Response, next: NextFunction) => {
    // Skip ignored routes
    if (ignoreRoutes.some((route) => req.path.startsWith(route))) {
      return next();
    }

    // Extract parent context from incoming headers
    const parentContext = tracer.extract(req.headers as Record<string, string>);

    // Build operation name
    const operationName = `${req.method} ${req.route?.path || req.path}`;

    // Start span
    const span = tracer.startSpan(operationName, {
      kind: "server",
      parent: parentContext || undefined,
      attributes: {
        "http.method": req.method,
        "http.url": req.originalUrl,
        "http.target": req.path,
        "http.host": req.hostname,
        "http.scheme": req.protocol,
        "http.user_agent": req.get("user-agent") || "",
        "net.peer.ip": req.ip || "",
      },
    });

    // Record request body if enabled
    if (recordRequestBody && req.body) {
      try {
        const bodyStr = JSON.stringify(req.body);
        if (bodyStr.length <= 1024) {
          span.setAttribute("http.request.body", bodyStr);
        }
        span.setAttribute("http.request_content_length", bodyStr.length);
      } catch {
        // Ignore serialization errors
      }
    }

    // Capture response
    const originalEnd = res.end;
    const originalJson = res.json;
    let responseBody: string | undefined;

    if (recordResponseBody) {
      res.json = function (body: any) {
        try {
          responseBody = JSON.stringify(body);
        } catch {
          // Ignore serialization errors
        }
        return originalJson.call(this, body);
      };
    }

    res.end = function (chunk?: any, encoding?: any, callback?: any) {
      // Set response attributes
      span.setAttribute("http.status_code", res.statusCode);

      if (responseBody && responseBody.length <= 1024) {
        span.setAttribute("http.response.body", responseBody);
      }

      // Set status based on HTTP status code
      if (res.statusCode >= 400) {
        span.setStatus("error", `HTTP ${res.statusCode}`);
      } else {
        span.setStatus("ok");
      }

      // End span
      span.end();

      return originalEnd.call(this, chunk, encoding, callback);
    };

    // Handle errors
    res.on("error", (err) => {
      span.setStatus("error", err.message);
      span.addEvent("exception", {
        "exception.type": err.name,
        "exception.message": err.message,
        "exception.stacktrace": err.stack || "",
      });
    });

    next();
  };
}

/**
 * Wrap an async function with a span
 */
export function withSpan<T>(
  tracer: LoggyTracer,
  operationName: string,
  fn: () => Promise<T>,
  attributes?: SpanAttributes,
): Promise<T> {
  const span = tracer.startSpan(operationName, {
    kind: "internal",
    attributes,
    parent: tracer.getCurrentSpan()?.context,
  });

  return fn()
    .then((result) => {
      span.setStatus("ok");
      span.end();
      return result;
    })
    .catch((err) => {
      span.setStatus("error", err.message);
      span.addEvent("exception", {
        "exception.type": err.name || "Error",
        "exception.message": err.message,
        "exception.stacktrace": err.stack || "",
      });
      span.end();
      throw err;
    });
}
