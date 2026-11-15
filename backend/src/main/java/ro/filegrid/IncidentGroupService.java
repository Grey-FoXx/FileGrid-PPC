package ro.filegrid;

import java.sql.Timestamp;
import java.time.*;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Persistent operational grouping based on proximity and compatible report metadata. */
@Service
class IncidentGroupService {
  private static final Duration WINDOW = Duration.ofHours(2);
  private static final double MAX_DISTANCE_KM = 5.0;
  private final JdbcTemplate db;

  IncidentGroupService(JdbcTemplate db) { this.db = db; }

  @Transactional
  UUID correlate(UUID incidentId, boolean demoScope) {
    db.queryForList(
        "SELECT pg_advisory_xact_lock(hashtextextended(?,0))",
        "incident-groups:" + demoScope);
    var current = db.queryForMap("SELECT * FROM incidents WHERE id=? FOR UPDATE", incidentId);
    Map<String, Object> metadata = decode(current.get("metadata").toString());
    String zone = text(metadata, "zone"), eventType = text(metadata, "eventType");
    String stationId = text(metadata, "stationId");
    Instant occurred = instant(metadata.get("occurredAt"), ((Timestamp) current.get("created_at")).toInstant());
    double lat = coordinate(metadata.get("latitude")), lon = coordinate(metadata.get("longitude"));

    var candidates = db.queryForList(
        "SELECT g.id AS group_id,g.status,g.created_at AS group_created,i.id AS member_id,"
            + "i.metadata,i.created_at FROM incident_groups g JOIN incidents i ON i.group_id=g.id "
            + "WHERE g.status IN ('NEW','DISPATCHED') AND g.demo_scope=? "
            + "AND i.created_at>=now()-interval '2 hours' ORDER BY g.created_at",
        demoScope);
    var matched = new LinkedHashMap<UUID, String>();
    for (var candidate : candidates) {
      Map<String, Object> other = decode(candidate.get("metadata").toString());
      Instant otherTime = instant(other.get("occurredAt"), ((Timestamp) candidate.get("created_at")).toInstant());
      if (!compatible(zone, eventType, stationId, occurred, lat, lon, other, otherTime)) continue;
      UUID groupId = (UUID) candidate.get("group_id");
      matched.putIfAbsent(groupId, candidate.get("status").toString());
    }

    UUID groupId;
    String status;
    if (matched.isEmpty()) {
      groupId = UUID.randomUUID();
      status = "NEW";
      db.update(
          "INSERT INTO incident_groups(id,status,zone,event_type,demo_scope) VALUES (?,?,?,?,?)",
          groupId, status, zone, eventType, demoScope);
      if (demoScope) registerDemoGroup(groupId);
    } else {
      groupId = matched.keySet().iterator().next();
      status = matched.values().stream().anyMatch("DISPATCHED"::equals) ? "DISPATCHED" : "NEW";
      for (UUID duplicate : matched.keySet()) {
        if (duplicate.equals(groupId)) continue;
        db.update("UPDATE incidents SET group_id=? WHERE group_id=?", groupId, duplicate);
        db.update("UPDATE incident_groups SET status=?,updated_at=now() WHERE id=?", status, groupId);
        db.update("DELETE FROM incident_groups WHERE id=?", duplicate);
        if (demoScope) unregisterDemoGroup(duplicate);
      }
    }
    db.update("UPDATE incidents SET group_id=? WHERE id=?", groupId, incidentId);
    db.update("UPDATE incident_groups SET updated_at=now() WHERE id=?", groupId);
    return groupId;
  }

