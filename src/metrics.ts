/**
 * Loggy Performance Metrics - Framework-agnostic performance tracking
 *
 * This module provides a simple API for tracking request performance metrics
 * that works with any JavaScript application (Express, Fastify, Koa, vanilla Node.js,
 * serverless functions, or even browser applications).
 *
 * Usage:
 *
 * 1. Create a metrics tracker:
 *    const metrics = CreateMetrics({ token: 'your-project-token' });
 *
 * 2. Track requests manually:
 *    const end = metrics.startRequest();
 *    // ... handle request ...
 *    end({ statusCode: 200, bytesIn: 1024, bytesOut: 2048 });
 *
 * 3. Or use the trackRequest helper:
 *    await metrics.trackRequest(async () => {
 *      // ... your handler code ...
 *      return { statusCode: 200 };
 *    });
 *
 * 4. Flush on shutdown:
 *    await metrics.destroy();
 */

export interface MetricsConfig {
  token: string;
  endpoint?: string;
  flushInterval?: number; // ms, default 60000 (1 minute)
  disabled?: boolean;
}

export interface RequestEndOptions {
  statusCode?: number;
  bytesIn?: number;
  bytesOut?: number;
  path?: string;
  method?: string;
}

interface MetricBucket {
  timestamp: Date;
  path: string | null;
  method: string | null;
  requestCount: number;
  totalDurationMs: number;
  minDurationMs: number | null;
  maxDurationMs: number | null;
  totalBytesIn: number;
  totalBytesOut: number;
  status2xx: number;
  status3xx: number;
  status4xx: number;
  status5xx: number;
}

/**
 * Round a date to the start of its minute
 */
function roundToMinute(date: Date): Date {
  const rounded = new Date(date);
  rounded.setSeconds(0, 0);
  return rounded;
}

/**
 * Get the bucket key for a timestamp, path, and method
 */
function getBucketKey(
  date: Date,
  path: string | null,
  method: string | null,
): string {
  const timeKey = roundToMinute(date).toISOString();
  return `${timeKey}|${path ?? ""}|${method ?? ""}`;
}

/**
 * Categorize a status code into 2xx, 3xx, 4xx, or 5xx
 */
function getStatusCategory(
  statusCode: number,
): "2xx" | "3xx" | "4xx" | "5xx" | null {
  if (statusCode >= 200 && statusCode < 300) return "2xx";
  if (statusCode >= 300 && statusCode < 400) return "3xx";
  if (statusCode >= 400 && statusCode < 500) return "4xx";
  if (statusCode >= 500 && statusCode < 600) return "5xx";
  return null;
}

