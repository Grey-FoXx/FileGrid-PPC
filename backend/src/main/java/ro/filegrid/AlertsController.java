package ro.filegrid;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.security.MessageDigest;
import java.sql.Timestamp;
import java.time.*;
import java.util.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

/** Private Alertmanager webhook. No public frontend API is introduced. */
@RestController
@RequestMapping("/internal/v1/alerts")
public class AlertsController {
  private final JdbcTemplate db;
  private final ObjectMapper json;
  private final String token;

  public AlertsController(
      JdbcTemplate db,
      ObjectMapper json,
      @Value("${filegrid.alert-token-file:/run/filegrid/alerts.token}") String path)
      throws IOException {
    this.db = db;
    this.json = json;
    token = Files.readString(Path.of(path)).trim();
    ApiProblem.require(!token.isBlank(), 500, "ALERT_CONFIG", "Alert token must not be empty");
  }

  @PostMapping("/receive")
  @Transactional
  public Map<String, Object> receive(
      @RequestHeader(value = "Authorization", required = false) String authorization,
      @RequestBody Map<String, Object> body)
      throws Exception {
    ApiProblem.require(
        authorization != null
            && MessageDigest.isEqual(
                ("Bearer " + token).getBytes(StandardCharsets.UTF_8),
                authorization.getBytes(StandardCharsets.UTF_8)),
        403,
        "ALERT_AUTH",
        "Invalid notification credentials");
    ApiProblem.require(
        body.get("alerts") instanceof List, 422, "ALERT_BODY", "Alerts array required");
    var alerts = (List<?>) body.get("alerts");
    ApiProblem.require(alerts.size() <= 100, 413, "ALERT_BODY", "Too many alerts");
    for (Object item : alerts) {
      ApiProblem.require(item instanceof Map, 422, "ALERT_BODY", "Invalid alert");
      var alert = (Map<?, ?>) item;
      ApiProblem.require(
          alert.get("labels") instanceof Map && alert.get("annotations") instanceof Map,
          422,
          "ALERT_BODY",
          "Alert labels/annotations required");
      var labels = (Map<?, ?>) alert.get("labels");
      String name = Objects.toString(labels.get("alertname"), "");
      String fingerprint = Objects.toString(alert.get("fingerprint"), "");
      ApiProblem.require(
          !name.isBlank() && name.length() <= 120 && fingerprint.matches("[a-zA-Z0-9_-]{1,100}"),
          422,
          "ALERT_BODY",
          "Invalid alert identity");
      String state = "resolved".equals(alert.get("status")) ? "RESOLVED" : "FIRING";
      Instant start = Instant.parse(alert.get("startsAt").toString());
      Instant end = "RESOLVED".equals(state) ? Instant.parse(alert.get("endsAt").toString()) : null;
      db.update(
          "INSERT INTO alerts(fingerprint,name,status,labels,annotations,starts_at,ends_at) VALUES"
              + " (?,?,?,?,?,?,?) ON CONFLICT(fingerprint) DO UPDATE SET"
              + " status=EXCLUDED.status,labels=EXCLUDED.labels,annotations=EXCLUDED.annotations,starts_at=EXCLUDED.starts_at,ends_at=EXCLUDED.ends_at,last_received_at=now()",
          fingerprint,
          name,
          state,
          json.writeValueAsString(labels),
          json.writeValueAsString(alert.get("annotations")),
          Timestamp.from(start),
          end == null ? null : Timestamp.from(end));
      org.slf4j.LoggerFactory.getLogger(getClass())
          .warn("business_alert name={} state={} category={}", name, state, labels.get("category"));
    }
    return Map.of("received", alerts.size());
  }
}
