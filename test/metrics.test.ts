import { CreateMetrics } from "../src/metrics";

// Mock fetch
const mockFetch = jest.fn();
global.fetch = mockFetch as any;

// Mock performance.now
let mockTime = 0;
const originalPerformanceNow = performance.now;
beforeAll(() => {
  (performance as any).now = () => mockTime;
});
afterAll(() => {
  (performance as any).now = originalPerformanceNow;
});

beforeEach(() => {
  mockFetch.mockReset();
  mockTime = 0;
});

describe("CreateMetrics", () => {
  describe("startRequest", () => {
    it("should track request duration", () => {
      const metrics = CreateMetrics({
        token: "test-token",
        disabled: true, // Disable network calls for unit tests
      });

      mockTime = 0;
      const end = metrics.startRequest();

      mockTime = 150; // Simulate 150ms elapsed
      end({ statusCode: 200 });

      expect(metrics.getPendingCount()).toBe(1);
      metrics.destroy();
    });

    it("should track status codes", () => {
      const metrics = CreateMetrics({
        token: "test-token",
        disabled: true,
      });

      const end1 = metrics.startRequest();
      end1({ statusCode: 200 });

      const end2 = metrics.startRequest();
      end2({ statusCode: 404 });

      const end3 = metrics.startRequest();
      end3({ statusCode: 500 });

      expect(metrics.getPendingCount()).toBe(3);
      metrics.destroy();
    });

    it("should track bytes in/out", () => {
      const metrics = CreateMetrics({
        token: "test-token",
        disabled: true,
      });

      const end = metrics.startRequest();
      end({ statusCode: 200, bytesIn: 1024, bytesOut: 2048 });

      expect(metrics.getPendingCount()).toBe(1);
      metrics.destroy();
    });
  });

  describe("trackRequest", () => {
    it("should wrap async handlers", async () => {
      const metrics = CreateMetrics({
        token: "test-token",
        disabled: true,
      });

      const result = await metrics.trackRequest(async () => {
        return { statusCode: 200, data: "test" };
      });

      expect(result.data).toBe("test");
      expect(metrics.getPendingCount()).toBe(1);
      metrics.destroy();
    });

    it("should record 500 on error", async () => {
      const metrics = CreateMetrics({
        token: "test-token",
        disabled: true,
      });

      await expect(
        metrics.trackRequest(async () => {
          throw new Error("Test error");
        }),
      ).rejects.toThrow("Test error");

      expect(metrics.getPendingCount()).toBe(1);
      metrics.destroy();
    });
  });

  describe("record", () => {
    it("should record pre-measured requests", () => {
      const metrics = CreateMetrics({
        token: "test-token",
        disabled: true,
      });

      metrics.record({
        durationMs: 100,
        statusCode: 200,
        bytesIn: 512,
        bytesOut: 1024,
      });

      expect(metrics.getPendingCount()).toBe(1);
      metrics.destroy();
    });

    it("should accept custom timestamp", () => {
      const metrics = CreateMetrics({
        token: "test-token",
        disabled: true,
      });

      const pastTime = new Date(Date.now() - 60000);
      metrics.record({
        durationMs: 100,
        statusCode: 200,
        timestamp: pastTime,
      });

      expect(metrics.getPendingCount()).toBe(1);
      metrics.destroy();
    });
  });

  describe("flush", () => {
    it("should send metrics to endpoint", async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });

      const metrics = CreateMetrics({
        token: "test-token",
        endpoint: "https://test.loggy.dev/api/metrics/ingest",
        flushInterval: 100000, // Long interval so we control flush
      });

      // Record a request in the past minute
      const pastTime = new Date(Date.now() - 120000); // 2 minutes ago
      metrics.record({
        durationMs: 100,
        statusCode: 200,
        timestamp: pastTime,
      });

      await metrics.flush();

      expect(mockFetch).toHaveBeenCalledWith(
        "https://test.loggy.dev/api/metrics/ingest",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            "Content-Type": "application/json",
            "x-loggy-token": "test-token",
          }),
        }),
      );

      await metrics.destroy();
    });

    it("should not flush current minute bucket", async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });

      const metrics = CreateMetrics({
        token: "test-token",
        flushInterval: 100000,
      });

      // Record in current minute
      metrics.record({
        durationMs: 100,
        statusCode: 200,
      });

      await metrics.flush();

      // Should not have called fetch since data is in current minute
      expect(mockFetch).not.toHaveBeenCalled();

      await metrics.destroy();
    });

    it("should retry on failure", async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });

      const metrics = CreateMetrics({
        token: "test-token",
        flushInterval: 100000,
      });

      const pastTime = new Date(Date.now() - 120000);
      metrics.record({
        durationMs: 100,
        statusCode: 200,
        timestamp: pastTime,
      });

      await metrics.flush();

      // Data should still be pending after failed flush
      expect(metrics.getPendingCount()).toBe(1);

      await metrics.destroy();
    });
  });

  describe("destroy", () => {
    it("should flush all data including current minute", async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });

      const metrics = CreateMetrics({
        token: "test-token",
        flushInterval: 100000,
      });

      metrics.record({
        durationMs: 100,
        statusCode: 200,
      });

      await metrics.destroy();

      expect(mockFetch).toHaveBeenCalled();
      expect(metrics.getPendingCount()).toBe(0);
    });
  });
});