export const CreateMetrics = (config: MetricsConfig) => {
  const {
    token,
    endpoint = "https://loggy.dev/api/metrics/ingest",
    flushInterval = 60000,
    disabled = false,
  } = config;

  // Metric buckets keyed by minute timestamp
  const buckets: Map<string, MetricBucket> = new Map();
  let flushTimer: ReturnType<typeof setInterval> | null = null;

  /**
   * Get or create a bucket for the given timestamp, path, and method
   */
  const getOrCreateBucket = (
    timestamp: Date,
    path: string | null,
    method: string | null,
  ): MetricBucket => {
    const key = getBucketKey(timestamp, path, method);
    let bucket = buckets.get(key);

    if (!bucket) {
      bucket = {
        timestamp: roundToMinute(timestamp),
        path,
        method,
        requestCount: 0,
        totalDurationMs: 0,
        minDurationMs: null,
        maxDurationMs: null,
        totalBytesIn: 0,
        totalBytesOut: 0,
        status2xx: 0,
        status3xx: 0,
        status4xx: 0,
        status5xx: 0,
      };
      buckets.set(key, bucket);
    }

    return bucket;
  };

  /**
   * Record a completed request into the appropriate bucket
   */
  const recordRequest = (
    startTime: Date,
    durationMs: number,
    options: RequestEndOptions = {},
  ): void => {
    const path = options.path ?? null;
    const method = options.method?.toUpperCase() ?? null;
    const bucket = getOrCreateBucket(startTime, path, method);

    bucket.requestCount++;
    bucket.totalDurationMs += durationMs;

    if (bucket.minDurationMs === null || durationMs < bucket.minDurationMs) {
      bucket.minDurationMs = durationMs;
    }
    if (bucket.maxDurationMs === null || durationMs > bucket.maxDurationMs) {
      bucket.maxDurationMs = durationMs;
    }

    if (options.bytesIn) {
      bucket.totalBytesIn += options.bytesIn;
    }
    if (options.bytesOut) {
      bucket.totalBytesOut += options.bytesOut;
    }

    if (options.statusCode) {
      const category = getStatusCategory(options.statusCode);
      if (category === "2xx") bucket.status2xx++;
      else if (category === "3xx") bucket.status3xx++;
      else if (category === "4xx") bucket.status4xx++;
      else if (category === "5xx") bucket.status5xx++;
    }
  };

  /**
   * Flush all collected metrics to the server
   */
  const flush = async (): Promise<void> => {
    if (disabled || buckets.size === 0) return;

    // Get all buckets except the current minute (still collecting)
    const now = new Date();
    const currentTimeKey = roundToMinute(now).toISOString();

    const bucketsToSend: MetricBucket[] = [];
    const keysToDelete: string[] = [];

    for (const [key, bucket] of buckets) {
      // Check if bucket is from current minute (key starts with current time)
      if (!key.startsWith(currentTimeKey)) {
        bucketsToSend.push(bucket);
        keysToDelete.push(key);
      }
    }

    if (bucketsToSend.length === 0) return;

    // Remove sent buckets from map
    for (const key of keysToDelete) {
      buckets.delete(key);
    }

    // Transform to API format
    const metrics = bucketsToSend.map((b) => ({
      timestamp: b.timestamp.toISOString(),
      path: b.path ?? undefined,
      method: b.method ?? undefined,
      requestCount: b.requestCount,
      totalDurationMs: b.totalDurationMs,
      minDurationMs: b.minDurationMs ?? undefined,
      maxDurationMs: b.maxDurationMs ?? undefined,
      totalBytesIn: b.totalBytesIn,
      totalBytesOut: b.totalBytesOut,
      status2xx: b.status2xx,
      status3xx: b.status3xx,
      status4xx: b.status4xx,
      status5xx: b.status5xx,
    }));

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-loggy-token": token,
        },
        body: JSON.stringify({ metrics }),
      });

      if (!response.ok) {
        // Re-add failed buckets for retry
        for (const bucket of bucketsToSend) {
          const key = getBucketKey(
            bucket.timestamp,
            bucket.path,
            bucket.method,
          );
          const existing = buckets.get(key);
          if (existing) {
            // Merge with any new data
            existing.requestCount += bucket.requestCount;
            existing.totalDurationMs += bucket.totalDurationMs;
            existing.totalBytesIn += bucket.totalBytesIn;
            existing.totalBytesOut += bucket.totalBytesOut;
            existing.status2xx += bucket.status2xx;
            existing.status3xx += bucket.status3xx;
            existing.status4xx += bucket.status4xx;
            existing.status5xx += bucket.status5xx;
            if (
              bucket.minDurationMs !== null &&
              (existing.minDurationMs === null ||
                bucket.minDurationMs < existing.minDurationMs)
            ) {
              existing.minDurationMs = bucket.minDurationMs;
            }
            if (
              bucket.maxDurationMs !== null &&
              (existing.maxDurationMs === null ||
                bucket.maxDurationMs > existing.maxDurationMs)
            ) {
              existing.maxDurationMs = bucket.maxDurationMs;
            }
          } else {
            buckets.set(key, bucket);
          }
        }
      }
    } catch {
      // Re-add failed buckets for retry
      for (const bucket of bucketsToSend) {
        const key = getBucketKey(bucket.timestamp, bucket.path, bucket.method);
        if (!buckets.has(key)) {
          buckets.set(key, bucket);
        }
      }
    }
  };

  // Start flush timer
  if (!disabled) {
    flushTimer = setInterval(flush, flushInterval);
  }

  /**
   * Start tracking a request. Returns a function to call when the request ends.
   *
   * @example
   * const end = metrics.startRequest();
   * // ... handle request ...
   * end({ statusCode: 200, bytesIn: 1024, bytesOut: 2048 });
   */
  const startRequest = (): ((options?: RequestEndOptions) => void) => {
    const startTime = new Date();
    const startMs = performance.now();

    return (options: RequestEndOptions = {}) => {
      const durationMs = Math.round(performance.now() - startMs);
      recordRequest(startTime, durationMs, options);
    };
  };

  /**
   * Track a request by wrapping an async handler function.
   * Automatically measures duration and records the result.
   *
   * @example
   * const result = await metrics.trackRequest(async () => {
   *   const response = await handleRequest(req);
   *   return {
   *     statusCode: response.status,
   *     bytesOut: response.body.length,
   *     result: response
   *   };
   * });
   */
  const trackRequest = async <T>(
    handler: () => Promise<
      T & { statusCode?: number; bytesIn?: number; bytesOut?: number }
    >,
  ): Promise<T> => {
    const end = startRequest();
    try {
      const result = await handler();
      end({
        statusCode: result.statusCode,
        bytesIn: result.bytesIn,
        bytesOut: result.bytesOut,
      });
      return result;
    } catch (err) {
      end({ statusCode: 500 });
      throw err;
    }
  };

  /**
   * Record a request that has already completed.
   * Useful when you have timing data from another source.
   *
   * @example
   * metrics.record({
   *   durationMs: 150,
   *   statusCode: 200,
   *   bytesIn: 1024,
   *   bytesOut: 4096
   * });
   */
  const record = (data: {
    durationMs: number;
    statusCode?: number;
    bytesIn?: number;
    bytesOut?: number;
    timestamp?: Date;
  }): void => {
    const timestamp = data.timestamp || new Date();
    recordRequest(timestamp, data.durationMs, {
      statusCode: data.statusCode,
      bytesIn: data.bytesIn,
      bytesOut: data.bytesOut,
    });
  };

  /**
   * Get current pending metrics count (for debugging)
   */
  const getPendingCount = (): number => {
    let count = 0;
    for (const bucket of buckets.values()) {
      count += bucket.requestCount;
    }
    return count;
  };

  /**
   * Flush and stop the metrics tracker.
   * Call this on application shutdown.
   */
  const destroy = async (): Promise<void> => {
    if (flushTimer) {
      clearInterval(flushTimer);
      flushTimer = null;
    }
    // Force flush all buckets including current
    const allBuckets = Array.from(buckets.values());
    buckets.clear();

    if (allBuckets.length === 0 || disabled) return;

    const metrics = allBuckets.map((b) => ({
      timestamp: b.timestamp.toISOString(),
      requestCount: b.requestCount,
      totalDurationMs: b.totalDurationMs,
      minDurationMs: b.minDurationMs ?? undefined,
      maxDurationMs: b.maxDurationMs ?? undefined,
      totalBytesIn: b.totalBytesIn,
      totalBytesOut: b.totalBytesOut,
      status2xx: b.status2xx,
      status3xx: b.status3xx,
      status4xx: b.status4xx,
      status5xx: b.status5xx,
    }));

    try {
      await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-loggy-token": token,
        },
        body: JSON.stringify({ metrics }),
      });
    } catch {
      // Ignore errors on shutdown
    }
  };

  return {
    startRequest,
    trackRequest,
    record,
    flush,
    destroy,
    getPendingCount,
  };
};

export type LoggyMetrics = ReturnType<typeof CreateMetrics>;
