package ro.filegrid;

import io.micrometer.core.instrument.MeterRegistry;
import java.util.concurrent.TimeUnit;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

@Component
class OperationMetrics {
  private final JdbcTemplate db;
  private final MeterRegistry registry;

  OperationMetrics(JdbcTemplate db, MeterRegistry registry) {
    this.db = db;
    this.registry = registry;
  }

  void record(
      String category,
      String storage,
      String operation,
      long started,
      long bytes,
      boolean success) {
    // Throughput counts acknowledged payload bytes; failed operations contribute zero.
    bytes = success ? bytes : 0;
    long nanos = System.nanoTime() - started;
    org.slf4j.LoggerFactory.getLogger(OperationMetrics.class)
        .info(
            "storage_operation category={} storage={} operation={} bytes={} durationMs={}"
                + " success={}",
            category,
            storage,
            operation,
            bytes,
            nanos / 1_000_000.0,
            success);
    registry
        .timer(
            "filegrid.operation",
            "category",
            category,
            "storage",
            storage,
            "operation",
            operation,
            "outcome",
            success ? "success" : "error")
        .record(nanos, TimeUnit.NANOSECONDS);
    registry
        .counter("filegrid.bytes", "category", category, "storage", storage, "operation", operation)
        .increment(bytes);
    try {
      db.update(
          "INSERT INTO"
              + " operations(category,storage,operation,duration_ms,bytes,success,correlation_id)"
              + " VALUES (?,?,?,?,?,?,?)",
          category,
          storage,
          operation,
          nanos / 1_000_000.0,
          bytes,
          success,
          org.slf4j.MDC.get("correlationId"));
    } catch (Exception ignored) {
      /* metrics cannot change the acknowledged result */
    }
  }
}
