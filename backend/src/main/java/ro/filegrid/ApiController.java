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

  @org.springframework.beans.factory.annotation.Value("${STORM_THRESHOLD:20}")
  private int stormThreshold;

  public ApiController(
      FileService files, JdbcTemplate db, PolicyEngine policies, OperationMetrics metrics) {
    this.files = files;
    this.db = db;
    this.policies = policies;
    this.metrics = metrics;
  }

  @GetMapping("/me")
  public Object me(Authentication a) {
    return Map.of(
        "username",
        a.getName(),
        "role",
        a.getAuthorities().iterator().next().getAuthority().replace("ROLE_", ""));
  }

  @PostMapping("/meter-readings")
  public ResponseEntity<?> meter(HttpServletRequest request, Authentication a) throws IOException {
    long started = System.nanoTime();
    byte[] bytes = Integrity.limited(request.getInputStream(), 50 * 1024);
    boolean ok = false;
    try {
      var result = files.meter(bytes, a);
      ok = true;
      return ResponseEntity.status(Boolean.TRUE.equals(result.get("duplicate")) ? 200 : 201)
          .body(result);
    } finally {
      metrics.record("METER_READING", "DATABASE", "ingest", started, bytes.length, ok);
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
    String where = meterId == null ? "" : " WHERE meter_id=?";
    Object[] count = meterId == null ? new Object[] {} : new Object[] {meterId};
    Object[] args =
        meterId == null
            ? new Object[] {size, (long) page * size}
            : new Object[] {meterId, size, (long) page * size};
    return Map.of(
        "items",
        db.queryForList(
            "SELECT reading_id AS \"readingId\",meter_id AS \"meterId\",sequence_number AS"
                + " \"sequenceNumber\",energy_kwh AS \"energyKwh\",file_id AS"
                + " \"fileId\",measured_at AS \"measuredAt\" FROM meter_readings"
                + where
                + " ORDER BY measured_at DESC LIMIT ? OFFSET ?",
            args),
        "page",
        page,
        "size",
        size,
        "total",
        db.queryForObject("SELECT count(*) FROM meter_readings" + where, Long.class, count));
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

  @GetMapping("/stats/technical")
  public Object technical(Authentication a) {
    FileService.roles(a, "DISPATCHER");
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
                + " created_at>now()-interval '1 hour' GROUP BY category,storage,operation"));
  }

  @GetMapping("/stats/business")
  public Object business(Authentication a) {
    FileService.roles(a, "DISPATCHER");
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
