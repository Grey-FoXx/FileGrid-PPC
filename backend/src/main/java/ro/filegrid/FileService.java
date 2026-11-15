package ro.filegrid;

import com.fasterxml.jackson.databind.*;
import java.io.*;
import java.sql.*;
import java.time.*;
import java.util.*;
import org.springframework.jdbc.core.*;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class FileService {
  public static final int PART_SIZE = 8 * 1024 * 1024;
  public static final int SMALL_LIMIT = 10 * 1024 * 1024;
  private final JdbcTemplate db;
  private final ObjectMapper json;
  private final PolicyEngine policies;
  private final Storage storage;
  private final Crypto crypto;
  private final IncidentGroupService groups;
  private final DemoScope demoScope;

  public FileService(
      JdbcTemplate db, ObjectMapper json, PolicyEngine policies, Storage storage, Crypto crypto,
      IncidentGroupService groups, DemoScope demoScope) {
    this.db = db;
    this.json = json;
    this.policies = policies;
    this.storage = storage;
    this.crypto = crypto;
    this.groups = groups;
    this.demoScope = demoScope;
  }

  public record FileData(
      UUID id,
      String category,
      String filename,
      String contentType,
      long sizeBytes,
      String sha256,
      String status,
      String integrityStatus,
      String storage,
      String storageKey,
      String storageVersion,
      String owner,
      String policyVersion,
      String routingReason,
      boolean encrypted,
      byte[] nonce,
      String context,
      String operationId,
      Instant createdAt) {
    public Map<String, Object> view() {
      var m = new LinkedHashMap<String, Object>();
      m.put("id", id);
      m.put("category", category);
      m.put("filename", filename);
      m.put("contentType", contentType);
      m.put("sizeBytes", sizeBytes);
      m.put("sha256", sha256);
      m.put("status", status);
      m.put("integrityStatus", integrityStatus);
      m.put("storage", storage);
      m.put("owner", owner);
      m.put("policyVersion", policyVersion);
      m.put("routingReason", routingReason);
      m.put("createdAt", createdAt);
      return m;
    }
  }

  private final RowMapper<FileData> mapper =
      (r, n) ->
          new FileData(
              r.getObject("id", UUID.class),
              r.getString("category"),
              r.getString("filename"),
              r.getString("content_type"),
              r.getLong("size_bytes"),
              r.getString("sha256"),
              r.getString("status"),
              r.getString("integrity_status"),
              r.getString("storage"),
              r.getString("storage_key"),
              r.getString("storage_version"),
              r.getString("owner_name"),
              r.getString("policy_version"),
              r.getString("routing_reason"),
              r.getBoolean("encrypted"),
              r.getBytes("nonce"),
              r.getString("context"),
              r.getString("operation_id"),
              r.getTimestamp("created_at").toInstant());

  public FileData raw(UUID id) {
    var rows = db.query("SELECT * FROM files WHERE id=?", mapper, id);
    ApiProblem.require(!rows.isEmpty(), 404, "NOT_FOUND", "File not found");
    return rows.getFirst();
  }

  public static boolean role(Authentication a, String role) {
    return a != null
        && a.getAuthorities().stream().anyMatch(x -> x.getAuthority().equals("ROLE_" + role));
  }

  public static void roles(Authentication a, String... allowed) {
    ApiProblem.require(
        role(a, "ADMIN") || Arrays.stream(allowed).anyMatch(x -> role(a, x)),
        403,
        "FORBIDDEN",
        "Role does not allow this operation");
  }

  public void audit(String actor, String action, String resource, String result) {
    db.update(
        "INSERT INTO audit_events(actor,action,resource_id,outcome,correlation_id) VALUES"
            + " (?,?,?,?,?)",
        actor,
        action,
        resource,
        result,
        org.slf4j.MDC.get("correlationId"));
  }

  public FileData authorized(UUID id, Authentication a) {
    FileData f = raw(id);
    boolean ok =
        role(a, "ADMIN")
            || switch (f.category()) {
              case "CONNECTION_DOCUMENT" -> a.getName().equals(f.owner());
              case "INCIDENT", "DRONE_VIDEO" ->
                  role(a, "DISPATCHER")
                      || (a.getName().equals(f.owner()) && role(a, "FIELD_OPERATOR"));
              case "METER_READING" -> role(a, "DISPATCHER");
              default -> false;
            };
    if (!ok) {
      audit(a.getName(), "ACCESS", id.toString(), "DENIED");
      throw new ApiProblem(403, "FORBIDDEN", "You cannot access this file");
    }
    return f;
  }

  public String encode(Object v) {
    try {
      return json.writeValueAsString(v);
    } catch (Exception e) {
      throw new IllegalArgumentException("Invalid JSON", e);
    }
  }

  @SuppressWarnings("unchecked")
  public Map<String, Object> decode(String s) {
    try {
      return json.readValue(s, LinkedHashMap.class);
    } catch (Exception e) {
      throw new IllegalArgumentException("Invalid JSON", e);
    }
  }

  static String text(Map<String, Object> m, String key, String fallback) {
    Object v = m.get(key);
    return v == null ? fallback : v.toString();
  }

  private void idemLock(String owner, String operation, String key) {
    ApiProblem.require(
        key != null && key.matches("[a-zA-Z0-9_.:-]{1,120}"),
        422,
        "INVALID_IDEMPOTENCY_KEY",
        "A stable Idempotency-Key is required");
    db.queryForList(
        "SELECT pg_advisory_xact_lock(hashtextextended(?,0))", owner + ":" + operation + ":" + key);
  }

  private UUID replay(String owner, String operation, String key, String fingerprint) {
    var rows =
        db.queryForList(
            "SELECT * FROM idempotency_records WHERE owner_name=? AND operation=? AND idem_key=?",
            owner,
            operation,
            key);
    if (rows.isEmpty()) return null;
    ApiProblem.require(
        fingerprint.equals(rows.getFirst().get("fingerprint").toString().trim()),
        409,
        "IDEMPOTENCY_CONFLICT",
        "Key already used with different content");
    return (UUID) rows.getFirst().get("resource_id");
  }

  private void remember(String owner, String operation, String key, String fingerprint, UUID id) {
    db.update(
        "INSERT INTO idempotency_records VALUES (?,?,?,?,?)",
        owner,
        operation,
        key,
        fingerprint,
        id);
  }

  private UUID insertFile(
      String category,
      String name,
      String type,
      long size,
      String sha,
      Authentication a,
      Map<String, Object> context,
      PolicyEngine.Decision decision) {
    UUID id = UUID.randomUUID();
    boolean encrypted = category.equals("CONNECTION_DOCUMENT");
    db.update(
        "INSERT INTO"
            + " files(id,category,filename,content_type,size_bytes,sha256,status,storage,storage_key,owner_name,policy_version,routing_reason,encrypted,nonce,context,operation_id)"
            + " VALUES (?,?,?,?,?,?,'CREATED',?,?,?,?,?,?,?,?,?)",
        id,
        category,
        name,
        type,
        size,
        sha,
        decision.storage(),
        id + ".bin",
        a.getName(),
        decision.version(),
        decision.reason(),
        encrypted,
        encrypted ? crypto.nonce() : null,
        encode(context),
        Objects.toString(org.slf4j.MDC.get("correlationId"), UUID.randomUUID().toString()));
    demoScope.register("FILE", id);
    return id;
  }

  @Transactional(rollbackFor = IOException.class)
  public Map<String, Object> meter(byte[] payload, Authentication a) throws IOException {
    roles(a, "METER_INGEST");
    demoScope.lockMutation();
    demoScope.verifyMeterEpoch();
    ApiProblem.require(
        payload.length > 0 && payload.length <= 50 * 1024,
        413,
        "METER_SIZE",
        "Meter payload must be <=50 KiB");
    Map<String, Object> m = decode(new String(payload, java.nio.charset.StandardCharsets.UTF_8));
    String id = text(m, "reading_id", ""), meter = text(m, "meter_id", "");
    long seq;
    Instant at;
    java.math.BigDecimal energy;
    try {
      ApiProblem.require(
          m.get("schema_version") instanceof Number
              && new java.math.BigDecimal(m.get("schema_version").toString())
                      .compareTo(java.math.BigDecimal.ONE)
                  == 0,
          422,
          "SCHEMA_VERSION",
          "Expected schema_version 1");
      ApiProblem.require(
          m.get("sequence_number") instanceof Number && m.get("energy_kwh") instanceof Number,
          422,
          "INVALID_READING",
          "Numeric reading fields required");
      seq = new java.math.BigDecimal(m.get("sequence_number").toString()).longValueExact();
      energy = new java.math.BigDecimal(m.get("energy_kwh").toString());
      at = Instant.parse(text(m, "measured_at", ""));
    } catch (ApiProblem e) {
      throw e;
    } catch (Exception e) {
      throw new ApiProblem(422, "INVALID_READING", "Invalid sequence, timestamp or energy");
    }
    ApiProblem.require(
        id.matches("[a-zA-Z0-9_.:-]{1,120}")
            && meter.matches("[a-zA-Z0-9_.:-]{1,120}")
            && seq > 0
            && energy.signum() >= 0,
        422,
        "INVALID_READING",
        "Invalid reading fields");
    db.queryForList("SELECT pg_advisory_xact_lock(hashtextextended(?,0))", "meter:" + meter);
    db.queryForList("SELECT pg_advisory_xact_lock(hashtextextended(?,0))", "reading:" + id);
    var existing =
        db.queryForList(
            "SELECT file_id,reading_id,meter_id,sequence_number FROM meter_readings WHERE"
                + " reading_id=? OR (meter_id=? AND sequence_number=?)",
            id,
            meter,
            seq);
    if (!existing.isEmpty()) {
      var row = existing.getFirst();
      FileData f = raw((UUID) row.get("file_id"));
      ApiProblem.require(
          existing.size() == 1
              && id.equals(row.get("reading_id"))
              && meter.equals(row.get("meter_id"))
              && seq == ((Number) row.get("sequence_number")).longValue()
              && f.sha256().equals(Integrity.sha256(payload)),
          409,
          "READING_CONFLICT",
          "Reading identity reused with different bytes");
      return Map.of("fileId", f.id(), "duplicate", true, "storage", f.storage());
    }
    var d = policies.decide("METER_READING", "", "NON_SENSITIVE");
    UUID f =
        insertFile(
            "METER_READING",
            id + ".json",
            "application/json",
            payload.length,
            Integrity.sha256(payload),
            a,
            Map.of(),
            d);
    String storageVersion = null;
    if ("DATABASE".equals(d.storage())) db.update("INSERT INTO blobs VALUES (?,?)", f + ".bin", payload);
    else {
      storageVersion = storage.put(d.storage(), f + ".bin", payload);
      try (var in = storage.open(d.storage(), f + ".bin", storageVersion)) {
        ApiProblem.require(Integrity.sha256(in).equals(Integrity.sha256(payload)),
            502, "INTEGRITY_FAILED", "Stored meter bytes failed verification");
      }
    }
    db.update("UPDATE files SET storage_version=? WHERE id=?", storageVersion, f);
    db.update(
        "INSERT INTO meter_readings VALUES (?,?,?,?,?,?)",
        id,
        meter,
        seq,
        Timestamp.from(at),
        energy,
        f);
    demoScope.register("READING", id);
    db.update("UPDATE files SET status='AVAILABLE',integrity_status='VERIFIED' WHERE id=?", f);
    audit(a.getName(), "INGEST", f.toString(), "SUCCESS");
    return Map.of("fileId", f, "duplicate", false, "storage", d.storage());
  }

  @Transactional
  public Map<String, Object> createIncident(
      Map<String, Object> input, String key, Authentication a) {
    roles(a, "FIELD_OPERATOR", "DISPATCHER");
    demoScope.lockMutation();
    for (String k : List.of("stationId", "zone", "eventType"))
      ApiProblem.require(
          !text(input, k, "").isBlank() && text(input, k, "").length() <= 120,
          422,
          "INVALID_INCIDENT",
          k + " is required");
    int severity;
    try {
      severity = new java.math.BigDecimal(text(input, "severity", "")).intValueExact();
    } catch (Exception e) {
      throw new ApiProblem(422, "INVALID_INCIDENT", "Severity must be integer 1..5");
    }
    ApiProblem.require(
        severity >= 1 && severity <= 5, 422, "INVALID_INCIDENT", "Severity must be 1..5");
    try {
      int customers =
          new java.math.BigDecimal(text(input, "affectedCustomers", "0")).intValueExact();
      ApiProblem.require(
          customers >= 0, 422, "INVALID_INCIDENT", "Affected customers must be nonnegative");
      for (String coordinate : List.of("latitude", "longitude")) {
        if (input.containsKey(coordinate)) {
          double value = Double.parseDouble(input.get(coordinate).toString());
          double bound = coordinate.equals("latitude") ? 90 : 180;
          ApiProblem.require(
              Double.isFinite(value) && Math.abs(value) <= bound,
              422,
              "INVALID_INCIDENT",
              "Invalid coordinate");
        }
      }
      if (input.containsKey("safetyCritical"))
        ApiProblem.require(
            input.get("safetyCritical") instanceof Boolean,
            422,
            "INVALID_INCIDENT",
            "safetyCritical must be boolean");
      if (input.containsKey("occurredAt")) Instant.parse(input.get("occurredAt").toString());
    } catch (ApiProblem e) {
      throw e;
    } catch (Exception e) {
      throw new ApiProblem(422, "INVALID_INCIDENT", "Invalid incident numeric fields or timestamp");
    }
    idemLock(a.getName(), "incident", key);
    String hash = Integrity.sha256(encode(input).getBytes(java.nio.charset.StandardCharsets.UTF_8));
    UUID old = replay(a.getName(), "incident", key, hash);
    if (old != null) return incident(old, a);
    UUID id = UUID.randomUUID();
    input = new LinkedHashMap<>(input);
    input.putIfAbsent("affectedCustomers", 0);
    input.putIfAbsent("safetyCritical", false);
    input.putIfAbsent("occurredAt", Instant.now().toString());
    db.update(
        "INSERT INTO incidents(id,owner_name,metadata) VALUES (?,?,?)",
        id,
        a.getName(),
        encode(input));
    demoScope.register("INCIDENT", id);
    UUID groupId = groups.correlate(id, demoScope.scoped());
    db.update("INSERT INTO jobs(id,kind,resource_id) VALUES (?,'ML',?) ON CONFLICT DO NOTHING", UUID.randomUUID(), id);
    db.update("UPDATE incidents SET ml_status='PENDING' WHERE id=?", id);
    db.update(
        "UPDATE jobs SET state='PENDING',attempts=0,available_at=now(),lease_until=NULL,result=NULL,last_error=NULL "
            + "WHERE kind='ML' AND state IN ('COMPLETED','FAILED') AND resource_id IN "
            + "(SELECT id FROM incidents WHERE group_id=? AND id<>?)",
        groupId, id);
    db.update(
        "UPDATE incidents SET ml_status='PENDING',analysis=NULL WHERE id IN "
            + "(SELECT resource_id FROM jobs WHERE kind='ML' AND state='PENDING' AND resource_id IN "
            + "(SELECT id FROM incidents WHERE group_id=? AND id<>?))",
        groupId, id);
    remember(a.getName(), "incident", key, hash, id);
    audit(a.getName(), "CREATE_INCIDENT", id.toString(), "SUCCESS");
    return incident(id, a);
  }

  public Map<String, Object> incident(UUID id, Authentication a) {
    var rows = db.queryForList("SELECT * FROM incidents WHERE id=?", id);
    ApiProblem.require(!rows.isEmpty(), 404, "NOT_FOUND", "Incident not found");
    var row = rows.getFirst();
    ApiProblem.require(
        role(a, "ADMIN")
            || role(a, "DISPATCHER")
            || (role(a, "FIELD_OPERATOR") && a.getName().equals(row.get("owner_name"))),
        403,
        "FORBIDDEN",
        "Incident access denied");
    var result = decode(row.get("metadata").toString());
    result.put("id", id);
    result.put("createdAt", ((Timestamp) row.get("created_at")).toInstant());
    result.put("mlStatus", row.get("ml_status"));
    result.put(
        "analysis", row.get("analysis") == null ? null : decode(row.get("analysis").toString()));
    var groupRows = db.queryForList(
        "SELECT i.group_id,g.status FROM incidents i LEFT JOIN incident_groups g ON g.id=i.group_id WHERE i.id=?",
        id);
    if (!groupRows.isEmpty()) {
      result.put("groupId", groupRows.getFirst().get("group_id"));
      result.put("interventionStatus", groupRows.getFirst().get("status"));
    }
    result.put(
        "attachments",
        db
            .query(
                "SELECT * FROM files WHERE context::jsonb->>'incidentId'=? ORDER BY created_at",
                mapper,
                id.toString())
            .stream()
            .map(FileData::view)
            .toList());
    return result;
  }

  @Transactional
  public Map<String, Object> createSession(
      Map<String, Object> input, String key, Authentication a) {
    demoScope.lockMutation();
    String category = text(input, "category", "");
    ApiProblem.require(
        Set.of("INCIDENT", "CONNECTION_DOCUMENT", "DRONE_VIDEO").contains(category),
        422,
        "CATEGORY",
        "Unsupported manual category");
    if (category.equals("CONNECTION_DOCUMENT")) roles(a, "CONNECTION_AGENT");
    else roles(a, "FIELD_OPERATOR", "DISPATCHER");
    String name = text(input, "filename", ""),
        type = text(input, "contentType", "application/octet-stream"),
        hash = text(input, "sha256", "");
    long size;
    try {
      size = new java.math.BigDecimal(text(input, "sizeBytes", "")).longValueExact();
    } catch (Exception e) {
      throw new ApiProblem(422, "SIZE", "Invalid size");
    }
    ApiProblem.require(
        !name.isBlank()
            && name.length() <= 255
            && name.chars().noneMatch(c -> c < 32 || c == 127)
            && type.length() <= 120
            && hash.matches("[a-f0-9]{64}"),
        422,
        "FILE_METADATA",
        "Invalid file metadata");
    ApiProblem.require(
        size > 0
            && size <= (category.equals("DRONE_VIDEO") ? 20L * 1024 * 1024 * 1024 : SMALL_LIMIT),
        413,
        "SIZE",
        "File exceeds category limit");
    if (category.equals("INCIDENT")) {
      UUID inc = UUID.fromString(text(input, "incidentId", ""));
      incident(inc, a);
      boolean incidentDemo = !db.queryForList(
          "SELECT 1 FROM demo_resources WHERE resource_type='INCIDENT' AND resource_id=?",
          inc.toString()).isEmpty();
      ApiProblem.require(incidentDemo == demoScope.scoped(), 422, "DEMO_SCOPE_MISMATCH",
          "An upload must use the same data scope as its incident.");
    }
    if (category.equals("CONNECTION_DOCUMENT"))
      ApiProblem.require(
          !text(input, "applicationId", "").isBlank(),
          422,
          "APPLICATION_ID",
          "applicationId is required");
    idemLock(a.getName(), "session", key);
    String fingerprint =
        Integrity.sha256(encode(input).getBytes(java.nio.charset.StandardCharsets.UTF_8));
    UUID old = replay(a.getName(), "session", key, fingerprint);
    if (old != null) return session(old, a);
    var decision =
        policies.decide(
            category, text(input, "attachmentType", ""), text(input, "sensitivity", "SENSITIVE"));
    UUID f = insertFile(category, name, type, size, hash, a, input, decision),
        id = UUID.randomUUID();
    boolean multi = category.equals("DRONE_VIDEO");
    String upload = multi ? storage.beginMultipart(decision.storage(), f + ".bin") : null;
    db.update(
        "INSERT INTO upload_sessions(id,file_id,upload_mode,multipart_id) VALUES (?,?,?,?)",
        id,
        f,
        multi ? "MULTIPART" : "SINGLE",
        upload);
    remember(a.getName(), "session", key, fingerprint, id);
    audit(a.getName(), "CREATE_UPLOAD", f.toString(), "SUCCESS");
    return session(id, a);
  }

  Map<String, Object> sessionRow(UUID id, Authentication a, boolean lock) {
    var rows =
        db.queryForList(
            "SELECT * FROM upload_sessions WHERE id=?" + (lock ? " FOR UPDATE" : ""), id);
    ApiProblem.require(!rows.isEmpty(), 404, "NOT_FOUND", "Session not found");
    var row = rows.getFirst();
    FileData f = authorized((UUID) row.get("file_id"), a);
    ApiProblem.require(
        role(a, "ADMIN") || f.owner().equals(a.getName()),
        403,
        "FORBIDDEN",
        "Only uploader may modify session");
    return row;
  }

  public Map<String, Object> session(UUID id, Authentication a) {
    var row = sessionRow(id, a, false);
    var m = new LinkedHashMap<String, Object>();
    m.put("sessionId", id);
    m.put("fileId", row.get("file_id"));
    m.put("uploadMode", row.get("upload_mode"));
    m.put("partSizeBytes", PART_SIZE);
    m.put("expiresAt", ((Timestamp) row.get("expires_at")).toInstant());
    m.put("status", row.get("state"));
    m.put(
        "confirmedParts",
        db.queryForList(
            "SELECT part_number AS number,sha256,size_bytes AS \"sizeBytes\" FROM upload_parts"
                + " WHERE session_id=? ORDER BY part_number",
            id));
    return m;
  }

  private void writable(Map<String, Object> row) {
    ApiProblem.require(
        ((Timestamp) row.get("expires_at")).toInstant().isAfter(Instant.now()),
        409,
        "EXPIRED",
        "Session expired");
    ApiProblem.require(
        Set.of("CREATED", "UPLOADING", "UPLOADED").contains(row.get("state").toString()),
        409,
        "UPLOAD_STATE",
        "Session no longer writable");
  }

  @Transactional
  public Map<String, Object> putSmall(UUID id, byte[] bytes, Authentication a) throws IOException {
    var row = sessionRow(id, a, true);
    writable(row);
    ApiProblem.require(
        row.get("upload_mode").equals("SINGLE"), 409, "UPLOAD_MODE", "Use multipart upload");
    var f = raw((UUID) row.get("file_id"));
    ApiProblem.require(
        bytes.length == f.sizeBytes() && Integrity.sha256(bytes).equals(f.sha256()),
        422,
        "CHECKSUM_MISMATCH",
        "Content size or checksum differs from declaration");
    String version =
        storage.put(
            f.storage(), f.storageKey(), f.encrypted() ? crypto.encrypt(bytes, f.nonce()) : bytes);
    db.update("UPDATE files SET status='UPLOADED',storage_version=? WHERE id=?", version, f.id());
    db.update("UPDATE upload_sessions SET state='UPLOADED' WHERE id=?", id);
    audit(a.getName(), "UPLOAD", f.id().toString(), "SUCCESS");
    return session(id, a);
  }

  @Transactional
  public Map<String, Object> putPart(
      UUID id, int number, byte[] bytes, String hash, Authentication a) {
    var row = sessionRow(id, a, true);
    writable(row);
    ApiProblem.require(
        row.get("upload_mode").equals("MULTIPART"),
        409,
        "UPLOAD_MODE",
        "Use single content upload");
    var f = raw((UUID) row.get("file_id"));
    int count = (int) ((f.sizeBytes() + PART_SIZE - 1) / PART_SIZE);
    ApiProblem.require(number >= 1 && number <= count, 422, "PART_NUMBER", "Invalid part number");
    long expected = number == count ? f.sizeBytes() - (long) (number - 1) * PART_SIZE : PART_SIZE;
    ApiProblem.require(
        bytes.length == expected
            && hash != null
            && hash.matches("[a-f0-9]{64}")
            && hash.equals(Integrity.sha256(bytes)),
        422,
        "PART_CHECKSUM",
        "Part size or checksum mismatch");
    var parts =
        db.queryForList(
            "SELECT * FROM upload_parts WHERE session_id=? AND part_number=?", id, number);
    if (!parts.isEmpty()) {
      ApiProblem.require(
          hash.equals(parts.getFirst().get("sha256").toString().trim()),
          409,
          "PART_CONFLICT",
          "Different bytes for existing part");
      return session(id, a);
    }
    String etag = storage.part(f.storage(), f.storageKey(), row.get("multipart_id").toString(), number, bytes);
    db.update("INSERT INTO upload_parts VALUES (?,?,?,?,?)", id, number, hash, bytes.length, etag);
    db.update("UPDATE files SET status='UPLOADING' WHERE id=?", f.id());
    db.update("UPDATE upload_sessions SET state='UPLOADING' WHERE id=?", id);
    return session(id, a);
  }

  @Transactional
  public Map<String, Object> complete(UUID id, Authentication a) {
    var row = sessionRow(id, a, true);
    FileData f = raw((UUID) row.get("file_id"));
    if (Set.of("VERIFYING", "AVAILABLE").contains(f.status())) return f.view();
    writable(row);
    if (row.get("upload_mode").equals("MULTIPART")) {
      var parts =
          db.queryForList("SELECT * FROM upload_parts WHERE session_id=? ORDER BY part_number", id);
      long total = parts.stream().mapToLong(x -> ((Number) x.get("size_bytes")).longValue()).sum();
      ApiProblem.require(total == f.sizeBytes(), 409, "INCOMPLETE", "Not all parts are confirmed");
      String version = storage.complete(f.storage(), f.storageKey(), row.get("multipart_id").toString(), parts);
      db.update("UPDATE files SET storage_version=? WHERE id=?", version, f.id());
    } else
      ApiProblem.require(
          row.get("state").equals("UPLOADED"), 409, "INCOMPLETE", "Content has not been uploaded");
    db.update("UPDATE files SET status='VERIFYING' WHERE id=?", f.id());
    db.update("UPDATE upload_sessions SET state='VERIFYING' WHERE id=?", id);
    db.update(
        "INSERT INTO jobs(id,kind,resource_id) VALUES (?,'VERIFY',?) ON CONFLICT DO NOTHING",
        UUID.randomUUID(),
        f.id());
    return raw(f.id()).view();
  }

  @Transactional
  public void cancel(UUID id, Authentication a) {
    var row = sessionRow(id, a, true);
    var f = raw((UUID) row.get("file_id"));
    ApiProblem.require(
        !Set.of("VERIFYING", "AVAILABLE").contains(f.status()),
        409,
        "UPLOAD_STATE",
        "Cannot cancel completed upload");
    if (row.get("upload_mode").equals("MULTIPART") && !row.get("state").equals("CANCELLED"))
      storage.abort(f.storage(), f.storageKey(), row.get("multipart_id").toString());
    db.update("UPDATE upload_sessions SET state='CANCELLED' WHERE id=?", id);
    db.update("UPDATE files SET status='CANCELLED' WHERE id=?", f.id());
    audit(a.getName(), "CANCEL_UPLOAD", f.id().toString(), "SUCCESS");
  }

  public InputStream plaintext(FileData f) throws IOException {
    InputStream in = storage.open(f.storage(), f.storageKey(), f.storageVersion());
    return f.encrypted() ? crypto.decrypt(in, f.nonce()) : in;
  }

  public void check(FileData f) throws IOException {
    try (var in = plaintext(f)) {
      ApiProblem.require(
          Integrity.sha256(in).equals(f.sha256()),
          502,
          "INTEGRITY_FAILED",
          "Stored file failed SHA-256 verification");
    } catch (IOException e) {
      for (Throwable cause = e; cause != null; cause = cause.getCause()) {
        if (cause instanceof javax.crypto.AEADBadTagException) {
          throw new ApiProblem(502, "INTEGRITY_FAILED", "Encrypted content failed authentication");
        }
      }
      throw e;
    }
  }

  public FileData downloadable(UUID id, Authentication a) throws IOException {
    var f = authorized(id, a);
    ApiProblem.require(
        f.status().equals("AVAILABLE"), 409, "NOT_AVAILABLE", "File is not available");
    try {
      check(f);
    } catch (ApiProblem e) {
      db.update("UPDATE files SET status='CORRUPTED',integrity_status='FAILED' WHERE id=?", id);
      audit(a.getName(), "DOWNLOAD", id.toString(), "CORRUPTED");
      throw e;
    }
    audit(a.getName(), "DOWNLOAD", id.toString(), "SUCCESS");
    return f;
  }

  public Map<String, Object> files(
      Authentication a, String category, String status, String search, int page, int size) {
    ApiProblem.require(
        page >= 0 && size >= 1 && size <= 100, 422, "PAGINATION", "Invalid page/size");
    var args = new ArrayList<Object>();
    String where = " WHERE 1=1";
    if (!role(a, "ADMIN")) {
      if (role(a, "DISPATCHER")) {
        where += " AND (category<>'CONNECTION_DOCUMENT' OR owner_name=?)";
        args.add(a.getName());
      } else {
        where += " AND owner_name=? AND category<>'METER_READING'";
        args.add(a.getName());
      }
    }
    if (demoScope.scoped()) {
      where += " AND id IN (SELECT resource_id::uuid FROM demo_resources WHERE resource_type='FILE')";
    }
    if (category != null && !category.isBlank()) {
      where += " AND category=?";
      args.add(category);
    }
    if (status != null && !status.isBlank()) {
      where += " AND status=?";
      args.add(status);
    }
    if (search != null && !search.isBlank()) {
      where += " AND filename ILIKE ?";
      args.add("%" + search + "%");
    }
    Long total =
        db.queryForObject("SELECT count(*) FROM files" + where, Long.class, args.toArray());
    args.add(size);
    args.add((long) page * size);
    return Map.of(
        "items",
        db
            .query(
                "SELECT * FROM files" + where + " ORDER BY created_at DESC LIMIT ? OFFSET ?",
                mapper,
                args.toArray())
            .stream()
            .map(FileData::view)
            .toList(),
        "page",
        page,
        "size",
        size,
        "total",
        total);
  }

  public Map<String, Object> incidents(Authentication a, int page, int size) {
    roles(a, "FIELD_OPERATOR", "DISPATCHER");
    ApiProblem.require(
        page >= 0 && size >= 1 && size <= 100, 422, "PAGINATION", "Invalid page/size");
    boolean all = role(a, "ADMIN") || role(a, "DISPATCHER");
    boolean scoped = demoScope.scoped();
    var where = new StringBuilder(" WHERE 1=1");
    var countArgs = new ArrayList<Object>();
    if (!all) { where.append(" AND owner_name=?"); countArgs.add(a.getName()); }
    if (scoped) {
      where.append(" AND id IN (SELECT resource_id::uuid FROM demo_resources WHERE resource_type='INCIDENT')");
    }
    Long total = db.queryForObject(
        "SELECT count(*) FROM incidents" + where, Long.class, countArgs.toArray());
    var args = new ArrayList<Object>(countArgs);
    args.add(size);
    args.add((long) page * size);
    var ids = db.queryForList(
        "SELECT id FROM incidents" + where + " ORDER BY created_at DESC LIMIT ? OFFSET ?",
        UUID.class, args.toArray());
    return Map.of(
        "items",
        ids.stream().map(id -> incident(id, a)).toList(),
        "page",
        page,
        "size",
        size,
        "total",
        total);
  }

  public void deleteDemoFile(UUID id) throws IOException {
    if (db.queryForList(
            "SELECT 1 FROM demo_resources WHERE resource_type='FILE' AND resource_id=?", id.toString())
        .isEmpty()) return;
    var fileRows = db.query("SELECT * FROM files WHERE id=?", mapper, id);
    if (fileRows.isEmpty()) {
      db.update("DELETE FROM demo_resources WHERE resource_type='FILE' AND resource_id=?", id.toString());
      return;
    }
    FileData f = fileRows.getFirst();
    var activeUploads = db.queryForList(
        "SELECT multipart_id FROM upload_sessions WHERE file_id=? AND multipart_id IS NOT NULL "
            + "AND state IN ('CREATED','UPLOADING','UPLOADED')", id);
    for (var upload : activeUploads) storage.abort(f.storage(), f.storageKey(), upload.get("multipart_id").toString());
    storage.delete(f.storage(), f.storageKey(), f.storageVersion());
    db.update("DELETE FROM jobs WHERE resource_id=?", id);
    db.update("DELETE FROM upload_parts WHERE session_id IN (SELECT id FROM upload_sessions WHERE file_id=?)", id);
    db.update("DELETE FROM idempotency_records WHERE resource_id IN (SELECT id FROM upload_sessions WHERE file_id=?)", id);
    db.update("DELETE FROM upload_sessions WHERE file_id=?", id);
    db.update("DELETE FROM meter_readings WHERE file_id=?", id);
    db.update("DELETE FROM blobs WHERE storage_key=?", f.storageKey());
    db.update("DELETE FROM files WHERE id=?", id);
    db.update("DELETE FROM demo_resources WHERE resource_type='FILE' AND resource_id=?", id.toString());
  }
}
