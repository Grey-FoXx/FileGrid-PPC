package ro.filegrid;

import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.security.MessageDigest;
import java.util.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

@Service
public class JobService {
  private final JdbcTemplate db;
  private final FileService files;
  private final TransactionTemplate tx;
  private final String workerToken;
  private final Storage storage;

  public JobService(
      JdbcTemplate db,
      FileService files,
      PlatformTransactionManager manager,
      Storage storage,
      @Value("${filegrid.worker-token-file}") String tokenFile)
      throws IOException {
    this.db = db;
    this.files = files;
    this.tx = new TransactionTemplate(manager);
    this.storage = storage;
    workerToken = Files.readString(Path.of(tokenFile)).trim();
  }

  public void authenticate(String token) {
    ApiProblem.require(
        token != null
            && MessageDigest.isEqual(
                workerToken.getBytes(StandardCharsets.UTF_8),
                token.getBytes(StandardCharsets.UTF_8)),
        403,
        "WORKER_AUTH",
        "Invalid worker credentials");
  }

  private Map<String, Object> claim(String kind) {
    return tx.execute(
        s -> {
          var rows =
              db.queryForList(
                  "UPDATE jobs SET state='RUNNING', attempts=attempts+1, lease_until=now()+interval"
                      + " '120 seconds' WHERE id=(SELECT id FROM jobs WHERE kind=? AND attempts<5"
                      + " AND ((state='PENDING' AND available_at<=now()) OR (state='RUNNING' AND"
                      + " lease_until<now())) ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1)"
                      + " RETURNING *",
                  kind);
          return rows.isEmpty() ? null : rows.getFirst();
        });
  }

  @Scheduled(fixedDelay = 500, initialDelayString = "${filegrid.verify-initial-delay:0}")
  public void verify() {
    var job = claim("VERIFY");
    if (job == null) return;
    UUID jobId = (UUID) job.get("id"), fileId = (UUID) job.get("resource_id");
    int attempt = ((Number) job.get("attempts")).intValue();
    var f = files.raw(fileId);
    try {
      files.check(f);
      tx.executeWithoutResult(
          s -> {
            if (db.update(
                    "UPDATE jobs SET state='COMPLETED',lease_until=NULL WHERE id=? AND"
                        + " state='RUNNING' AND attempts=?",
                    jobId,
                    attempt)
                != 1) return;
            db.update(
                "UPDATE files SET status='AVAILABLE',integrity_status='VERIFIED' WHERE id=?",
                fileId);
            db.update("UPDATE upload_sessions SET state='AVAILABLE' WHERE file_id=?", fileId);
            files.audit("system", "VERIFY", fileId.toString(), "SUCCESS");
            if (f.category().equals("INCIDENT")) {
              UUID incident =
                  UUID.fromString(FileService.text(files.decode(f.context()), "incidentId", ""));
              db.update(
                  "INSERT INTO jobs(id,kind,resource_id) VALUES (?,'ML',?) ON CONFLICT DO NOTHING",
                  UUID.randomUUID(),
                  incident);
              db.update(
                  "UPDATE incidents SET ml_status='PENDING' WHERE id=? AND"
                      + " ml_status='NOT_REQUESTED'",
                  incident);
            }
          });
    } catch (Exception e) {
      boolean corrupt = e instanceof ApiProblem p && p.code.equals("INTEGRITY_FAILED");
      boolean finalFailure = corrupt || attempt >= 5;
      tx.executeWithoutResult(
          s -> {
            int updated =
                db.update(
                    "UPDATE jobs SET state=?,available_at=now()+(? * interval '1"
                        + " second'),lease_until=NULL,last_error=? WHERE id=? AND state='RUNNING'"
                        + " AND attempts=?",
                    finalFailure ? "FAILED" : "PENDING",
                    Math.min(60, 1 << attempt),
                    corrupt ? "INTEGRITY_FAILED" : "STORAGE_UNAVAILABLE",
                    jobId,
                    attempt);
            if (updated != 1) return;
            db.update(
                "UPDATE files SET status=?,integrity_status=? WHERE id=?",
                finalFailure ? "FAILED" : "RETRY_PENDING",
                corrupt ? "FAILED" : "PENDING",
                fileId);
          });
    }
  }

