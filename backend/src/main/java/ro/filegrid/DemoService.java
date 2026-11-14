package ro.filegrid;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Bounded server-side synthetic dataset and paced storm scenario. */
@Service
class DemoService {
  private static final String SEED_VERSION = "ppc-demo-v1";
  private static final int SEED_INCIDENTS = 6;
  private static final int MAX_INCIDENTS = 40;
  private final JdbcTemplate db;
  private final FileService files;
  private final DemoScope scope;
  private final OperationMetrics metrics;

  DemoService(JdbcTemplate db, FileService files, DemoScope scope, OperationMetrics metrics) {
    this.db = db;
    this.files = files;
    this.scope = scope;
    this.metrics = metrics;
  }

  Map<String, Object> status() {
    var result = new LinkedHashMap<String, Object>();
    boolean enabled = scope.enabled();
    result.put("enabled", enabled);
    if (!enabled) {
      result.put("initialized", false);
      result.put("mode", "NORMAL");
      result.put("generating", false);
      result.put("seedVersion", null);
      result.put("seedCounts", Map.of("incidents", 0, "files", 0, "readings", 0));
      result.put("maxIncidents", MAX_INCIDENTS);
      result.put("generatedIncidents", 0);
      result.put("generatorRemaining", MAX_INCIDENTS);
      return result;
    }
    var state = db.queryForMap("SELECT mode,initialized_at,seed_version,generation_counter FROM demo_state WHERE id=1");
    long incidents = count("INCIDENT"), fileCount = count("FILE"), readings = count("READING");
    String mode = state.get("mode").toString();
    boolean initialized = state.get("initialized_at") != null;
    result.put("initialized", initialized);
    result.put("mode", mode);
    result.put("generating", initialized && mode.equals("STORM") && incidents < MAX_INCIDENTS);
    result.put("seedVersion", state.get("seed_version"));
    result.put("seedCounts", Map.of("incidents", incidents, "files", fileCount, "readings", readings));
    result.put("maxIncidents", MAX_INCIDENTS);
    result.put("generatedIncidents", state.get("generation_counter"));
    result.put("generatorRemaining", Math.max(0, MAX_INCIDENTS - incidents));
    return result;
  }

  @Transactional
  Map<String, Object> initialize(Authentication actor) throws IOException {
    requireEnabled();
    lock();
    var state = db.queryForMap("SELECT initialized_at FROM demo_state WHERE id=1 FOR UPDATE");
    if (state.get("initialized_at") != null) return status();
    ApiProblem.require(countAllResources() == 0, 409, "DEMO_DATA_EXISTS",
        "Demo-scoped records already exist. Reset the scoped dataset before initializing a fresh seed.");
    Authentication seed = adminIdentity("demo-seed");
    scope.asDemo(() -> {
      seedReadings(seed);
      seedIncidents(seed);
      try { seedFiles(seed); }
      catch (IOException e) { throw new DemoSeedFailure(e); }
      return null;
    });
    db.update("UPDATE demo_state SET mode='NORMAL',initialized_at=now(),seed_version=?,generation_counter=0 WHERE id=1", SEED_VERSION);
    files.audit(actor.getName(), "DEMO_INITIALIZE", SEED_VERSION, "SUCCESS");
    return status();
  }

  @Transactional
  Map<String, Object> reset(Authentication actor) throws IOException {
    requireEnabled();
    lock();
    db.queryForMap("SELECT id FROM demo_state WHERE id=1 FOR UPDATE");
    db.queryForList("SELECT pg_advisory_xact_lock(hashtextextended('incident-groups:true',0))");
    clearTaggedData();
    Authentication seed = adminIdentity("demo-seed");
    scope.asDemo(() -> {
      seedReadings(seed);
      seedIncidents(seed);
      try { seedFiles(seed); }
      catch (IOException e) { throw new DemoSeedFailure(e); }
      return null;
    });
    db.update("UPDATE demo_state SET mode='NORMAL',initialized_at=now(),seed_version=?,generation_counter=0 WHERE id=1", SEED_VERSION);
    files.audit(actor.getName(), "DEMO_RESET", SEED_VERSION, "SUCCESS");
    return status();
  }

