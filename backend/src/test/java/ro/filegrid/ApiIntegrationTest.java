package ro.filegrid;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.httpBasic;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.fasterxml.jackson.databind.*;
import io.zonky.test.db.postgres.embedded.EmbeddedPostgres;
import java.io.*;
import java.nio.file.*;
import java.time.*;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

@SpringBootTest
@AutoConfigureMockMvc
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class ApiIntegrationTest {
  static EmbeddedPostgres pg;
  static Path root;

  @DynamicPropertySource
  static void properties(DynamicPropertyRegistry p) throws Exception {
    pg = EmbeddedPostgres.builder().setPort(0).start();
    root = Files.createTempDirectory("filegrid-test-");
    Files.write(root.resolve("key"), new byte[32]);
    Files.writeString(root.resolve("token"), "test-worker-token");
    Files.writeString(
        root.resolve("accounts"),
        "admin=fixture:ADMIN\n"
            + "connection=fixture:CONNECTION_AGENT\n"
            + "connection2=fixture:CONNECTION_AGENT\n"
            + "meter=fixture:METER_INGEST\n"
            + "dispatcher=fixture:DISPATCHER\n"
            + "field=fixture:FIELD_OPERATOR\n");
    p.add("spring.datasource.url", () -> pg.getJdbcUrl("postgres", "postgres"));
    p.add("spring.datasource.username", () -> "postgres");
    p.add("filegrid.verify-initial-delay", () -> "3600000");
    p.add("filegrid.demo-storm-delay-ms", () -> "60000");
    p.add("filegrid.demo-feed-delay-ms", () -> "3600000");
    p.add("filegrid.demo-probe-delay-ms", () -> "3600000");
    p.add("spring.datasource.password", () -> "");
    p.add("filegrid.accounts-file", () -> root.resolve("accounts").toString());
    p.add("filegrid.encryption-key-file", () -> root.resolve("key").toString());
    p.add("filegrid.worker-token-file", () -> root.resolve("token").toString());
    p.add(
        "filegrid.policy-file",
        () -> Path.of("../config/storage-policies.yaml").toAbsolutePath().toString());
  }

  @Autowired MockMvc mvc;
  @Autowired ObjectMapper json;
  @Autowired JdbcTemplate db;
  @Autowired JobService jobs;
  @Autowired DemoService demoService;
  @Autowired DemoExperience demoExperience;
  @MockitoBean Storage storage;
  final Map<String, byte[]> stored = new ConcurrentHashMap<>();
  final Map<Integer, byte[]> parts = new ConcurrentHashMap<>();

  @BeforeEach
  void mockAdapters() throws Exception {
    db.execute("TRUNCATE TABLE operations,audit_events,jobs,upload_parts,upload_sessions,idempotency_records,"
        + "meter_readings,blobs,files,incidents,incident_groups,demo_resources RESTART IDENTITY CASCADE");
    db.update("UPDATE demo_state SET mode='NORMAL',initialized_at=NULL,seed_version=NULL,generation_counter=0 WHERE id=1");
    db.update("DELETE FROM demo_notifications");
    db.update("UPDATE demo_flow_control SET multiplier=1,next_files_at=now()+interval '1 hour' WHERE id=1");
    stored.clear();
    parts.clear();
    when(storage.put(anyString(), anyString(), any(byte[].class)))
        .thenAnswer(
            x -> {
              stored.put(x.getArgument(1), x.getArgument(2));
              return "v1";
            });
    when(storage.open(anyString(), anyString(), nullable(String.class)))
        .thenAnswer(
            x -> {
              byte[] b = stored.get(x.getArgument(1));
              if (b == null) throw new IOException("missing object");
              return new ByteArrayInputStream(b);
            });
    when(storage.beginMultipart(anyString()))
        .thenAnswer(x -> { parts.clear(); return UUID.randomUUID().toString(); });
    when(storage.part(anyString(), anyString(), anyInt(), any(byte[].class)))
        .thenAnswer(
            x -> {
              parts.put(x.getArgument(2), x.getArgument(3));
              return "etag-" + x.getArgument(2);
            });
    when(storage.complete(anyString(), anyString(), anyList()))
        .thenAnswer(
            x -> {
              var b = new ByteArrayOutputStream();
              for (var p : parts.entrySet().stream().sorted(Map.Entry.comparingByKey()).toList())
                b.write(p.getValue());
              stored.put(x.getArgument(0), b.toByteArray());
              return "v1";
            });
  }

  JsonNode call(MockHttpServletRequestBuilder request, int status) throws Exception {
    return json.readTree(
        mvc.perform(request)
            .andExpect(status().is(status))
            .andReturn()
            .getResponse()
            .getContentAsByteArray());
  }

  MockHttpServletRequestBuilder as(MockHttpServletRequestBuilder request, String user) {
    return request.with(httpBasic(user, "fixture"));
  }

  JsonNode session(String user, String category, byte[] data, Map<String, Object> context)
      throws Exception {
    var m = new LinkedHashMap<String, Object>(context);
    m.put("category", category);
    m.put("filename", "fixture.bin");
    m.put("contentType", "application/octet-stream");
    m.put("sizeBytes", data.length);
    m.put("sha256", Integrity.sha256(data));
    return call(
        as(post("/api/v1/upload-sessions"), user)
            .header("Idempotency-Key", UUID.randomUUID().toString())
            .contentType("application/json")
            .content(json.writeValueAsBytes(m)),
        201);
  }

  void available(String fileId) throws Exception {
    for (int i = 0; i < 30; i++) {
      jobs.verify();
      if (call(as(get("/api/v1/files/" + fileId), "admin"), 200)
          .get("status")
          .asText()
          .equals("AVAILABLE")) return;
      Thread.sleep(50);
    }
    fail("File not available");
  }

  @Test
  void fourCategoriesIdentityAuthorizationResumeAndIndependentMl() throws Exception {
    mvc.perform(get("/api/v1/me"))
        .andExpect(status().isUnauthorized())
        .andExpect(content().contentType("application/problem+json"));
    byte[] reading =
        "{\n  \"schema_version\":1,\"reading_id\":\"test-1\",\"meter_id\":\"meter-1\",\"sequence_number\":1,\"measured_at\":\"2026-11-14T10:00:00Z\",\"energy_kwh\":1542.8\n}"
            .getBytes();
    JsonNode first =
        call(
            as(post("/api/v1/meter-readings"), "meter")
                .contentType("application/json")
                .content(reading),
            201);
    assertTrue(
        call(
                as(post("/api/v1/meter-readings"), "meter")
                    .contentType("application/json")
                    .content(reading),
                200)
            .get("duplicate")
            .asBoolean());
    mvc.perform(
            as(post("/api/v1/meter-readings"), "meter")
                .contentType("application/json")
                .content(new String(reading).replace("1542.8", "1542.9")))
        .andExpect(status().isConflict());
    assertEquals(1L, db.queryForObject("SELECT count(*) FROM meter_readings", Long.class));
    // DATABASE content uses the actual PostgreSQL blob, not the external-storage mock.
    String meterKey = first.get("fileId").asText() + ".bin";
    stored.put(
        meterKey,
        db.queryForObject("SELECT content FROM blobs WHERE storage_key=?", byte[].class, meterKey));
    assertArrayEquals(
        reading,
        mvc.perform(as(get("/api/v1/files/" + first.get("fileId").asText() + "/content"), "admin"))
            .andExpect(status().isOk())
            .andReturn()
            .getResponse()
            .getContentAsByteArray());
    String incident =
        call(
                as(post("/api/v1/incidents"), "admin")
                    .header("Idempotency-Key", "incident-1")
                    .contentType("application/json")
                    .content(
                        "{\"stationId\":\"ST-1\",\"zone\":\"Dobrogea\",\"eventType\":\"VOLTAGE_DROP\",\"severity\":4,\"latitude\":44.18,\"longitude\":28.65}"),
                201)
            .get("id")
            .asText();
    byte[] log = "legacy diagnostic, no personal data".getBytes();
    JsonNode s =
        session(
            "admin",
            "INCIDENT",
            log,
            Map.of(
                "incidentId",
                incident,
                "attachmentType",
                "LEGACY_LOG",
                "sensitivity",
                "NON_SENSITIVE"));
    String sid = s.get("sessionId").asText(), fid = s.get("fileId").asText();
    call(as(put("/api/v1/upload-sessions/" + sid + "/content"), "admin").content(log), 200);
    call(as(post("/api/v1/upload-sessions/" + sid + "/complete"), "admin"), 202);
    available(fid);
    assertEquals(
        "FTP", call(as(get("/api/v1/files/" + fid), "admin"), 200).get("storage").asText());
    assertArrayEquals(
        log,
        mvc.perform(as(get("/api/v1/files/" + fid + "/content"), "dispatcher"))
            .andExpect(status().isOk())
            .andReturn()
            .getResponse()
            .getContentAsByteArray());
    assertEquals(
        "PENDING",
        call(as(get("/api/v1/incidents/" + incident + "/analysis"), "dispatcher"), 200)
            .get("mlStatus")
            .asText());
    mvc.perform(post("/internal/v1/jobs/claim").header("X-Worker-Token", "wrong"))
        .andExpect(status().isForbidden());
    JsonNode job =
        call(post("/internal/v1/jobs/claim").header("X-Worker-Token", "test-worker-token"), 200);
    assertEquals(incident, job.get("incident").get("id").asText());
    // Stopping/failing ML must leave the attachment available.
    call(
        post("/internal/v1/jobs/" + job.get("jobId").asText() + "/fail")
            .header("X-Worker-Token", "test-worker-token")
            .contentType("application/json")
            .content("{\"attempt\":" + job.get("attempt").asInt() + "}"),
        200);
    assertEquals(
        "AVAILABLE",
        call(as(get("/api/v1/files/" + fid), "dispatcher"), 200).get("status").asText());
    byte[] doc = "fictitious identity document".getBytes();
    JsonNode d =
        session("connection", "CONNECTION_DOCUMENT", doc, Map.of("applicationId", "APP-1"));
    String ds = d.get("sessionId").asText(), df = d.get("fileId").asText();
    call(as(put("/api/v1/upload-sessions/" + ds + "/content"), "connection").content(doc), 200);
    call(as(post("/api/v1/upload-sessions/" + ds + "/complete"), "connection"), 202);
    available(df);
    assertFalse(Arrays.equals(doc, stored.get(df + ".bin")));
    mvc.perform(as(get("/api/v1/files/" + df + "/content"), "connection2"))
        .andExpect(status().isForbidden());
    assertArrayEquals(
        doc,
        mvc.perform(as(get("/api/v1/files/" + df + "/content"), "connection"))
            .andExpect(status().isOk())
            .andReturn()
            .getResponse()
            .getContentAsByteArray());
    byte[] video = new byte[FileService.PART_SIZE + 17];
    new Random(42).nextBytes(video);
    JsonNode v = session("admin", "DRONE_VIDEO", video, Map.of());
    String vs = v.get("sessionId").asText(), vf = v.get("fileId").asText();
    byte[] part1 = Arrays.copyOfRange(video, 0, FileService.PART_SIZE),
        part2 = Arrays.copyOfRange(video, FileService.PART_SIZE, video.length);
    call(
        as(put("/api/v1/upload-sessions/" + vs + "/parts/1"), "admin")
            .header("X-Part-SHA256", Integrity.sha256(part1))
            .content(part1),
        200);
    assertEquals(
        1,
        call(as(get("/api/v1/upload-sessions/" + vs), "admin"), 200).get("confirmedParts").size());
    call(
        as(put("/api/v1/upload-sessions/" + vs + "/parts/1"), "admin")
            .header("X-Part-SHA256", Integrity.sha256(part1))
            .content(part1),
        200);
    byte[] changed = part1.clone();
    changed[0] ^= 1;
    mvc.perform(
            as(put("/api/v1/upload-sessions/" + vs + "/parts/1"), "admin")
                .header("X-Part-SHA256", Integrity.sha256(changed))
                .content(changed))
        .andExpect(status().isConflict());
    call(
        as(put("/api/v1/upload-sessions/" + vs + "/parts/2"), "admin")
            .header("X-Part-SHA256", Integrity.sha256(part2))
            .content(part2),
        200);
    call(as(post("/api/v1/upload-sessions/" + vs + "/complete"), "admin"), 202);
    available(vf);
    assertArrayEquals(
        video,
        mvc.perform(as(get("/api/v1/files/" + vf + "/content"), "admin"))
            .andExpect(status().isOk())
            .andReturn()
            .getResponse()
            .getContentAsByteArray());
    stored.put(fid + ".bin", "corrupted".getBytes());
    mvc.perform(as(get("/api/v1/files/" + fid + "/content"), "admin"))
        .andExpect(status().isBadGateway());
    call(as(get("/api/v1/stats/technical"), "admin"), 200);
    call(as(get("/api/v1/stats/business"), "admin"), 200);
  }

  @Test
  void persistentIncidentGroupsTransitionTogetherAndKeepResolvedHistory() throws Exception {
    String first = call(as(post("/api/v1/incidents"), "admin")
        .header("Idempotency-Key", UUID.randomUUID().toString()).contentType("application/json")
        .content("{\"stationId\":\"GROUP-TEST-ST\",\"zone\":\"Banat\",\"eventType\":\"GROUP_TEST\",\"severity\":3,\"latitude\":45.75,\"longitude\":21.23}"), 201).get("id").asText();
    String second = call(as(post("/api/v1/incidents"), "admin")
        .header("Idempotency-Key", UUID.randomUUID().toString()).contentType("application/json")
        .content("{\"stationId\":\"GROUP-TEST-ST\",\"zone\":\"Banat\",\"eventType\":\"GROUP_TEST\",\"severity\":4,\"latitude\":45.7503,\"longitude\":21.2302}"), 201).get("id").asText();
    JsonNode firstIncident = call(as(get("/api/v1/incidents/" + first), "dispatcher"), 200);
    JsonNode secondIncident = call(as(get("/api/v1/incidents/" + second), "dispatcher"), 200);
    String group = firstIncident.get("groupId").asText();
    assertEquals(group, secondIncident.get("groupId").asText());
    assertEquals("NEW", secondIncident.get("interventionStatus").asText());
    Map<String, Object> claimed = jobs.claimMl();
    Map<String, Object> modelResult = new LinkedHashMap<>();
    modelResult.put("priorityScore", 82.0); modelResult.put("priorityClass", "HIGH");
    modelResult.put("recommendation", "HIGH_PRIORITY_REVIEW"); modelResult.put("reasons", List.of("synthetic integration fixture"));
    modelResult.put("modelVersions", Map.of("impact", "test", "correlation", "test"));
    modelResult.put("synthetic", true); modelResult.put("clusterMemberIds", List.of(first, second));
    jobs.finishMl(UUID.fromString(claimed.get("jobId").toString()),
        ((Number) claimed.get("attempt")).intValue(), modelResult, true);
    assertEquals("COMPLETED", call(as(get("/api/v1/incidents/" + first + "/analysis"), "dispatcher"), 200).get("mlStatus").asText());
    JsonNode groups = call(as(get("/api/v1/incident-groups"), "dispatcher"), 200);
    JsonNode item = null;
    for (JsonNode value : groups.get("items")) if (value.get("id").asText().equals(group)) item = value;
    assertNotNull(item);
    assertEquals(2, item.get("incidents").size());
    assertTrue(item.get("groupAnalysis").get("interpretation").asText().contains("does not prove"));
    mvc.perform(as(patch("/api/v1/incident-groups/" + group + "/status"), "field")
            .contentType("application/json").content("{\"status\":\"DISPATCHED\"}"))
        .andExpect(status().isForbidden());
    call(as(patch("/api/v1/incident-groups/" + group + "/status"), "dispatcher")
        .contentType("application/json").content("{\"status\":\"DISPATCHED\"}"), 200);
    assertEquals("DISPATCHED", call(as(get("/api/v1/incidents/" + first), "dispatcher"), 200).get("interventionStatus").asText());
    call(as(patch("/api/v1/incident-groups/" + group + "/status"), "admin")
        .contentType("application/json").content("{\"status\":\"RESOLVED\"}"), 200);
    mvc.perform(as(patch("/api/v1/incident-groups/" + group + "/status"), "dispatcher")
            .contentType("application/json").content("{\"status\":\"NEW\"}"))
        .andExpect(status().isConflict());
    assertEquals("RESOLVED", call(as(get("/api/v1/incidents/" + second), "dispatcher"), 200).get("interventionStatus").asText());
    assertEquals(0, call(as(get("/api/v1/incident-groups"), "dispatcher"), 200).get("items").findValuesAsText("id").stream().filter(group::equals).count());
    JsonNode history = call(as(get("/api/v1/incident-groups?includeResolved=true"), "dispatcher"), 200);
    assertTrue(history.get("items").findValuesAsText("id").contains(group));
  }

  @Test
  void alwaysAvailableDemoControlsRealFeedAndRecoversOnlyItsOwnFixture() throws Exception {
    assertTrue(call(as(get("/api/v1/me"), "admin"),200).get("features").get("demo").asBoolean());
    call(as(put("/api/v1/demo/volume"),"field").contentType("application/json").content("{\"multiplier\":10}"),403);
    call(as(put("/api/v1/demo/volume"),"admin").contentType("application/json").content("{\"multiplier\":11}"),422);
    call(as(put("/api/v1/demo/volume"),"admin").contentType("application/json").content("{\"multiplier\":1.5}"),422);
    call(as(put("/api/v1/demo/volume"),"admin").contentType("application/json").content("{\"multiplier\":10}"),200);
    assertEquals(10,call(as(get("/api/v1/simulator"),"meter"),200).get("multiplier").asInt());
    call(as(post("/api/v1/demo/initialize"),"admin"),200);
    db.update("UPDATE demo_flow_control SET next_files_at=now()-interval '1 second' WHERE id=1");
    long before=db.queryForObject("SELECT count(*) FROM files",Long.class);
    demoService.mixedFeedTick();
    assertEquals(before+3,db.queryForObject("SELECT count(*) FROM files",Long.class));
    call(as(post("/api/v1/demo/notifications/test"),"admin"),200);
    assertTrue(call(as(get("/api/v1/demo"),"dispatcher"),200).get("notifications").get(0).get("synthetic").asBoolean());
    call(as(post("/api/v1/demo/integrity-probes"),"field"),403);
    JsonNode probe=call(as(post("/api/v1/demo/integrity-probes"),"admin"),200);
    UUID id=UUID.fromString(probe.get("fileId").asText());
    demoExperience.recoverTick();
    assertEquals("CORRUPTED",db.queryForObject("SELECT status FROM files WHERE id=?",String.class,id));
    demoExperience.recoverTick();
    assertEquals("RECOVERED",db.queryForObject("SELECT state FROM demo_integrity_probes WHERE file_id=?",String.class,id));
    mvc.perform(as(get("/api/v1/files/"+id+"/content"),"admin")).andExpect(status().isOk());
    assertEquals("AVAILABLE",db.queryForObject("SELECT status FROM files WHERE id=?",String.class,id));
  }

  @Test
  void demoScopeSeedsAndResetsOnlyTaggedResources() throws Exception {
    byte[] legacyReading = "{\"schema_version\":1,\"reading_id\":\"legacy-preserve\",\"meter_id\":\"legacy-meter\",\"sequence_number\":1,\"measured_at\":\"2026-11-14T10:00:00Z\",\"energy_kwh\":1.25}".getBytes();
    call(as(post("/api/v1/meter-readings"), "meter").contentType("application/json").content(legacyReading), 201);
    long preexistingFiles = db.queryForObject("SELECT count(*) FROM files", Long.class);
    var fileIds = db.queryForList("SELECT id FROM files ORDER BY id", UUID.class);
    assertTrue(call(as(get("/api/v1/me"), "admin"), 200).get("features").get("demo").asBoolean());
    assertTrue(call(as(get("/api/v1/me"), "dispatcher"), 200).get("features").get("demo").asBoolean());
    mvc.perform(as(post("/api/v1/demo/initialize"), "dispatcher")).andExpect(status().isForbidden());
    JsonNode initialized = call(as(post("/api/v1/demo/initialize"), "admin"), 200);
    assertTrue(initialized.get("initialized").asBoolean());
    assertEquals(6, initialized.get("seedCounts").get("incidents").asInt());
    assertEquals(4, initialized.get("seedCounts").get("readings").asInt());
    assertEquals(13, initialized.get("seedCounts").get("files").asInt());
    JsonNode scopedFiles = call(as(get("/api/v1/files?size=100"), "admin").header("X-FileGrid-Demo", "true"), 200);
    assertTrue(scopedFiles.get("total").asInt() > 10);
    JsonNode scopedReadings = call(as(get("/api/v1/meter-readings?size=100"), "dispatcher").header("X-FileGrid-Demo", "true"), 200);
    assertEquals(4, scopedReadings.get("total").asInt());
    JsonNode scopedGroups = call(as(get("/api/v1/incident-groups"), "dispatcher").header("X-FileGrid-Demo", "true"), 200);
    assertEquals(3, scopedGroups.get("total").asInt());
    JsonNode allGroups = call(as(get("/api/v1/incident-groups"), "dispatcher"), 200);
    assertTrue(allGroups.get("total").asInt() >= scopedGroups.get("total").asInt());
    for (JsonNode scopedGroup : scopedGroups.get("items"))
      assertTrue(allGroups.get("items").findValuesAsText("id").contains(scopedGroup.get("id").asText()));
    JsonNode storm = call(as(post("/api/v1/demo/mode"), "admin").contentType("application/json").content("{\"mode\":\"STORM\"}"), 200);
    assertTrue(storm.get("generating").asBoolean());
    assertEquals("NORMAL", call(as(post("/api/v1/demo/mode"), "admin").contentType("application/json").content("{\"mode\":\"NORMAL\"}"), 200).get("mode").asText());
    JsonNode reset = call(as(post("/api/v1/demo/reset"), "admin"), 200);
    assertTrue(reset.get("initialized").asBoolean());
    assertEquals(6, reset.get("seedCounts").get("incidents").asInt());
    assertEquals(13, reset.get("seedCounts").get("files").asInt());
    assertTrue(db.queryForObject("SELECT count(*) FROM files", Long.class) >= preexistingFiles);
    for (UUID fileId : fileIds) assertEquals(1, db.queryForObject("SELECT count(*) FROM files WHERE id=?", Long.class, fileId));
    assertEquals(1L, db.queryForObject("SELECT count(*) FROM meter_readings WHERE reading_id='legacy-preserve'", Long.class));
    assertEquals(0L, db.queryForObject("SELECT count(*) FROM incidents WHERE metadata::jsonb->>'demoSet'='old-nonexistent-tag'", Long.class));
  }

  @Test
  void storagePoliciesAreValidatedVersionedAndPersistedForNewSessionsOnly() throws Exception {
    JsonNode active = call(as(get("/api/v1/policies"), "admin"), 200);
    long version = active.get("version").asLong();
    List<Map<String, Object>> rules = json.convertValue(active.get("rules"),
        new com.fasterxml.jackson.core.type.TypeReference<>() {});
    String legacy = "legacy-diagnostic";
    assertTrue(rules.stream().anyMatch(rule -> legacy.equals(rule.get("id"))));
    String incident = call(as(post("/api/v1/incidents"), "admin")
        .header("Idempotency-Key", UUID.randomUUID().toString()).contentType("application/json")
        .content("{\"stationId\":\"POLICY-TEST-ST\",\"zone\":\"Banat\",\"eventType\":\"POLICY_TEST\",\"severity\":2,\"latitude\":45.75,\"longitude\":21.23}"), 201).get("id").asText();
    byte[] diagnostic = "synthetic legacy test diagnostic".getBytes();
    JsonNode oldSession = session("admin", "INCIDENT", diagnostic,
        Map.of("incidentId", incident, "attachmentType", "LEGACY_LOG", "sensitivity", "NON_SENSITIVE"));
    JsonNode oldFile = call(as(get("/api/v1/files/" + oldSession.get("fileId").asText()), "admin"), 200);
    assertEquals("FTP", oldFile.get("storage").asText());
    assertEquals(Long.toString(version), oldFile.get("policyVersion").asText());

    var legacyRule = rules.stream().filter(rule -> legacy.equals(rule.get("id"))).findFirst().orElseThrow();
    legacyRule.put("id", "legacy-diagnostic-v" + (version + 1));
    legacyRule.put("storage", "S3");
    byte[] request = json.writeValueAsBytes(Map.of("expectedVersion", version, "rules", rules));
    JsonNode saved = call(as(put("/api/v1/policies"), "admin").contentType("application/json").content(request), 200);
    assertEquals(version + 1, saved.get("version").asLong());
    assertEquals(saved, call(as(get("/api/v1/policies"), "dispatcher"), 200));
    var peer = new PolicyEngine(db, json, Path.of("../config/storage-policies.yaml").toString());
    JsonNode peerConfig = json.valueToTree(peer.configuration());
    assertEquals(saved.get("version").asLong(), peerConfig.get("version").asLong());
    assertEquals(saved.get("rules").toString(), peerConfig.get("rules").toString());

    mvc.perform(as(put("/api/v1/policies"), "admin").contentType("application/json").content(request))
        .andExpect(status().isConflict());
    var invalid = new ArrayList<Map<String, Object>>();
    for (var rule : rules) invalid.add(new LinkedHashMap<>(rule));
    invalid.stream().filter(rule -> "connection-private".equals(rule.get("id"))).findFirst().orElseThrow()
        .put("storage", "FTP");
    mvc.perform(as(put("/api/v1/policies"), "admin").contentType("application/json")
            .content(json.writeValueAsBytes(Map.of("expectedVersion", version + 1, "rules", invalid))))
        .andExpect(status().isUnprocessableEntity());
    var nullCriterion = new ArrayList<Map<String, Object>>();
    for (var rule : rules) nullCriterion.add(new LinkedHashMap<>(rule));
    nullCriterion.stream().filter(rule -> "INCIDENT".equals(rule.get("category"))).findFirst().orElseThrow()
        .put("sensitivity", null);
    mvc.perform(as(put("/api/v1/policies"), "admin").contentType("application/json")
            .content(json.writeValueAsBytes(Map.of("expectedVersion", version + 1, "rules", nullCriterion))))
        .andExpect(status().isUnprocessableEntity());
    var missingFallback = rules.stream()
        .filter(rule -> !"METER_READING".equals(rule.get("category")))
        .map(LinkedHashMap<String, Object>::new).toList();
    mvc.perform(as(put("/api/v1/policies"), "admin").contentType("application/json")
            .content(json.writeValueAsBytes(Map.of("expectedVersion", version + 1, "rules", missingFallback))))
        .andExpect(status().isUnprocessableEntity());
    mvc.perform(as(put("/api/v1/policies"), "dispatcher").contentType("application/json").content(request))
        .andExpect(status().isForbidden());

    JsonNode newSession = session("admin", "INCIDENT", diagnostic,
        Map.of("incidentId", incident, "attachmentType", "LEGACY_LOG", "sensitivity", "NON_SENSITIVE"));
    JsonNode newFile = call(as(get("/api/v1/files/" + newSession.get("fileId").asText()), "admin"), 200);
    assertEquals("S3", newFile.get("storage").asText());
    assertEquals(Long.toString(version + 1), newFile.get("policyVersion").asText());
    assertEquals(Long.toString(version), call(as(get("/api/v1/files/" + oldSession.get("fileId").asText()), "admin"), 200).get("policyVersion").asText());

    JsonNode reset = call(as(post("/api/v1/policies/reset"), "admin").contentType("application/json")
        .content(json.writeValueAsBytes(Map.of("expectedVersion", version + 1))), 200);
    assertEquals(version + 2, reset.get("version").asLong());
    assertEquals(active.get("rules"), reset.get("rules"));
    assertEquals(version + 2, call(as(get("/api/v1/policies"), "admin"), 200).get("version").asLong());
    mvc.perform(as(post("/api/v1/policies/reset"), "admin").contentType("application/json")
            .content(json.writeValueAsBytes(Map.of("expectedVersion", version + 1))))
        .andExpect(status().isConflict());
  }

  @AfterAll
  void stop() throws Exception {
    if (pg != null) pg.close();
  }
}
