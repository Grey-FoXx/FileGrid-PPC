package ro.filegrid;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Real, isolated synthetic probes. Never accepts a user file as a fault target. */
@Service
class DemoExperience {
  private final JdbcTemplate db;
  private final FileService files;
  private final Storage storage;
  private final DemoScope scope;
  DemoExperience(JdbcTemplate db, FileService files, Storage storage, DemoScope scope) {
    this.db=db;this.files=files;this.storage=storage;this.scope=scope;
  }
  Map<String,Object> simulator() {
    return db.queryForMap("SELECT c.multiplier,s.initialized_at::text AS \"demoEpoch\",(s.initialized_at IS NOT NULL) AS \"demoInitialized\" FROM demo_flow_control c CROSS JOIN demo_state s WHERE c.id=1 AND s.id=1");
  }
  @Transactional
  Map<String,Object> volume(Object value, Authentication actor) {
    FileService.roles(actor);
    ApiProblem.require(value instanceof Number && ((Number)value).doubleValue()==((Number)value).intValue()
        && ((Number)value).intValue()>=1 && ((Number)value).intValue()<=10,422,"DEMO_VOLUME","Multiplier must be an integer from 1 to 10");
    db.update("UPDATE demo_flow_control SET multiplier=?,next_files_at=LEAST(next_files_at,now()+interval '5 seconds') WHERE id=1",((Number)value).intValue());
    files.audit(actor.getName(),"SIMULATOR_VOLUME","demo-flow","SUCCESS");
    return simulator();
  }
  @Transactional
  Map<String,Object> notifyTest(Authentication actor) {
    FileService.roles(actor);
    UUID id=notification("TEST_BUSINESS_RISK","TEST SINTETIC: risc de întârziere a rapoartelor de avarii. Verifică disponibilitatea și coada de procesare.",true);
    files.audit(actor.getName(),"DEMO_NOTIFICATION",id.toString(),"SUCCESS");
    return Map.of("id",id,"synthetic",true);
  }
  @Transactional
  Map<String,Object> integrity(Authentication actor) throws IOException {
    FileService.roles(actor);
    db.queryForList("SELECT pg_advisory_xact_lock(hashtextextended('filegrid-demo-state',0))");
    ApiProblem.require(Boolean.TRUE.equals(db.queryForObject("SELECT initialized_at IS NOT NULL FROM demo_state WHERE id=1",Boolean.class)),409,"DEMO_NOT_INITIALIZED","Initialize demo first");
    ApiProblem.require(db.queryForObject("SELECT count(*) FROM demo_integrity_probes WHERE state<>'RECOVERED'",Long.class)==0,409,"PROBE_RUNNING","A recovery probe is already running");
    return scope.asDemo(()->{
      byte[] original=("FileGrid synthetic recovery fixture " + UUID.randomUUID()).getBytes(StandardCharsets.UTF_8);
      Map<String,Object> request=new LinkedHashMap<>();
      request.put("category","DRONE_VIDEO");request.put("filename","demo-auto-recovery.bin");
      request.put("contentType","application/octet-stream");request.put("sizeBytes",original.length);request.put("sha256",Integrity.sha256(original));
      request.put("stationId","DEMO-RECOVERY");request.put("zone","Banat");
      try {
        var session=files.createSession(request,"recovery-"+UUID.randomUUID(),actor);
        UUID sessionId=UUID.fromString(session.get("sessionId").toString());
        files.putPart(sessionId,1,original,Integrity.sha256(original),actor);files.complete(sessionId,actor);
        UUID fileId=UUID.fromString(session.get("fileId").toString());
        var f=files.raw(fileId);
        files.check(f);
        // This transaction owns the just-created fixture; no worker can claim its uncommitted job.
        db.update("DELETE FROM jobs WHERE kind='VERIFY' AND resource_id=?",fileId);
        db.update("UPDATE files SET status='AVAILABLE',integrity_status='VERIFIED' WHERE id=?",fileId);
        db.update("UPDATE upload_sessions SET state='AVAILABLE' WHERE id=?",sessionId);
        // Deliberately write a different object version and make verification inspect it.
        String version=storage.put(f.storage(),f.storageKey(),"damaged synthetic bytes".getBytes(StandardCharsets.UTF_8));
        db.update("UPDATE files SET storage_version=? WHERE id=?",version,fileId);
        db.update("INSERT INTO demo_integrity_probes(file_id,original_bytes,state,detail) VALUES (?,?,'INJECTED',?)",fileId,original,"Corupere injectată pe un fixture propriu; copia validă este păstrată separat în Database.");
        files.audit(actor.getName(),"DEMO_CORRUPTION",fileId.toString(),"INJECTED");
        return Map.<String,Object>of("fileId",fileId,"state","INJECTED");
      } catch(IOException e){throw new IllegalStateException("Recovery fixture could not be prepared",e);}
    });
  }
  @Scheduled(fixedDelayString="${filegrid.demo-probe-delay-ms:3000}")
  @Transactional
  public void recoverTick() {
    db.queryForList("SELECT pg_advisory_xact_lock(hashtextextended('filegrid-demo-state',0))");
    for(var row:db.queryForList("SELECT file_id,original_bytes,state FROM demo_integrity_probes WHERE state<>'RECOVERED' ORDER BY created_at LIMIT 1 FOR UPDATE")){
      UUID id=(UUID)row.get("file_id");
      try {
        var f=files.raw(id);
        if("INJECTED".equals(row.get("state"))){
          try {files.check(f);throw new IllegalStateException("Expected corruption was not detected");}
          catch(ApiProblem problem){
            if(!"INTEGRITY_FAILED".equals(problem.code))throw problem;
            db.update("UPDATE files SET status='CORRUPTED',integrity_status='FAILED' WHERE id=?",id);
            db.update("UPDATE demo_integrity_probes SET state='DETECTED',detail=?,updated_at=now() WHERE file_id=?","SHA-256 diferit: conținutul corupt este blocat. Recuperare automată programată din copia validă.",id);
            notification("INTEGRITY_RISK","Fixture demo: corupere detectată; recuperarea automată este în curs.",true);
          }
        }else{
          byte[] original=(byte[])row.get("original_bytes");
          ApiProblem.require(Integrity.sha256(original).equals(f.sha256()),502,"INVALID_RECOVERY_COPY","Recovery copy failed SHA-256");
          String version=storage.put(f.storage(),f.storageKey(),original);
          db.update("UPDATE files SET storage_version=? WHERE id=?",version,id);
          files.check(files.raw(id));
          db.update("UPDATE files SET status='AVAILABLE',integrity_status='VERIFIED' WHERE id=?",id);
          db.update("UPDATE demo_integrity_probes SET state='RECOVERED',detail=?,updated_at=now() WHERE file_id=?","Recuperat automat din copia separată; SHA-256 original confirmat. Fișier disponibil pentru download.",id);
          files.audit("demo-recovery","AUTO_RECOVERY",id.toString(),"SUCCESS");
        }
      }catch(Exception e){
        db.update("UPDATE demo_integrity_probes SET detail=?,updated_at=now() WHERE file_id=?","Recuperare în așteptare: storage indisponibil sau verificare nereușită; se reîncearcă automat.",id);
      }
    }
    long errors=db.queryForObject("SELECT count(*) FROM operations WHERE success=FALSE AND created_at>now()-interval '1 minute'",Long.class);
    if(errors>0 && db.queryForObject("SELECT count(*) FROM demo_notifications WHERE code='OPERATION_ERRORS' AND created_at>now()-interval '1 minute'",Long.class)==0)
      notification("OPERATION_ERRORS","Operații eșuate în ultimul minut: verifică storage-ul și categoriile afectate. Semnal automat, fără diagnostic de cauză.",false);
    db.update("DELETE FROM demo_notifications WHERE id IN (SELECT id FROM demo_notifications ORDER BY created_at DESC OFFSET 100)");
  }
  private UUID notification(String code,String message,boolean synthetic){
    UUID id=UUID.randomUUID();
    db.update("INSERT INTO demo_notifications(id,code,message,synthetic) VALUES (?,?,?,?)",id,code,message,synthetic);
    return id;
  }
}
