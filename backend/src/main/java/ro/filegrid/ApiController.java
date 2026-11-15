package ro.filegrid;

import jakarta.servlet.http.*;
import java.io.*;
import java.util.*;
import org.springframework.http.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1")
public class ApiController {
  private final FileService files;
  private final JdbcTemplate db;
  private final PolicyEngine policies;
  private final OperationMetrics metrics;
  private final IncidentGroupService groups;
  private final DemoService demo;
  private final DemoScope demoScope;

  @org.springframework.beans.factory.annotation.Value("${STORM_THRESHOLD:20}")
  private int stormThreshold;

  public ApiController(
      FileService files, JdbcTemplate db, PolicyEngine policies, OperationMetrics metrics,
      IncidentGroupService groups, DemoService demo, DemoScope demoScope) {
    this.files = files;
    this.db = db;
    this.policies = policies;
    this.metrics = metrics;
    this.groups = groups;
    this.demo = demo;
    this.demoScope = demoScope;
  }

  @GetMapping("/me")
  public Object me(Authentication a) {
    String role = a.getAuthorities().iterator().next().getAuthority().replace("ROLE_", "");
    return Map.of(
        "username", a.getName(),
        "role", role,
        "features", Map.of(
            "demo", demoScope.enabled() && Set.of("ADMIN", "DISPATCHER", "FIELD_OPERATOR", "CONNECTION_AGENT").contains(role),
            "incidentGroups", FileService.role(a, "ADMIN") || FileService.role(a, "DISPATCHER")));
  }

  @PostMapping("/meter-readings")
  public ResponseEntity<?> meter(HttpServletRequest request, Authentication a) throws IOException {
    long started = System.nanoTime();
    byte[] bytes = Integrity.limited(request.getInputStream(), 50 * 1024);
    boolean ok = false;
    String target = "UNKNOWN";
    try {
      target = policies.decide("METER_READING", "", "NON_SENSITIVE").storage();
      var result = files.meter(bytes, a);
      target = result.get("storage").toString();
      ok = true;
      return ResponseEntity.status(Boolean.TRUE.equals(result.get("duplicate")) ? 200 : 201)
          .body(result);
    } finally {
      metrics.record("METER_READING", target, "ingest", started, bytes.length, ok);
    }
  }

  @GetMapping("/meter-readings")
  public Object readings(
      Authentication a,
      @RequestParam(defaultValue = "0") int page,
      @RequestParam(defaultValue = "25") int size,
      @RequestParam(required = false) String meterId) {
    FileService.roles(a, "DISPATCHER");
    ApiProblem.require(
        page >= 0 && size > 0 && size <= 100, 422, "PAGINATION", "Invalid pagination");
    var where = new StringBuilder(" WHERE 1=1");
    var count = new ArrayList<Object>();
    if (meterId != null) { where.append(" AND meter_id=?"); count.add(meterId); }
    if (demoScope.scoped()) { where.append(" AND reading_id IN (SELECT resource_id FROM demo_resources WHERE resource_type='READING')"); }
    var args = new ArrayList<Object>(count);
    args.add(size); args.add((long) page * size);
    return Map.of(
        "items",
        db.queryForList(
            "SELECT reading_id AS \"readingId\",meter_id AS \"meterId\",sequence_number AS"
                + " \"sequenceNumber\",energy_kwh AS \"energyKwh\",file_id AS"
                + " \"fileId\",measured_at AS \"measuredAt\" FROM meter_readings"
                + where
                + " ORDER BY measured_at DESC LIMIT ? OFFSET ?",
            args.toArray()),
        "page",
        page,
        "size",
        size,
        "total",
        db.queryForObject("SELECT count(*) FROM meter_readings" + where, Long.class, count.toArray()));
  }

  @PostMapping("/incidents")
  public ResponseEntity<?> createIncident(
      @RequestBody Map<String, Object> body,
      @RequestHeader("Idempotency-Key") String key,
      Authentication a) {
    return ResponseEntity.status(201).body(files.createIncident(body, key, a));
  }

  @GetMapping("/incidents")
  public Object incidents(
      Authentication a,
      @RequestParam(defaultValue = "0") int page,
      @RequestParam(defaultValue = "25") int size) {
    return files.incidents(a, page, size);
  }