  @Transactional
  void reconcileModelMembers(UUID incidentId, List<UUID> modelMembers, boolean demoScope) {
    if (modelMembers == null || modelMembers.size() > 1000) return;
    db.queryForList("SELECT pg_advisory_xact_lock(hashtextextended(?,0))", "incident-groups:" + demoScope);
    var currentRows = db.queryForList(
        "SELECT i.group_id,i.metadata,i.created_at,g.status,g.demo_scope FROM incidents i LEFT JOIN incident_groups g ON g.id=i.group_id WHERE i.id=? FOR UPDATE OF i", incidentId);
    if (currentRows.isEmpty() || currentRows.getFirst().get("group_id") == null
        || !Objects.equals(demoScope, currentRows.getFirst().get("demo_scope"))
        || "RESOLVED".equals(currentRows.getFirst().get("status"))) return;
    UUID currentGroup = (UUID) currentRows.getFirst().get("group_id");
    var currentMeta = decode(currentRows.getFirst().get("metadata").toString());
    Instant currentTime = instant(currentMeta.get("occurredAt"), ((Timestamp) currentRows.getFirst().get("created_at")).toInstant());
    double lat = coordinate(currentMeta.get("latitude")), lon = coordinate(currentMeta.get("longitude"));
    String zone = text(currentMeta, "zone"), eventType = text(currentMeta, "eventType");
    String stationId = text(currentMeta, "stationId");
    var merge = new LinkedHashSet<UUID>();
    String status = currentRows.getFirst().get("status").toString();
    for (UUID member : modelMembers) {
      if (member.equals(incidentId)) continue;
      var rows = db.queryForList(
          "SELECT i.group_id,i.metadata,i.created_at,g.status,g.demo_scope FROM incidents i LEFT JOIN incident_groups g ON g.id=i.group_id WHERE i.id=?", member);
      if (rows.isEmpty() || rows.getFirst().get("group_id") == null
          || !Objects.equals(demoScope, rows.getFirst().get("demo_scope"))
          || "RESOLVED".equals(rows.getFirst().get("status"))) continue;
      var meta = decode(rows.getFirst().get("metadata").toString());
      Instant otherTime = instant(meta.get("occurredAt"), ((Timestamp) rows.getFirst().get("created_at")).toInstant());
      if (!compatible(zone, eventType, stationId, currentTime, lat, lon, meta, otherTime)) continue;
      merge.add((UUID) rows.getFirst().get("group_id"));
      if ("DISPATCHED".equals(rows.getFirst().get("status"))) status = "DISPATCHED";
    }
    merge.remove(currentGroup);
    for (UUID other : merge) {
      db.update("UPDATE incidents SET group_id=? WHERE group_id=?", currentGroup, other);
      db.update("DELETE FROM incident_groups WHERE id=? AND status<>'RESOLVED'", other);
      if (demoScope) unregisterDemoGroup(other);
    }
    if (!merge.isEmpty()) db.update("UPDATE incident_groups SET status=?,updated_at=now() WHERE id=?", status, currentGroup);
  }

  @Transactional
  Map<String, Object> transition(UUID id, String requested, boolean demoScope) {
    ApiProblem.require(Set.of("NEW", "DISPATCHED", "RESOLVED").contains(requested), 422,
        "GROUP_STATUS", "Status must be NEW, DISPATCHED or RESOLVED");
    var scopeRows = db.queryForList("SELECT demo_scope FROM incident_groups WHERE id=?", id);
    ApiProblem.require(!scopeRows.isEmpty(), 404, "NOT_FOUND", "Incident group not found");
    boolean actualDemoScope = Boolean.TRUE.equals(scopeRows.getFirst().get("demo_scope"));
    ApiProblem.require(!demoScope || actualDemoScope, 404, "NOT_FOUND", "Incident group not found");
    db.queryForList("SELECT pg_advisory_xact_lock(hashtextextended(?,0))", "incident-groups:" + actualDemoScope);
    var rows = db.queryForList("SELECT status FROM incident_groups WHERE id=? FOR UPDATE", id);
    ApiProblem.require(!rows.isEmpty(), 404, "NOT_FOUND", "Incident group not found");
    String current = rows.getFirst().get("status").toString();
    if (!current.equals(requested)) {
      String next = switch (current) {
        case "NEW" -> "DISPATCHED";
        case "DISPATCHED" -> "RESOLVED";
        default -> "";
      };
      ApiProblem.require(requested.equals(next), 409, "GROUP_TRANSITION",
          "Groups can only move NEW → DISPATCHED → RESOLVED");
      int changed = db.update(
          "UPDATE incident_groups SET status=?,updated_at=now() WHERE id=? AND status=?",
          requested, id, current);
      ApiProblem.require(changed == 1, 409, "GROUP_TRANSITION", "Group status changed concurrently");
    }
    return Map.of("id", id, "status", requested);
  }

