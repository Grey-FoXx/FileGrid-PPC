package ro.filegrid;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;

@Service
public class AuditRecorder {
  private final JdbcTemplate db;

  public AuditRecorder(JdbcTemplate db) {
    this.db = db;
  }

  @Transactional(propagation = Propagation.REQUIRES_NEW)
  public void denied(String actor, String action, String resource, String outcome) {
    db.update(
        "INSERT INTO audit_events(actor,action,resource_id,outcome,correlation_id) VALUES"
            + " (?,?,?,?,?)",
        actor,
        action,
        resource.substring(0, Math.min(120, resource.length())),
        outcome,
        org.slf4j.MDC.get("correlationId"));
  }
}