  private void clearTaggedData() throws IOException {
    var fileIds = db.queryForList("SELECT resource_id FROM demo_resources WHERE resource_type='FILE'", String.class);
    for (String id : fileIds) files.deleteDemoFile(UUID.fromString(id));

    var incidentIds = db.queryForList("SELECT resource_id FROM demo_resources WHERE resource_type='INCIDENT'", String.class);
    db.update("UPDATE incidents SET group_id=NULL WHERE id IN (SELECT resource_id::uuid FROM demo_resources WHERE resource_type='INCIDENT')");
    for (String id : incidentIds) {
      db.update("DELETE FROM jobs WHERE resource_id=?", UUID.fromString(id));
      db.update("DELETE FROM idempotency_records WHERE resource_id=?", UUID.fromString(id));
      db.update("DELETE FROM incidents WHERE id=?", UUID.fromString(id));
    }
    var groupIds = db.queryForList("SELECT resource_id FROM demo_resources WHERE resource_type='GROUP'", String.class);
    for (String id : groupIds) db.update("DELETE FROM incident_groups WHERE id=?", UUID.fromString(id));
    var readingIds = db.queryForList("SELECT resource_id FROM demo_resources WHERE resource_type='READING'", String.class);
    for (String id : readingIds) db.update("DELETE FROM meter_readings WHERE reading_id=?", id);
    db.update("DELETE FROM operations WHERE demo_scope=TRUE");
    db.update("DELETE FROM demo_resources");
    db.update("UPDATE demo_state SET mode='NORMAL',initialized_at=NULL,seed_version=NULL,generation_counter=0 WHERE id=1");
  }

  @Transactional
  Map<String, Object> setMode(String requested) {
    requireEnabled();
    ApiProblem.require(Set.of("NORMAL", "STORM").contains(requested), 422, "DEMO_MODE", "Mode must be NORMAL or STORM");
    lock();
    var rows = db.queryForList("SELECT initialized_at FROM demo_state WHERE id=1 FOR UPDATE");
    ApiProblem.require(!rows.isEmpty() && rows.getFirst().get("initialized_at") != null,
        409, "DEMO_NOT_INITIALIZED", "Initialize the demo dataset before starting a mode.");
    db.update("UPDATE demo_state SET mode=? WHERE id=1", requested);
    return status();
  }

  @Scheduled(fixedDelayString = "${filegrid.demo-storm-delay-ms:1000}")
  @Transactional
  public void stormTick() {
    if (!scope.enabled()) return;
    lock();
    var rows = db.queryForList("SELECT mode,initialized_at FROM demo_state WHERE id=1 FOR UPDATE");
    if (rows.isEmpty() || rows.getFirst().get("initialized_at") == null
        || !"STORM".equals(rows.getFirst().get("mode")) || count("INCIDENT") >= MAX_INCIDENTS) return;
    int sequence = Math.toIntExact(db.queryForObject("SELECT generation_counter FROM demo_state WHERE id=1", Long.class).longValue()) + 1;
    scope.asDemo(() -> {
      createStormIncident(sequence, adminIdentity("demo-storm"));
      return null;
    });
    db.update("UPDATE demo_state SET generation_counter=? WHERE id=1", sequence);
  }

  private void seedReadings(Authentication a) {
    for (int index = 1; index <= 4; index++) {
      Instant at = Instant.now().minusSeconds(index * 3600L);
      String identity = "demo-" + UUID.randomUUID();
      String payload = "{\"schema_version\":1,\"reading_id\":\"" + identity
          + "\",\"meter_id\":\"DEMO-METER-" + identity + "\",\"sequence_number\":1,\"measured_at\":\""
          + at + "\",\"energy_kwh\":" + (1200.5 + 37 * index) + "}";
      byte[] content = payload.getBytes(StandardCharsets.UTF_8);
      long start = System.nanoTime();
      files.meter(content, a);
      metrics.record("METER_READING", "DATABASE", "ingest", start, content.length, true);
    }
  }

