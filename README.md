# Loggy Node

A simple, lightweight, and pretty logger for Node.js applications.

[![npm version](https://img.shields.io/npm/v/@loggydev/loggy-node.svg)](https://www.npmjs.com/package/@loggydev/loggy-node)

## Features

- **Colorful output** with customizable colors via Chalk
- **Log levels** - debug, info, warn, error
- **Timestamps** - optional timestamp prefixes
- **Object inspection** - pretty-print objects and arrays
- **Compact mode** - condensed output for JSON objects
- **Identifiers** - tag logs with your app/service name
- **Remote logging** - send logs to Loggy.dev for centralized viewing

## Installation

```bash
npm install @loggydev/loggy-node
# or
yarn add @loggydev/loggy-node
```

## Usage

```javascript
import { CreateLoggy } from "@loggydev/loggy-node";

const loggy = CreateLoggy({
  identifier: "my-app", // identifier for your application
  color: true,          // enable colored output (default: true)
  compact: false,       // compact mode for objects (default: false)
  timestamp: true       // show timestamps (default: true)
});

loggy.log("This is a log message");
loggy.info("This is an info message");
loggy.warn("This is a warn message");
loggy.error("This is an error message");

// Log with additional data
loggy.info("User logged in", { userId: 123, email: "user@example.com" });

// Add blank lines
loggy.blank(2);
```

### Remote Logging (Loggy.dev)

Send your logs to Loggy.dev for centralized viewing and searching:

```javascript
import { CreateLoggy } from "@loggydev/loggy-node";

const loggy = CreateLoggy({
  identifier: "my-app",
  remote: {
    token: "your-project-token",     // Get this from loggy.dev dashboard
    endpoint: "https://loggy.dev/api/logs/ingest", // Optional, defaults to loggy.dev
    batchSize: 50,                   // Optional, logs to batch before sending (default: 50)
    flushInterval: 5000,             // Optional, ms between flushes (default: 5000)
  }
});

loggy.info("This log will appear locally AND on loggy.dev");

// Manually flush logs (useful before process exit)
await loggy.flush();

// Clean up on shutdown (stops timer and flushes remaining logs)
await loggy.destroy();
```

## Configuration Options

| Option       | Type    | Default | Description                              |
| :----------- | :------ | :------ | :--------------------------------------- |
| `identifier` | string  | -       | Label for your app/service               |
| `color`      | boolean | `true`  | Enable colored output                    |
| `compact`    | boolean | `false` | Compact mode for object inspection       |
| `timestamp`  | boolean | `true`  | Show timestamps in log output            |
| `remote`     | object  | -       | Remote logging configuration (see below) |

### Remote Configuration

| Option          | Type   | Default                          | Description                        |
| :-------------- | :----- | :------------------------------- | :--------------------------------- |
| `token`         | string | -                                | Project token from loggy.dev       |
| `endpoint`      | string | `https://loggy.dev/api/logs/ingest`  | API endpoint for log ingestion     |
| `batchSize`     | number | `50`                             | Logs to batch before sending       |
| `flushInterval` | number | `5000`                           | Milliseconds between auto-flushes  |
| `publicKey`     | string | -                                | RSA public key for end-to-end encryption |

### Auto-Capture (Smart Defaults)

Automatically capture all `console.log`, `console.warn`, `console.error`, and `console.info` calls without changing your existing code:

```javascript
import { CreateLoggy } from "@loggydev/loggy-node";

const loggy = CreateLoggy({
  identifier: "my-app",
  remote: {
    token: "your-project-token",
  },
  capture: {
    console: true,     // Capture all console.* calls
    exceptions: true,  // Capture uncaught exceptions and unhandled rejections
  }
});

// Now all console.log calls are automatically sent to Loggy!
console.log("This will appear in your Loggy dashboard");
console.error("Errors too!");

// You can still use loggy methods directly for more control
loggy.info("Direct log with metadata", { userId: 123 });

// Restore original console methods if needed
loggy.restoreConsole();

// Re-enable capture
loggy.enableConsoleCapture();

// Clean up on shutdown
await loggy.destroy();
```

#### Capture Configuration

| Option       | Type    | Default | Description                                      |
| :----------- | :------ | :------ | :----------------------------------------------- |
| `console`    | boolean | `false` | Capture console.log/info/warn/error calls        |
| `exceptions` | boolean | `false` | Capture uncaught exceptions and promise rejections |

### End-to-End Encryption

For sensitive log data, you can enable end-to-end encryption. Logs are encrypted on your system before being sent to Loggy.dev, ensuring that even in transit, the payload is unreadable without the server's private key.

```javascript
import { CreateLoggy } from "@loggydev/loggy-node";

// Fetch the public key from Loggy.dev (or use a bundled key)
const response = await fetch("https://loggy.dev/api/logs/public-key");
const { publicKey } = await response.json();

const loggy = CreateLoggy({
  identifier: "my-secure-app",
  remote: {
    token: "your-project-token",
    publicKey, // Enable encryption
  }
});

// All logs are now encrypted before leaving your system
loggy.info("Sensitive data", { ssn: "123-45-6789", creditCard: "****" });
```

**How it works:**
1. A random AES-256-GCM key is generated for each batch of logs
2. Logs are encrypted with the AES key
3. The AES key is encrypted with Loggy's RSA public key
4. Only Loggy's server can decrypt the payload with its private key

## Performance Metrics (Pro/Team)

Track request-per-minute (RPM) and throughput metrics for your services. This feature is available for Pro and Team subscribers.

```javascript
import { CreateMetrics } from "@loggydev/loggy-node";

const metrics = CreateMetrics({
  token: "your-project-token",     // Same token as logging
  endpoint: "https://loggy.dev/api/metrics/ingest", // Optional
  flushInterval: 60000,            // Optional, ms between flushes (default: 60000)
});

// Option 1: Manual tracking with startRequest
app.get("/api/users", async (req, res) => {
  const end = metrics.startRequest();
  
  // ... handle request ...
  
  end({
    statusCode: res.statusCode,
    bytesIn: req.headers["content-length"],
    bytesOut: responseBody.length,
  });
});

// Option 2: Wrap async handlers with trackRequest
const result = await metrics.trackRequest(async () => {
  const response = await handleRequest(req);
  return {
    statusCode: response.status,
    bytesOut: response.body.length,
    ...response, // Your data passes through
  };
});

// Option 3: Record pre-measured requests
metrics.record({
  durationMs: 150,
  statusCode: 200,
  bytesIn: 1024,
  bytesOut: 4096,
  timestamp: new Date(), // Optional, defaults to now
});

// Clean up on shutdown
await metrics.destroy();
```

### Metrics Configuration

| Option          | Type    | Default                              | Description                        |
| :-------------- | :------ | :----------------------------------- | :--------------------------------- |
| `token`         | string  | -                                    | Project token from loggy.dev       |
| `endpoint`      | string  | `https://loggy.dev/api/metrics/ingest` | API endpoint for metrics ingestion |
| `flushInterval` | number  | `60000`                              | Milliseconds between auto-flushes  |
| `disabled`      | boolean | `false`                              | Disable metrics collection         |

### What Gets Tracked

- **Requests per minute** - Total request count per minute bucket
- **Response times** - Average, min, and max duration
- **Throughput** - Bytes in/out
- **Status codes** - Breakdown by 2xx, 3xx, 4xx, 5xx

### Retention

- **Pro tier**: 7 days of per-minute data
- **Team tier**: 30 days of per-minute data

## Distributed Tracing (Pro/Team)

Track requests as they flow through your microservices with distributed tracing. See exactly where time is spent and identify bottlenecks.

### Basic Setup

```javascript
import { CreateTracer, createTracingMiddleware } from "@loggydev/loggy-node";

const tracer = CreateTracer({
  serviceName: "api-gateway",
  serviceVersion: "1.0.0",
  environment: "production",
  remote: {
    token: "your-project-token",
    endpoint: "https://loggy.dev/api/traces/ingest", // Optional
    batchSize: 100,      // Optional, spans to batch (default: 100)
    flushInterval: 5000, // Optional, ms between flushes (default: 5000)
  },
});

// Add Express middleware for automatic request tracing
app.use(createTracingMiddleware({ tracer }));
```

### Manual Span Creation

Track specific operations like database queries or external API calls:

```javascript
// Start a span for a database query
const span = tracer.startSpan("db.query", {
  kind: "client",
  attributes: {
    "db.system": "postgresql",
    "db.statement": "SELECT * FROM users WHERE id = $1",
  },
});

try {
  const result = await db.query("SELECT * FROM users WHERE id = $1", [userId]);
  span.setStatus("ok");
  return result;
} catch (err) {
  span.setStatus("error", err.message);
  span.addEvent("exception", {
    "exception.type": err.name,
    "exception.message": err.message,
  });
  throw err;
} finally {
  span.end();
}
```

### Using the withSpan Helper

Wrap async operations with automatic span management:

```javascript
import { withSpan } from "@loggydev/loggy-node";

const result = await withSpan(tracer, "fetchUserData", async () => {
  const user = await db.query("SELECT * FROM users WHERE id = $1", [userId]);
  return user;
}, { "user.id": userId });
```

### Context Propagation

Pass trace context to downstream services using W3C Trace Context headers:

```javascript
// Inject trace context into outgoing requests
const headers = tracer.inject({});
const response = await fetch("http://user-service/api/users/123", { headers });

// Extract trace context from incoming requests (done automatically by middleware)
const parentContext = tracer.extract(req.headers);
const span = tracer.startSpan("handle-request", { parent: parentContext });
```

### Log Correlation

Link logs to traces for unified debugging:

```javascript
const context = tracer.getCurrentContext();

loggy.info("Processing request", {
  traceId: context.traceId,
  spanId: context.spanId,
  userId: user.id,
});
```

### Tracer Configuration

| Option           | Type   | Default                              | Description                        |
| :--------------- | :----- | :----------------------------------- | :--------------------------------- |
| `serviceName`    | string | -                                    | Name of your service (required)    |
| `serviceVersion` | string | -                                    | Version of your service            |
| `environment`    | string | -                                    | Deployment environment             |
| `remote.token`   | string | -                                    | Project token from loggy.dev       |
| `remote.endpoint`| string | `https://loggy.dev/api/traces/ingest`| API endpoint for trace ingestion   |
| `remote.batchSize`| number| `100`                                | Spans to batch before sending      |
| `remote.flushInterval`| number | `5000`                          | Milliseconds between auto-flushes  |
| `remote.publicKey`| string| -                                    | RSA public key for encryption      |

### Span Kinds

- `server` - Incoming request handler
- `client` - Outgoing request to another service
- `producer` - Message queue producer
- `consumer` - Message queue consumer
- `internal` - Internal operation (default)

### Retention

- **Pro tier**: 7 days, 100k traces/month, 100 spans/trace
- **Team tier**: 30 days, 1M traces/month, 500 spans/trace, service map

## Log Levels

Use the appropriate method for each log level:

- `loggy.log()` - General logging (debug level)
- `loggy.info()` - Informational messages
- `loggy.warn()` - Warning messages
- `loggy.error()` - Error messages

## Development

### Prerequisites

- Node.js 18+
- Yarn or npm

### Setup

```bash
# Install dependencies
yarn install

# Run tests
yarn test

# Run sample logs
yarn test:sample

# Build for production
yarn build
```

## Publishing to npm

To publish a new version:

1. Update the version in `package.json`
2. Run the publish script:

```bash
yarn npm:publish
```

This will compile TypeScript and publish to npm with public access.

### Manual Publishing

```bash
# Build TypeScript
yarn build

# Publish to npm (requires npm login)
npm publish --access public
```

## License

ISC# loggy-node
