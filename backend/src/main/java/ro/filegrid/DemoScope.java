package ro.filegrid;

import java.util.function.Supplier;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

/** Explicit request scope for the always-available synthetic demo workspace. */
@Component
class DemoScope {
  private static final ThreadLocal<Boolean> OVERRIDE = new ThreadLocal<>();
  private final JdbcTemplate db;

  DemoScope(JdbcTemplate db) {
    this.db = db;
  }

  boolean enabled() { return true; }

  boolean scoped() {
    Boolean override = OVERRIDE.get();
    if (override != null) return override;
    var attributes = RequestContextHolder.getRequestAttributes();
    return attributes instanceof ServletRequestAttributes servlet
        && "true".equalsIgnoreCase(servlet.getRequest().getHeader("X-FileGrid-Demo"));
  }

  void verifyMeterEpoch() {
    if (!scoped()) return;
    var attributes = RequestContextHolder.getRequestAttributes();
    if (attributes instanceof ServletRequestAttributes servlet) {
      String epoch = servlet.getRequest().getHeader("X-FileGrid-Demo-Epoch");
      if (epoch != null) ApiProblem.require(epoch.equals(db.queryForObject("SELECT initialized_at::text FROM demo_state WHERE id=1",String.class)),409,"DEMO_EPOCH_CHANGED","Demo was reset; refresh simulator configuration");
    }
  }

  <T> T asDemo(Supplier<T> action) {
    Boolean previous = OVERRIDE.get();
    OVERRIDE.set(true);
    try { return action.get(); }
    finally {
      if (previous == null) OVERRIDE.remove();
      else OVERRIDE.set(previous);
    }
  }

  void register(String type, Object id) {
    if (scoped()) registerAlways(type, id);
  }

  void registerAlways(String type, Object id) {
    db.update(
        "INSERT INTO demo_resources(resource_type,resource_id) VALUES (?,?) ON CONFLICT DO NOTHING",
        type,
        id.toString());
  }

  void lockMutation() {
    if (scoped()) db.queryForList("SELECT pg_advisory_xact_lock(hashtextextended('filegrid-demo-state',0))");
  }
}
