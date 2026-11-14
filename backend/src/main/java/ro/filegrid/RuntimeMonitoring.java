package ro.filegrid;

import io.micrometer.core.instrument.*;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicReference;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
public class RuntimeMonitoring {
  private final JdbcTemplate db;
  private final MeterRegistry registry;
  private final Map<String, AtomicReference<Double>> gauges = new ConcurrentHashMap<>();

  RuntimeMonitoring(JdbcTemplate db, MeterRegistry registry) {
    this.db = db;
    this.registry = registry;
  }

  void set(String name, String category, double value) {
    String key = name + category;
    var ref =
        gauges.computeIfAbsent(
            key,
            k -> {
              var v = new AtomicReference<>(0.0);
              registry.gauge(name, List.of(Tag.of("category", category)), v, x -> x.get());
              return v;
            });
    ref.set(value);
  }

  @Scheduled(fixedDelay = 5000, initialDelayString = "${filegrid.monitor-initial-delay:5000}")
  public void sample() {
    try {
      for (String category : List.of("INCIDENT", "CONNECTION_DOCUMENT", "DRONE_VIDEO")) {
        var row =
            db.queryForMap(
                "SELECT count(*) AS pending,coalesce(extract(epoch from now()-min(j.created_at)),0)"
                    + " AS age FROM jobs j JOIN files f ON f.id=j.resource_id WHERE j.kind='VERIFY'"
                    + " AND j.state IN ('PENDING','RUNNING') AND f.category=?",
                category);
        set("filegrid.verification.pending", category, ((Number) row.get("pending")).doubleValue());
        set(
            "filegrid.verification.oldest.seconds",
            category,
            ((Number) row.get("age")).doubleValue());
      }
      var ml =
          db.queryForMap(
              "SELECT count(*) AS pending,coalesce(extract(epoch from now()-min(created_at)),0) AS"
                  + " age FROM jobs WHERE kind='ML' AND state IN ('PENDING','RUNNING')");
      set("filegrid.ml.pending", "INCIDENT", ((Number) ml.get("pending")).doubleValue());
      set("filegrid.ml.oldest.seconds", "INCIDENT", ((Number) ml.get("age")).doubleValue());
      set(
          "filegrid.integrity.recent.failures",
          "ALL",
          db.queryForObject(
              "SELECT count(*) FROM audit_events WHERE outcome='CORRUPTED' AND"
                  + " created_at>now()-interval '5 minutes'",
              Double.class));
      set(
          "filegrid.meter.sequence.gaps",
          "METER_READING",
          db.queryForObject(
              "SELECT coalesce(sum(sequence_number-previous-1),0) FROM (SELECT m.sequence_number,"
                  + " lag(m.sequence_number,1,0::bigint) OVER(PARTITION BY m.meter_id ORDER BY"
                  + " m.sequence_number) AS previous, f.created_at FROM meter_readings m JOIN files"
                  + " f ON f.id=m.file_id) x WHERE sequence_number>previous+1 AND"
                  + " created_at<now()-interval '60 seconds'",
              Double.class));
      set(
          "filegrid.uploads.stalled",
          "DRONE_VIDEO",
          db.queryForObject(
              "SELECT count(*) FROM upload_sessions s JOIN files f ON f.id=s.file_id WHERE"
                  + " f.category='DRONE_VIDEO' AND s.state='UPLOADING' AND"
                  + " s.last_activity_at<now()-interval '5 minutes'",
              Double.class));
      set("filegrid.metadata.available", "ALL", 1);
    } catch (org.springframework.dao.DataAccessException e) {
      set("filegrid.metadata.available", "ALL", 0);
    }
  }
}