  @GetMapping("/incident-groups")
  public Object incidentGroups(
      Authentication a, @RequestParam(defaultValue = "false") boolean includeResolved) {
    FileService.roles(a, "DISPATCHER");
    boolean scoped = demoScope.scoped();
    groups.backfillUngrouped(scoped);
    var items = new ArrayList<Map<String, Object>>();
    for (var row : groups.openGroupRows(scoped, includeResolved)) {
      UUID id = (UUID) row.get("id");
      var memberIds = db.queryForList("SELECT id FROM incidents WHERE group_id=? ORDER BY created_at", UUID.class, id);
      var incidents = memberIds.stream().map(member -> files.incident(member, a)).toList();
      int severity = incidents.stream().mapToInt(i -> ((Number) i.getOrDefault("severity", 0)).intValue()).max().orElse(0);
      var coordinates = incidents.stream().filter(i -> i.get("latitude") instanceof Number && i.get("longitude") instanceof Number).toList();
      Double latitude = coordinates.isEmpty() ? null : coordinates.stream().mapToDouble(i -> ((Number) i.get("latitude")).doubleValue()).average().orElseThrow();
      Double longitude = coordinates.isEmpty() ? null : coordinates.stream().mapToDouble(i -> ((Number) i.get("longitude")).doubleValue()).average().orElseThrow();
      var summary = new LinkedHashMap<String, Object>();
      summary.put("kind", "PROXIMITY_GROUP");
      summary.put("memberCount", incidents.size());
      summary.put("maxReportedSeverity", severity);
      summary.put("method", "same zone/event type and within a two-hour, five-kilometre window when coordinates are available");
      summary.put("interpretation", "Statistical grouping for dispatch; proximity does not prove a common cause.");
      var item = new LinkedHashMap<String, Object>();
      item.put("id", id);
      item.put("status", row.get("status"));
      item.put("zone", row.get("zone"));
      item.put("eventType", row.get("event_type"));
      item.put("severity", severity);
      item.put("latitude", latitude);
      item.put("longitude", longitude);
      item.put("createdAt", row.get("created_at"));
      item.put("updatedAt", row.get("updated_at"));
      item.put("incidents", incidents);
      item.put("groupAnalysis", summary);
      items.add(item);
    }
    return Map.of("items", items, "total", items.size());
  }

  @PatchMapping("/incident-groups/{id}/status")
  public Object transitionIncidentGroup(
      @PathVariable UUID id, @RequestBody Map<String, Object> body, Authentication a) {
    FileService.roles(a, "DISPATCHER");
    var result = groups.transition(id, Objects.toString(body.get("status"), ""), demoScope.scoped());
    files.audit(a.getName(), "INCIDENT_GROUP_STATUS", id.toString(), result.get("status").toString());
    return result;
  }

  @GetMapping("/incidents/{id}")
  public Object incident(@PathVariable UUID id, Authentication a) {
    return files.incident(id, a);
  }

  @GetMapping("/incidents/{id}/analysis")
  public Object analysis(@PathVariable UUID id, Authentication a) {
    var i = files.incident(id, a);
    var m = new LinkedHashMap<String, Object>();
    m.put("mlStatus", i.get("mlStatus"));
    m.put("analysis", i.get("analysis"));
    return m;
  }

  @PostMapping("/upload-sessions")
  public ResponseEntity<?> createSession(
      @RequestBody Map<String, Object> body,
      @RequestHeader("Idempotency-Key") String key,
      Authentication a) {
    return ResponseEntity.status(201).body(files.createSession(body, key, a));
  }

  @GetMapping("/upload-sessions/{id}")
  public Object session(@PathVariable UUID id, Authentication a) {
    return files.session(id, a);
  }

  @PutMapping("/upload-sessions/{id}/content")
  public Object content(@PathVariable UUID id, HttpServletRequest request, Authentication a)
      throws IOException {
    var row = files.sessionRow(id, a, false);
    var f = files.raw((UUID) row.get("file_id"));
    long start = System.nanoTime();
    boolean ok = false;
    try {
      var result =
          files.putSmall(
              id, Integrity.limited(request.getInputStream(), FileService.SMALL_LIMIT), a);
      ok = true;
      return result;
    } finally {
      metrics.record(f.category(), f.storage(), "upload_content", start, f.sizeBytes(), ok);
    }
  }

  @PutMapping("/upload-sessions/{id}/parts/{number}")
  public Object part(
      @PathVariable UUID id,
      @PathVariable int number,
      @RequestHeader("X-Part-SHA256") String hash,
      HttpServletRequest request,
      Authentication a)
      throws IOException {
    var row = files.sessionRow(id, a, false);
    var f = files.raw((UUID) row.get("file_id"));
    long start = System.nanoTime();
    boolean ok = false;
    byte[] bytes = Integrity.limited(request.getInputStream(), FileService.PART_SIZE);
    try {
      var result = files.putPart(id, number, bytes, hash, a);
      ok = true;
      return result;
    } finally {
      metrics.record(f.category(), f.storage(), "upload_part", start, bytes.length, ok);
    }
  }