  private void seedIncidents(Authentication a) {
    Object[][] rows = {
      {"Dobrogea", "VOLTAGE_DROP", 4, 44.1800, 28.6500}, {"Dobrogea", "VOLTAGE_DROP", 3, 44.1804, 28.6504},
      {"Muntenia", "LINE_INSPECTION", 2, 44.4300, 26.1000}, {"Muntenia", "LINE_INSPECTION", 3, 44.4304, 26.1004},
      {"Banat", "EQUIPMENT_FAILURE", 5, 45.7500, 21.2300}, {"Banat", "EQUIPMENT_FAILURE", 4, 45.7504, 21.2304}
    };
    for (int i = 0; i < rows.length; i++) {
      var input = new LinkedHashMap<String, Object>();
      input.put("stationId", "DEMO-ST-" + (i + 1)); input.put("zone", rows[i][0]);
      input.put("eventType", rows[i][1]); input.put("severity", rows[i][2]);
      input.put("affectedCustomers", 35 + i * 27); input.put("latitude", rows[i][3]);
      input.put("longitude", rows[i][4]); input.put("safetyCritical", i == 4);
      input.put("occurredAt", Instant.now().minusSeconds((rows.length - i) * 180L).toString());
      input.put("demoSet", SEED_VERSION);
      files.createIncident(input, "demo-seed-incident-" + (i + 1), a);
    }
  }

  private void seedFiles(Authentication a) throws IOException {
    var incidents = db.queryForList("SELECT resource_id FROM demo_resources WHERE resource_type='INCIDENT' ORDER BY created_at LIMIT 3", String.class);
    for (int i = 0; i < incidents.size(); i++) {
      Map<String, Object> context = new LinkedHashMap<>();
      context.put("incidentId", incidents.get(i)); context.put("attachmentType", "BINARY");
      context.put("sensitivity", "SENSITIVE"); context.put("demo", true);
      upload(a, "INCIDENT", "demo-incident-" + (i + 1) + ".txt", "text/plain",
          ("Synthetic field report " + (i + 1) + "\nNo personal information.\n").getBytes(StandardCharsets.UTF_8), context, false);
    }
    Map<String, Object> ftp = new LinkedHashMap<>();
    ftp.put("incidentId", incidents.get(0)); ftp.put("attachmentType", "LEGACY_LOG");
    ftp.put("sensitivity", "NON_SENSITIVE"); ftp.put("demo", true);
    upload(a, "INCIDENT", "demo-legacy-diagnostic.txt", "text/plain",
        "Synthetic legacy diagnostic; no personal data.\n".getBytes(StandardCharsets.UTF_8), ftp, false);
    for (int i = 1; i <= 2; i++) {
      Map<String, Object> doc = new LinkedHashMap<>(); doc.put("applicationId", "DEMO-APP-" + i);
      doc.put("documentType", "SYNTHETIC_CONNECTION_PLAN"); doc.put("demo", true);
      upload(a, "CONNECTION_DOCUMENT", "demo-connection-" + i + ".txt", "text/plain",
          ("Synthetic connection plan " + i + "\n").getBytes(StandardCharsets.UTF_8), doc, false);
    }
    Map<String, Object> drone = new LinkedHashMap<>(); drone.put("stationId", "DEMO-DRONE-ST"); drone.put("zone", "Dobrogea"); drone.put("demo", true);
    int[] videoSizes = {256 * 1024, 9 * 1024 * 1024, 17 * 1024 * 1024};
    for (int i = 0; i < videoSizes.length; i++) {
      byte[] video = new byte[videoSizes[i]];
      new Random(41 + i).nextBytes(video);
      upload(a, "DRONE_VIDEO", "demo-inspection-video-" + (i + 1) + ".bin", "application/octet-stream", video, drone, true);
    }
  }

