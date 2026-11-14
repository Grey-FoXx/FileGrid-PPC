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
    p.add("spring.datasource.password", () -> "");
    p.add("filegrid.accounts-file", () -> root.resolve("accounts").toString());
    p.add("filegrid.encryption-key-file", () -> root.resolve("key").toString());
    p.add("filegrid.worker-token-file", () -> root.resolve("token").toString());
    p.add("filegrid.alert-token-file", () -> root.resolve("token").toString());
    p.add("filegrid.monitor-initial-delay", () -> "3600000");
    p.add(
        "filegrid.policy-file",
        () -> Path.of("../config/storage-policies.yaml").toAbsolutePath().toString());
  }

  @Autowired MockMvc mvc;
  @Autowired ObjectMapper json;
  @Autowired JdbcTemplate db;
  @Autowired JobService jobs;
  @Autowired RuntimeMonitoring monitoring;
  @Autowired io.micrometer.core.instrument.MeterRegistry registry;
  @MockitoBean Storage storage;
  final Map<String, byte[]> stored = new ConcurrentHashMap<>();
  final Map<Integer, byte[]> parts = new ConcurrentHashMap<>();

  @BeforeEach
  void mockAdapters() throws Exception {
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
    when(storage.beginMultipart(anyString())).thenReturn("upload-test");
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
  void alertsAuthenticateDeduplicateAndResolve() throws Exception {
    String payload =
        "{\"alerts\":[{\"fingerprint\":\"deadbeef\",\"status\":\"firing\",\"startsAt\":\"2026-11-14T10:00:00Z\",\"labels\":{\"alertname\":\"IntegrityFailure\",\"category\":\"ALL\"},\"annotations\":{\"summary\":\"fixture\"}}]}";
    mvc.perform(
            post("/internal/v1/alerts/receive").contentType("application/json").content(payload))
        .andExpect(status().isForbidden());
    for (int n = 0; n < 2; n++)
      call(
          post("/internal/v1/alerts/receive")
              .header("Authorization", "Bearer test-worker-token")
              .contentType("application/json")
              .content(payload),
          200);
    assertEquals(
        1L,
        db.queryForObject("SELECT count(*) FROM alerts WHERE fingerprint='deadbeef'", Long.class));
    String resolved =
        payload.replace(
            "\"status\":\"firing\"", "\"status\":\"resolved\",\"endsAt\":\"2026-11-14T10:01:00Z\"");
    call(
        post("/internal/v1/alerts/receive")
            .header("Authorization", "Bearer test-worker-token")
            .contentType("application/json")
            .content(resolved),
        200);
    assertEquals(
        "RESOLVED",
        db.queryForObject("SELECT status FROM alerts WHERE fingerprint='deadbeef'", String.class));
  }

  @Test
  @org.springframework.transaction.annotation.Transactional
  void sequenceGapGraceUsesServerObservationAndSurvivesNewerReadings() throws Exception {
    String meter = "GAP-CLOCK";
    for (int sequence : new int[] {1, 3, 4}) {
      var body =
          Map.of(
              "schema_version",
              1,
              "reading_id",
              meter + "-" + sequence,
              "meter_id",
              meter,
              "sequence_number",
              sequence,
              "measured_at",
              Instant.now().toString(),
              "energy_kwh",
              1000 + sequence);
      var reply =
          call(
              as(post("/api/v1/meter-readings"), "meter")
                  .contentType("application/json")
                  .content(json.writeValueAsBytes(body)),
              201);
      if (sequence == 3)
        db.update(
            "UPDATE files SET created_at=now()-interval '2 minutes' WHERE id=?",
            UUID.fromString(reply.get("fileId").asText()));
    }
    monitoring.sample();
    assertEquals(
        1.0,
        registry
            .get("filegrid.meter.sequence.gaps")
            .tag("category", "METER_READING")
            .gauge()
            .value());
    var late =
        Map.of(
            "schema_version",
            1,
            "reading_id",
            meter + "-2",
            "meter_id",
            meter,
            "sequence_number",
            2,
            "measured_at",
            Instant.now().toString(),
            "energy_kwh",
            1002);
    call(
        as(post("/api/v1/meter-readings"), "meter")
            .contentType("application/json")
            .content(json.writeValueAsBytes(late)),
        201);
    monitoring.sample();
    assertEquals(
        0.0,
        registry
            .get("filegrid.meter.sequence.gaps")
            .tag("category", "METER_READING")
            .gauge()
            .value());
  }

  @Test
  @org.springframework.transaction.annotation.Transactional
  void secondStorageConnectionFailureDoesNotLeakFileContentLength() throws Exception {
    byte[] data = "fictitious document for response-boundary regression".getBytes();
    var session =
        session(
            "connection", "CONNECTION_DOCUMENT", data, Map.of("applicationId", "FAIL-SECOND-READ"));
    String sid = session.get("sessionId").asText(), fid = session.get("fileId").asText();
    call(as(put("/api/v1/upload-sessions/" + sid + "/content"), "connection").content(data), 200);
    call(as(post("/api/v1/upload-sessions/" + sid + "/complete"), "connection"), 202);
    available(fid);
    byte[] ciphertext = stored.get(fid + ".bin");
    when(storage.open(eq("S3"), eq(fid + ".bin"), nullable(String.class)))
        .thenReturn(new ByteArrayInputStream(ciphertext))
        .thenThrow(new IOException("simulated second connection reset"));
    var response =
        mvc.perform(as(get("/api/v1/files/" + fid + "/content"), "connection"))
            .andExpect(status().isServiceUnavailable())
            .andReturn()
            .getResponse();
    assertTrue(response.getContentType().startsWith("application/problem+json"));
    String declared = response.getHeader("Content-Length");
    assertTrue(
        declared == null || Integer.parseInt(declared) == response.getContentAsByteArray().length);
    assertNull(response.getHeader("Content-Disposition"));
  }

  @Test
  void unauthenticatedResponseCarriesCorrelationIdInHeaderAndProblemBody() throws Exception {
    mvc.perform(get("/api/v1/me").header("X-Correlation-ID", "bh-check-unauth"))
        .andExpect(status().isUnauthorized())
        .andExpect(header().string("X-Correlation-ID", "bh-check-unauth"))
        .andExpect(jsonPath("$.correlationId").value("bh-check-unauth"));
  }

  @Test
  void wrongBasicPasswordCarriesCorrelationIdInHeaderAndProblemBody() throws Exception {
    mvc.perform(
            get("/api/v1/me")
                .with(httpBasic("admin", "incorrect"))
                .header("X-Correlation-ID", "bh-check-bad-password"))
        .andExpect(status().isUnauthorized())
        .andExpect(header().string("X-Correlation-ID", "bh-check-bad-password"))
        .andExpect(jsonPath("$.correlationId").value("bh-check-bad-password"));
  }

  @AfterAll
  void stop() throws Exception {
    if (pg != null) pg.close();
  }
}