  @PostMapping("/upload-sessions/{id}/complete")
  public ResponseEntity<?> complete(@PathVariable UUID id, Authentication a) {
    return ResponseEntity.accepted().body(files.complete(id, a));
  }

  @DeleteMapping("/upload-sessions/{id}")
  public ResponseEntity<?> cancel(@PathVariable UUID id, Authentication a) {
    files.cancel(id, a);
    return ResponseEntity.noContent().build();
  }

  @GetMapping("/files")
  public Object list(
      Authentication a,
      @RequestParam(required = false) String category,
      @RequestParam(required = false) String status,
      @RequestParam(required = false) String search,
      @RequestParam(defaultValue = "0") int page,
      @RequestParam(defaultValue = "25") int size) {
    return files.files(a, category, status, search, page, size);
  }

  @GetMapping("/files/{id}")
  public Object file(@PathVariable UUID id, Authentication a) {
    return files.authorized(id, a).view();
  }

  @GetMapping("/files/{id}/content")
  public void download(@PathVariable UUID id, Authentication a, HttpServletResponse response)
      throws IOException {
    long start = System.nanoTime();
    FileService.FileData f = files.authorized(id, a);
    boolean ok = false;
    try {
      f = files.downloadable(id, a);
      response.setContentType("application/octet-stream");
      response.setContentLengthLong(f.sizeBytes());
      response.setHeader("X-Content-SHA256", f.sha256());
      response.setHeader(
          "Content-Disposition",
          ContentDisposition.attachment()
              .filename(f.filename(), java.nio.charset.StandardCharsets.UTF_8)
              .build()
              .toString());
      try (var in = files.plaintext(f)) {
        in.transferTo(response.getOutputStream());
      }
      ok = true;
    } finally {
      metrics.record(f.category(), f.storage(), "download", start, f.sizeBytes(), ok);
    }
  }

  @GetMapping("/policies")
  public Object policies(Authentication a) {
    FileService.roles(a, "DISPATCHER", "FIELD_OPERATOR", "CONNECTION_AGENT");
    return policies.configuration();
  }

  @PutMapping("/policies")
  public Object replacePolicies(@RequestBody Map<String, Object> body, Authentication a) {
    FileService.roles(a);
    ApiProblem.require(body.keySet().equals(Set.of("expectedVersion", "rules")), 422,
        "INVALID_POLICY", "Body must contain expectedVersion and rules only");
    long expected = expectedPolicyVersion(body.get("expectedVersion"));
    Object rawRules = body.get("rules");
    ApiProblem.require(rawRules instanceof List<?>, 422, "INVALID_POLICY", "Rules must be an array");
    var rules = new ArrayList<Map<String, Object>>();
    for (Object raw : (List<?>) rawRules) {
      ApiProblem.require(raw instanceof Map<?, ?>, 422, "INVALID_POLICY", "Each rule must be an object");
      var rule = new LinkedHashMap<String, Object>();
      ((Map<?, ?>) raw).forEach((key, value) -> {
        ApiProblem.require(key instanceof String, 422, "INVALID_POLICY", "Rule keys must be strings");
        rule.put((String) key, value);
      });
      rules.add(rule);
    }
    return policies.replace(expected, rules);
  }

  @PostMapping("/policies/reset")
  public Object resetPolicies(@RequestBody Map<String, Object> body, Authentication a) {
    FileService.roles(a);
    ApiProblem.require(body.keySet().equals(Set.of("expectedVersion")), 422,
        "INVALID_POLICY", "Body must contain expectedVersion only");
    return policies.reset(expectedPolicyVersion(body.get("expectedVersion")));
  }

  private static long expectedPolicyVersion(Object value) {
    try {
      ApiProblem.require(value instanceof Number, 422, "INVALID_POLICY", "expectedVersion must be an integer");
      long expected = new java.math.BigDecimal(value.toString()).longValueExact();
      ApiProblem.require(expected > 0, 422, "INVALID_POLICY", "expectedVersion must be positive");
      return expected;
    } catch (ApiProblem e) {
      throw e;
    } catch (Exception e) {
      throw new ApiProblem(422, "INVALID_POLICY", "expectedVersion must be an integer");
    }
  }