  private void upload(Authentication a, String category, String name, String type, byte[] bytes,
      Map<String, Object> context, boolean multipart) throws IOException {
    var request = new LinkedHashMap<String, Object>(context);
    request.put("category", category); request.put("filename", name); request.put("contentType", type);
    request.put("sizeBytes", bytes.length); request.put("sha256", Integrity.sha256(bytes));
    var response = files.createSession(request, "demo-session-" + UUID.randomUUID(), a);
    UUID id = UUID.fromString(response.get("sessionId").toString());
    long started = System.nanoTime();
    if (multipart) {
      for (int offset = 0, part = 1; offset < bytes.length; offset += FileService.PART_SIZE, part++) {
        byte[] body = Arrays.copyOfRange(bytes, offset, Math.min(bytes.length, offset + FileService.PART_SIZE));
        files.putPart(id, part, body, Integrity.sha256(body), a);
      }
    } else files.putSmall(id, bytes, a);
    UUID fileId = UUID.fromString(response.get("fileId").toString());
    metrics.record(category, files.raw(fileId).storage(), multipart ? "demo_multipart_upload" : "demo_upload", started, bytes.length, true);
    files.complete(id, a);
  }

  private void createStormIncident(int n, Authentication a) {
    String[] zones = {"Dobrogea", "Muntenia", "Banat"};
    double[][] coords = {{44.18, 28.65}, {44.43, 26.10}, {45.75, 21.23}};
    int region = (n - 1) % zones.length;
    var input = new LinkedHashMap<String, Object>();
    input.put("stationId", "DEMO-STORM-" + n); input.put("zone", zones[region]);
    input.put("eventType", "STORM_FEEDER_ALERT"); input.put("severity", 1 + n % 5);
    input.put("affectedCustomers", 20 + n * 3); input.put("latitude", coords[region][0] + (n % 4) * 0.002);
    input.put("longitude", coords[region][1] + (n % 4) * 0.002); input.put("safetyCritical", n % 9 == 0);
    input.put("occurredAt", Instant.now().toString()); input.put("demoSet", "storm");
    var created = files.createIncident(input, "demo-storm-" + n, a);
    try {
      Map<String, Object> context = new LinkedHashMap<>();
      context.put("incidentId", created.get("id").toString()); context.put("demo", true);
      if (n % 10 == 0) {
        context.put("attachmentType", "LEGACY_LOG"); context.put("sensitivity", "NON_SENSITIVE");
        upload(a, "INCIDENT", "demo-storm-diagnostic-" + n + ".txt", "text/plain",
            ("Storm generator diagnostic " + n + "\n").getBytes(StandardCharsets.UTF_8), context, false);
      } else {
        context.put("attachmentType", "BINARY"); context.put("sensitivity", "SENSITIVE");
        upload(a, "INCIDENT", "demo-storm-report-" + n + ".txt", "text/plain",
            ("Storm generated synthetic report " + n + "\n").getBytes(StandardCharsets.UTF_8), context, false);
      }
    } catch (IOException e) { throw new DemoSeedFailure(e); }
  }

  private long count(String type) { return db.queryForObject("SELECT count(*) FROM demo_resources WHERE resource_type=?", Long.class, type); }
  private long countAllResources() { return db.queryForObject("SELECT count(*) FROM demo_resources", Long.class); }
  private void requireEnabled() { ApiProblem.require(scope.enabled(), 404, "DEMO_DISABLED", "The demo service is disabled."); }
  private void lock() { db.queryForList("SELECT pg_advisory_xact_lock(hashtextextended('filegrid-demo-state',0))"); }
  private static Authentication adminIdentity(String name) {
    return new UsernamePasswordAuthenticationToken(name, "", List.of(new SimpleGrantedAuthority("ROLE_ADMIN")));
  }
  private static final class DemoSeedFailure extends RuntimeException {
    DemoSeedFailure(IOException cause) { super(cause); }
  }
}