  public Map<String, Object> claimMl() {
    var j = claim("ML");
    if (j == null) return Map.of();
    UUID incident = (UUID) j.get("resource_id");
    db.update("UPDATE incidents SET ml_status='RUNNING' WHERE id=?", incident);
    var source = db.queryForMap("SELECT metadata,created_at FROM incidents WHERE id=?", incident);
    var input = files.decode(source.get("metadata").toString());
    input.put("id", incident);
    input.put("createdAt", ((java.sql.Timestamp) source.get("created_at")).toInstant().toString());
    var context =
        db
            .queryForList(
                "SELECT id,metadata,created_at FROM incidents WHERE created_at>now()-interval '30"
                    + " minutes' ORDER BY created_at DESC LIMIT 1000")
            .stream()
            .map(
                x -> {
                  var m = files.decode(x.get("metadata").toString());
                  m.put("id", x.get("id"));
                  m.put(
                      "createdAt",
                      ((java.sql.Timestamp) x.get("created_at")).toInstant().toString());
                  return m;
                })
            .toList();
    return Map.of(
        "jobId", j.get("id"), "attempt", j.get("attempts"), "incident", input, "context", context);
  }

  public void finishMl(UUID id, int attempt, Map<String, Object> result, boolean success) {
    tx.executeWithoutResult(
        s -> {
          var rows =
              db.queryForList(
                  "SELECT * FROM jobs WHERE id=? AND kind='ML' AND state='RUNNING' AND attempts=?"
                      + " AND lease_until>now() FOR UPDATE",
                  id,
                  attempt);
          ApiProblem.require(
              !rows.isEmpty(), 409, "JOB_LEASE", "Job lease expired or already completed");
          var j = rows.getFirst();
          if (success) {
            for (String key :
                List.of(
                    "priorityScore",
                    "priorityClass",
                    "recommendation",
                    "reasons",
                    "modelVersions",
                    "synthetic"))
              ApiProblem.require(
                  result.containsKey(key), 422, "ML_RESULT", "Missing ML output " + key);
            ApiProblem.require(
                Boolean.TRUE.equals(result.get("synthetic")),
                422,
                "ML_RESULT",
                "Synthetic model marker required");
            db.update(
                "UPDATE jobs SET state='COMPLETED',lease_until=NULL,result=? WHERE id=?",
                files.encode(result),
                id);
            db.update(
                "UPDATE incidents SET ml_status='COMPLETED',analysis=? WHERE id=?",
                files.encode(result),
                j.get("resource_id"));
          } else {
            boolean exhausted = attempt >= 5;
            db.update(
                "UPDATE jobs SET state=?,lease_until=NULL,available_at=now()+(? * interval '1"
                    + " second'),last_error='ML_WORKER_FAILURE' WHERE id=?",
                exhausted ? "FAILED" : "PENDING",
                Math.min(60, 1 << attempt),
                id);
            db.update(
                "UPDATE incidents SET ml_status=? WHERE id=?",
                exhausted ? "FAILED" : "PENDING",
                j.get("resource_id"));
          }
        });
  }

  @Scheduled(fixedDelay = 60000, initialDelay = 60000)
  public void cleanup() {
    // Expired leases on the final attempt must not remain RUNNING forever.
    db.update(
        "UPDATE incidents SET ml_status='FAILED' WHERE id IN (SELECT resource_id FROM jobs WHERE"
            + " kind='ML' AND state='RUNNING' AND attempts>=5 AND lease_until<now())");
    db.update(
        "UPDATE files SET status='FAILED' WHERE id IN (SELECT resource_id FROM jobs WHERE"
            + " kind='VERIFY' AND state='RUNNING' AND attempts>=5 AND lease_until<now())");
    db.update(
        "UPDATE jobs SET state='FAILED',lease_until=NULL,last_error='LEASE_EXHAUSTED' WHERE"
            + " state='RUNNING' AND attempts>=5 AND lease_until<now()");
    var expired =
        db.queryForList(
            "SELECT s.id,s.file_id,s.multipart_id,f.storage_key FROM upload_sessions s JOIN files f"
                + " ON f.id=s.file_id WHERE s.expires_at<now() AND s.state IN"
                + " ('CREATED','UPLOADING','UPLOADED') LIMIT 20");
    for (var e : expired)
      try {
        if (e.get("multipart_id") != null)
          storage.abort(e.get("storage_key").toString(), e.get("multipart_id").toString());
        tx.executeWithoutResult(
            s -> {
              db.update(
                  "UPDATE upload_sessions SET state='CANCELLED' WHERE id=? AND state IN"
                      + " ('CREATED','UPLOADING','UPLOADED')",
                  e.get("id"));
              db.update(
                  "UPDATE files SET status='CANCELLED' WHERE id=? AND status IN"
                      + " ('CREATED','UPLOADING','UPLOADED')",
                  e.get("file_id"));
            });
      } catch (Exception ignored) {
        /* retry cleanup on next cycle */
      }
  }
}