  @GetMapping("/stats/technical")
  public Object technical(Authentication a) {
    FileService.roles(a, "DISPATCHER");
    String scope = demoScope.scoped() ? " AND demo_scope=TRUE" : "";
    return Map.of(
        "windowMinutes",
        60,
        "series",
        db.queryForList(
            "SELECT category,storage,operation,count(*) AS operations,percentile_cont(0.5) WITHIN"
                + " GROUP(ORDER BY duration_ms) AS \"p50Ms\",percentile_cont(0.95) WITHIN"
                + " GROUP(ORDER BY duration_ms) AS \"p95Ms\",percentile_cont(0.99) WITHIN"
                + " GROUP(ORDER BY duration_ms) AS \"p99Ms\",sum(bytes)/3600.0 AS"
                + " \"bytesPerSecond\",count(*)/3600.0 AS \"operationsPerSecond\",avg(CASE WHEN"
                + " success THEN 0.0 ELSE 1.0 END) AS \"errorRate\" FROM operations WHERE"
                + " created_at>now()-interval '1 hour'"
                + scope
                + " GROUP BY category,storage,operation"));
  }

  @GetMapping("/stats/business")
  public Object business(Authentication a) {
    FileService.roles(a, "DISPATCHER");
    if (demoScope.scoped()) return scopedBusiness();
    long recent =
        db.queryForObject(
            "SELECT count(*) FROM incidents WHERE created_at>now()-interval '5 minutes'",
            Long.class);
    return Map.of(
        "readings",
        db.queryForObject("SELECT count(*) FROM meter_readings", Long.class),
        "files",
        db.queryForObject("SELECT count(*) FROM files", Long.class),
        "incidents",
        db.queryForObject("SELECT count(*) FROM incidents", Long.class),
        "mode",
        recent >= stormThreshold ? "STORM" : "NORMAL",
        "recentIncidents",
        recent,
        "zones",
        db.queryForList(
            "SELECT metadata::jsonb->>'zone' AS zone,count(*) AS incidents FROM incidents GROUP BY"
                + " metadata::jsonb->>'zone'"));
  }

  private Object scopedBusiness() {
    long recent = db.queryForObject(
        "SELECT count(*) FROM incidents i JOIN demo_resources r ON r.resource_type='INCIDENT' AND r.resource_id=i.id::text WHERE i.created_at>now()-interval '5 minutes'",
        Long.class);
    String mode = db.queryForObject("SELECT mode FROM demo_state WHERE id=1", String.class);
    return Map.of(
        "readings", db.queryForObject("SELECT count(*) FROM demo_resources WHERE resource_type='READING'", Long.class),
        "files", db.queryForObject("SELECT count(*) FROM demo_resources WHERE resource_type='FILE'", Long.class),
        "incidents", db.queryForObject("SELECT count(*) FROM demo_resources WHERE resource_type='INCIDENT'", Long.class),
        "mode", mode,
        "recentIncidents", recent,
        "zones", db.queryForList("SELECT i.metadata::jsonb->>'zone' AS zone,count(*) AS incidents FROM incidents i JOIN demo_resources r ON r.resource_type='INCIDENT' AND r.resource_id=i.id::text GROUP BY i.metadata::jsonb->>'zone'"));
  }

  @GetMapping("/demo")
  public Object demoStatus(Authentication a) {
    FileService.roles(a, "DISPATCHER", "FIELD_OPERATOR", "CONNECTION_AGENT");
    return demo.status();
  }

  @PostMapping("/demo/initialize")
  public Object initializeDemo(Authentication a) throws IOException {
    FileService.roles(a);
    return demo.initialize(a);
  }

  @PostMapping("/demo/reset")
  public Object resetDemo(Authentication a) throws IOException {
    FileService.roles(a);
    return demo.reset(a);
  }

  @PostMapping("/demo/mode")
  public Object demoMode(@RequestBody Map<String, Object> body, Authentication a) {
    FileService.roles(a);
    return demo.setMode(Objects.toString(body.get("mode"), ""));
  }
}

@RestController
@RequestMapping("/internal/v1")
class WorkerController {
  private final JobService jobs;

  WorkerController(JobService jobs) {
    this.jobs = jobs;
  }

  @PostMapping("/jobs/claim")
  Object claim(@RequestHeader("X-Worker-Token") String token) {
    jobs.authenticate(token);
    return jobs.claimMl();
  }

  @PostMapping("/jobs/{id}/complete")
  Object complete(
      @PathVariable UUID id,
      @RequestHeader("X-Worker-Token") String token,
      @RequestBody Map<String, Object> result) {
    jobs.authenticate(token);
    int attempt = ((Number) result.remove("attempt")).intValue();
    jobs.finishMl(id, attempt, result, true);
    return Map.of("ok", true);
  }

  @PostMapping("/jobs/{id}/fail")
  Object fail(
      @PathVariable UUID id,
      @RequestHeader("X-Worker-Token") String token,
      @RequestBody Map<String, Object> result) {
    jobs.authenticate(token);
    jobs.finishMl(id, ((Number) result.get("attempt")).intValue(), Map.of(), false);
    return Map.of("ok", true);
  }
}
