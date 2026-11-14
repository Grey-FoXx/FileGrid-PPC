package ro.filegrid;

import java.util.function.Supplier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

/** Explicit, opt-in data scope for the synthetic demo workspace. */
@Component
class DemoScope {
  private static final ThreadLocal<Boolean> OVERRIDE = new ThreadLocal<>();
  private final JdbcTemplate db;
  private final boolean enabled;

  DemoScope(JdbcTemplate db, @Value("${filegrid.demo-enabled:false}") boolean enabled) {
    this.db = db;
    this.enabled = enabled;
  }

  boolean enabled() { return enabled; }

  boolean scoped() {
    if (!enabled) return false;
    Boolean override = OVERRIDE.get();
    if (override != null) return override;
    var attributes = RequestContextHolder.getRequestAttributes();
    return attributes instanceof ServletRequestAttributes servlet
        && "true".equalsIgnoreCase(servlet.getRequest().getHeader("X-FileGrid-Demo"));
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