  List<Map<String, Object>> openGroupRows(boolean demoScope, boolean includeResolved) {
    return db.queryForList(
        "SELECT id,status,zone,event_type,created_at,updated_at FROM incident_groups "
            + "WHERE (?=TRUE OR status<>'RESOLVED') AND (?=FALSE OR demo_scope=TRUE) ORDER BY updated_at DESC",
        includeResolved, demoScope);
  }

  @Transactional
  void backfillUngrouped(boolean demoScope) {
    var ids = db.queryForList(
        "SELECT i.id FROM incidents i WHERE i.group_id IS NULL AND ((?=TRUE AND EXISTS "
            + "(SELECT 1 FROM demo_resources r WHERE r.resource_type='INCIDENT' AND r.resource_id=i.id::text)) "
            + "OR (?=FALSE AND NOT EXISTS (SELECT 1 FROM demo_resources r WHERE r.resource_type='INCIDENT' AND r.resource_id=i.id::text))) "
            + "ORDER BY i.created_at",
        UUID.class, demoScope, demoScope);
    for (UUID id : ids) correlate(id, demoScope);
  }

  private Map<String, Object> decode(String value) {
    try { return new com.fasterxml.jackson.databind.ObjectMapper().readValue(value, LinkedHashMap.class); }
    catch (Exception e) { return Map.of(); }
  }
  private static String text(Map<String, Object> m, String k) { return Objects.toString(m.get(k), ""); }
  private static Instant instant(Object value, Instant fallback) {
    try { return value == null ? fallback : Instant.parse(value.toString()); }
    catch (Exception ignored) { return fallback; }
  }
  private static double coordinate(Object value) {
    try { return value == null ? Double.NaN : Double.parseDouble(value.toString()); }
    catch (Exception ignored) { return Double.NaN; }
  }
  private static boolean hasCoordinates(double lat, double lon) { return Double.isFinite(lat) && Double.isFinite(lon); }
  private static double distanceKm(double lat1, double lon1, double lat2, double lon2) {
    double p1 = Math.toRadians(lat1), p2 = Math.toRadians(lat2);
    double dp = Math.toRadians(lat2 - lat1), dl = Math.toRadians(lon2 - lon1);
    double a = Math.sin(dp / 2) * Math.sin(dp / 2)
        + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) * Math.sin(dl / 2);
    return 6371.0088 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
  private static boolean compatible(String zone, String eventType, String stationId, Instant occurred,
      double lat, double lon, Map<String, Object> other, Instant otherTime) {
    if (!zone.equalsIgnoreCase(text(other, "zone"))
        || !eventType.equalsIgnoreCase(text(other, "eventType"))
        || Duration.between(occurred, otherTime).abs().compareTo(WINDOW) > 0) return false;
    double otherLat = coordinate(other.get("latitude")), otherLon = coordinate(other.get("longitude"));
    if (!hasCoordinates(lat, lon) || !hasCoordinates(otherLat, otherLon)) {
      return !stationId.isBlank() && stationId.equalsIgnoreCase(text(other, "stationId"));
    }
    return distanceKm(lat, lon, otherLat, otherLon) <= MAX_DISTANCE_KM;
  }
  private void registerDemoGroup(UUID id) {
    db.update("INSERT INTO demo_resources(resource_type,resource_id) VALUES ('GROUP',?) ON CONFLICT DO NOTHING", id.toString());
  }
  private void unregisterDemoGroup(UUID id) {
    db.update("DELETE FROM demo_resources WHERE resource_type='GROUP' AND resource_id=?", id.toString());
  }
}
