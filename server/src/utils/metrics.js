import mongoose from 'mongoose';

/**
 * Lightweight, in-memory performance & operational metrics registry.
 * Tracks HTTP request volume, status codes, latency percentiles, and Socket.IO
 * connection states without introducing external infrastructure (e.g. Redis).
 */
class MetricsRegistry {
  constructor() {
    this.reset();
  }

  reset() {
    this.startTime = Date.now();
    this.http = {
      totalRequests: 0,
      status2xx: 0,
      status3xx: 0,
      status4xx: 0,
      status5xx: 0,
      durations: [], // bounded buffer for latency percentiles
      maxDurationsStored: 1000,
      byMethod: {},
    };
    this.socket = {
      activeConnections: 0,
      totalConnections: 0,
      totalDisconnections: 0,
      byDisconnectReason: {},
      authFailures: 0,
      messageFailures: 0,
    };
    this.database = {
      disconnectCount: 0,
      reconnectCount: 0,
      errorCount: 0,
    };
  }

  // ─── HTTP Tracking ─────────────────────────────────────────────────────────
  recordHttpRequest({ method, statusCode, durationMs }) {
    this.http.totalRequests += 1;

    // Status code buckets
    if (statusCode >= 200 && statusCode < 300) this.http.status2xx += 1;
    else if (statusCode >= 300 && statusCode < 400) this.http.status3xx += 1;
    else if (statusCode >= 400 && statusCode < 500) this.http.status4xx += 1;
    else if (statusCode >= 500) this.http.status5xx += 1;

    // Method breakdown
    const m = (method || 'UNKNOWN').toUpperCase();
    this.http.byMethod[m] = (this.http.byMethod[m] || 0) + 1;

    // Latency sample (bounded ring buffer)
    if (typeof durationMs === 'number' && !isNaN(durationMs)) {
      if (this.http.durations.length >= this.http.maxDurationsStored) {
        this.http.durations.shift();
      }
      this.http.durations.push(durationMs);
    }
  }

  // ─── Socket.IO Tracking ───────────────────────────────────────────────────
  recordSocketConnect() {
    this.socket.activeConnections += 1;
    this.socket.totalConnections += 1;
  }

  recordSocketDisconnect(reason = 'unknown') {
    this.socket.activeConnections = Math.max(0, this.socket.activeConnections - 1);
    this.socket.totalDisconnections += 1;
    this.socket.byDisconnectReason[reason] = (this.socket.byDisconnectReason[reason] || 0) + 1;
  }

  recordSocketAuthFailure() {
    this.socket.authFailures += 1;
  }

  recordSocketMessageFailure() {
    this.socket.messageFailures += 1;
  }

  // ─── Database Tracking ─────────────────────────────────────────────────────
  recordDbDisconnect() {
    this.database.disconnectCount += 1;
  }

  recordDbReconnect() {
    this.database.reconnectCount += 1;
  }

  recordDbError() {
    this.database.errorCount += 1;
  }

  // ─── Metrics Snapshot ──────────────────────────────────────────────────────
  getSnapshot() {
    const memory = process.memoryUsage();
    const durations = [...this.http.durations].sort((a, b) => a - b);

    let avgLatencyMs = 0;
    let p95LatencyMs = 0;

    if (durations.length > 0) {
      const sum = durations.reduce((acc, val) => acc + val, 0);
      avgLatencyMs = Math.round((sum / durations.length) * 100) / 100;
      const p95Index = Math.floor(durations.length * 0.95);
      p95LatencyMs = Math.round(durations[Math.min(p95Index, durations.length - 1)] * 100) / 100;
    }

    const dbStateMap = {
      0: 'disconnected',
      1: 'connected',
      2: 'connecting',
      3: 'disconnecting',
    };

    return {
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      http: {
        totalRequests: this.http.totalRequests,
        status2xx: this.http.status2xx,
        status3xx: this.http.status3xx,
        status4xx: this.http.status4xx,
        status5xx: this.http.status5xx,
        errorRatePercent:
          this.http.totalRequests > 0
            ? Math.round(((this.http.status4xx + this.http.status5xx) / this.http.totalRequests) * 10000) / 100
            : 0,
        avgLatencyMs,
        p95LatencyMs,
        byMethod: { ...this.http.byMethod },
      },
      socket: {
        activeConnections: this.socket.activeConnections,
        totalConnections: this.socket.totalConnections,
        totalDisconnections: this.socket.totalDisconnections,
        authFailures: this.socket.authFailures,
        messageFailures: this.socket.messageFailures,
        byDisconnectReason: { ...this.socket.byDisconnectReason },
      },
      database: {
        status: dbStateMap[mongoose.connection?.readyState] || 'disconnected',
        readyState: mongoose.connection?.readyState ?? 0,
        disconnectCount: this.database.disconnectCount,
        reconnectCount: this.database.reconnectCount,
        errorCount: this.database.errorCount,
      },
      system: {
        rssMb: Math.round((memory.rss / (1024 * 1024)) * 100) / 100,
        heapUsedMb: Math.round((memory.heapUsed / (1024 * 1024)) * 100) / 100,
        heapTotalMb: Math.round((memory.heapTotal / (1024 * 1024)) * 100) / 100,
      },
    };
  }
}

export const metrics = new MetricsRegistry();
export default metrics;
