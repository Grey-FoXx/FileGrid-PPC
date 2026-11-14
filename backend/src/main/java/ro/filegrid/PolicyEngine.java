package ro.filegrid;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.*;
import java.nio.file.*;
import java.util.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import org.yaml.snakeyaml.Yaml;

@Component
public class PolicyEngine {
  public record Decision(String storage, String version, String reason) {}

  private record Snapshot(long version, List<Map<String, Object>> rules) {}

  private static final Set<String> CATEGORIES =
      Set.of("METER_READING", "INCIDENT", "CONNECTION_DOCUMENT", "DRONE_VIDEO");
  private static final Set<String> RULE_KEYS =
      Set.of("id", "category", "storage", "attachmentType", "sensitivity");

  private final JdbcTemplate db;
  private final ObjectMapper json;
  private final Map<String, Object> bootstrap;

  /** Spring uses PostgreSQL as the authoritative, shared configuration store. */
  @Autowired
  public PolicyEngine(
      JdbcTemplate db, ObjectMapper json, @Value("${filegrid.policy-file}") String path)
      throws IOException {
    this.db = db;
    this.json = json;
    this.bootstrap = immutableConfig(readYaml(path));
    validateRules(ruleList(bootstrap.get("rules")), 500);
    long version = exactVersion(bootstrap.get("version"));
    db.update(
        "INSERT INTO storage_policy_config(id,version,rules) VALUES (1,?,?::jsonb) "
            + "ON CONFLICT (id) DO NOTHING",
        version,
        encode(bootstrap.get("rules")));
  }

  /** Kept for direct unit construction and startup-validation tests. */
  public PolicyEngine(String path) throws IOException {
    this.db = null;
    this.json = new ObjectMapper();
    this.bootstrap = immutableConfig(readYaml(path));
    validateRules(ruleList(bootstrap.get("rules")), 500);
  }

  public Decision decide(String category, String attachmentType, String sensitivity) {
    Snapshot snapshot = snapshot();
    for (var rule : snapshot.rules()) {
      if (!category.equals(rule.get("category"))) continue;
      if (rule.containsKey("attachmentType") && !attachmentType.equals(rule.get("attachmentType")))
        continue;
      if (rule.containsKey("sensitivity") && !sensitivity.equals(rule.get("sensitivity")))
        continue;
      return new Decision(
          rule.get("storage").toString(),
          Long.toString(snapshot.version()),
          "Rule "
              + rule.get("id")
              + "; category="
              + category
              + "; sensitivity="
              + sensitivity
              + "; attachmentType="
              + attachmentType);
    }
    throw new ApiProblem(422, "NO_POLICY", "No eligible policy");
  }

  /** Returns a detached immutable version/rules snapshot, read in one SQL statement. */
  public Map<String, Object> configuration() {
    Snapshot current = snapshot();
    return immutableConfig(Map.of("version", current.version(), "rules", current.rules()));
  }

  @Transactional
  public Map<String, Object> replace(long expectedVersion, List<Map<String, Object>> rules) {
    validateRules(rules, 422);
    if (db == null) throw new IllegalStateException("Policy persistence is unavailable");
    var rows =
        db.query(
            "UPDATE storage_policy_config SET version=version+1,rules=?::jsonb,updated_at=now() "
                + "WHERE id=1 AND version=? RETURNING version,rules::text AS rules",
            (r, n) -> new Snapshot(r.getLong("version"), decodeRules(r.getString("rules"))),
            encode(rules),
            expectedVersion);
    if (rows.isEmpty()) stale(expectedVersion);
    return immutableConfig(Map.of("version", rows.getFirst().version(), "rules", rows.getFirst().rules()));
  }

  @Transactional
  public Map<String, Object> reset(long expectedVersion) {
    if (db == null) throw new IllegalStateException("Policy persistence is unavailable");
    List<Map<String, Object>> rules = ruleList(bootstrap.get("rules"));
    var rows =
        db.query(
            "UPDATE storage_policy_config SET version=version+1,rules=?::jsonb,updated_at=now() "
                + "WHERE id=1 AND version=? RETURNING version,rules::text AS rules",
            (r, n) -> new Snapshot(r.getLong("version"), decodeRules(r.getString("rules"))),
            encode(rules),
            expectedVersion);
    if (rows.isEmpty()) stale(expectedVersion);
    return immutableConfig(Map.of("version", rows.getFirst().version(), "rules", rows.getFirst().rules()));
  }

  private Snapshot snapshot() {
    if (db == null) return new Snapshot(exactVersion(bootstrap.get("version")), ruleList(bootstrap.get("rules")));
    var rows =
        db.query(
            "SELECT version,rules::text AS rules FROM storage_policy_config WHERE id=1",
            (r, n) -> new Snapshot(r.getLong("version"), decodeRules(r.getString("rules"))));
    if (rows.isEmpty()) throw new IllegalStateException("Persistent storage policy is not initialized");
    return rows.getFirst();
  }

  private Map<String, Object> readYaml(String path) throws IOException {
    var loaderOptions = new org.yaml.snakeyaml.LoaderOptions();
    loaderOptions.setAllowDuplicateKeys(false);
    Object loaded;
    try (var in = Files.newInputStream(Path.of(path))) {
      loaded = new Yaml(new org.yaml.snakeyaml.constructor.SafeConstructor(loaderOptions)).load(in);
    }
    ApiProblem.require(loaded instanceof Map<?, ?>, 500, "INVALID_POLICY", "Policy configuration must be a mapping");
    var config = new LinkedHashMap<String, Object>();
    ((Map<?, ?>) loaded).forEach((k, v) -> config.put(Objects.toString(k), v));
    ApiProblem.require(config.keySet().stream().allMatch(Set.of("version", "rules")::contains),
        500, "INVALID_POLICY", "Policy configuration contains an unsupported field");
    ApiProblem.require(config.containsKey("version"), 500, "INVALID_POLICY", "Policy version is required");
    exactVersion(config.get("version"));
    config.put("rules", ruleList(config.get("rules")));
    return Collections.unmodifiableMap(config);
  }

  private void validateRules(List<Map<String, Object>> rules, int status) {
    ApiProblem.require(rules != null && !rules.isEmpty() && rules.size() <= 500, status,
        "INVALID_POLICY", "Policy rules must contain between 1 and 500 entries");
    var ids = new HashSet<String>();
    for (Map<String, Object> rule : rules) {
      ApiProblem.require(rule.keySet().stream().allMatch(RULE_KEYS::contains), status,
          "INVALID_POLICY", "Rule contains an unsupported field");
      Object idValue = rule.get("id"), categoryValue = rule.get("category"), storageValue = rule.get("storage");
      ApiProblem.require(idValue instanceof String && ((String) idValue).matches("[A-Za-z0-9][A-Za-z0-9._:-]{0,119}"),
          status, "INVALID_POLICY", "Rule id must be a unique 1–120 character identifier");
      String id = (String) idValue;
      ApiProblem.require(ids.add(id), status, "INVALID_POLICY", "Rule ids must be unique");
      ApiProblem.require(categoryValue instanceof String && CATEGORIES.contains(categoryValue), status,
          "INVALID_POLICY", "Unsupported policy category");
      ApiProblem.require(storageValue instanceof String, status, "INVALID_POLICY", "Rule storage is required");
      String category = (String) categoryValue, storage = (String) storageValue;
      boolean hasAttachment = rule.containsKey("attachmentType");
      boolean hasSensitivity = rule.containsKey("sensitivity");
      ApiProblem.require(!hasAttachment || "INCIDENT".equals(category), status, "INVALID_POLICY",
          "Attachment criteria apply only to INCIDENT rules");
      ApiProblem.require(!hasSensitivity || "INCIDENT".equals(category), status, "INVALID_POLICY",
          "Sensitivity criteria apply only to INCIDENT rules");
      if (hasAttachment)
        ApiProblem.require(rule.get("attachmentType") instanceof String && Set.of("BINARY", "LEGACY_LOG").contains(rule.get("attachmentType")), status,
            "INVALID_POLICY", "Unsupported attachmentType criterion");
      if (hasSensitivity)
        ApiProblem.require(rule.get("sensitivity") instanceof String && Set.of("SENSITIVE", "NON_SENSITIVE").contains(rule.get("sensitivity")), status,
            "INVALID_POLICY", "Unsupported sensitivity criterion");
      boolean allowed = switch (category) {
        case "METER_READING" -> "DATABASE".equals(storage) && !hasAttachment && !hasSensitivity;
        case "CONNECTION_DOCUMENT", "DRONE_VIDEO" -> "S3".equals(storage) && !hasAttachment && !hasSensitivity;
        case "INCIDENT" -> "S3".equals(storage)
            || ("FTP".equals(storage) && "LEGACY_LOG".equals(rule.get("attachmentType"))
                && "NON_SENSITIVE".equals(rule.get("sensitivity")));
        default -> false;
      };
      ApiProblem.require(allowed, status, "INVALID_POLICY", "Rule violates a category security constraint");
    }
    for (String category : CATEGORIES)
      ApiProblem.require(rules.stream().anyMatch(r -> category.equals(r.get("category"))
              && !r.containsKey("attachmentType") && !r.containsKey("sensitivity")),
          status, "INVALID_POLICY", "Each category requires an unconditional fallback rule");
    ensureDecisions(rules, status);
  }

  private void ensureDecisions(List<Map<String, Object>> rules, int status) {
    for (String attachment : List.of("BINARY", "LEGACY_LOG")) {
      for (String sensitivity : List.of("SENSITIVE", "NON_SENSITIVE")) {
        ApiProblem.require(find("INCIDENT", attachment, sensitivity, rules, status) != null, status,
            "INVALID_POLICY", "Incident rules must cover every supported attachment/sensitivity combination");
      }
    }
  }

  private Map<String, Object> find(String category, String attachmentType, String sensitivity,
      List<Map<String, Object>> rules, int status) {
    for (var rule : rules) {
      if (!category.equals(rule.get("category"))) continue;
      if (rule.containsKey("attachmentType") && !attachmentType.equals(rule.get("attachmentType"))) continue;
      if (rule.containsKey("sensitivity") && !sensitivity.equals(rule.get("sensitivity"))) continue;
      String storage = Objects.toString(rule.get("storage"), "");
      if ("INCIDENT".equals(category) && "FTP".equals(storage)
          && !("LEGACY_LOG".equals(attachmentType) && "NON_SENSITIVE".equals(sensitivity)))
        throw new ApiProblem(status, "INVALID_POLICY", "FTP is only valid for legacy nonsensitive logs");
      return rule;
    }
    return null;
  }

  private static List<Map<String, Object>> ruleList(Object value) {
    if (!(value instanceof List<?> list)) return null;
    var result = new ArrayList<Map<String, Object>>();
    for (Object item : list) {
      if (!(item instanceof Map<?, ?> map)) return null;
      var rule = new LinkedHashMap<String, Object>();
      map.forEach((k, v) -> {
        if (k instanceof String key) rule.put(key, v);
        else rule.put(Objects.toString(k), v);
      });
      result.add(rule);
    }
    return result;
  }

  private List<Map<String, Object>> decodeRules(String value) {
    try { return ruleList(json.readValue(value, new TypeReference<List<Map<String, Object>>>() {})); }
    catch (Exception e) { throw new IllegalStateException("Stored policy JSON is invalid", e); }
  }

  private String encode(Object value) {
    try { return json.writeValueAsString(value); }
    catch (Exception e) { throw new IllegalArgumentException("Could not encode policy rules", e); }
  }

  private static long exactVersion(Object value) {
    try {
      if (!(value instanceof Number number)) throw new ArithmeticException();
      long version = new java.math.BigDecimal(number.toString()).longValueExact();
      if (version < 1) throw new ArithmeticException();
      return version;
    } catch (Exception e) {
      throw new ApiProblem(422, "INVALID_POLICY", "Policy version must be a positive integer");
    }
  }

  private static Map<String, Object> immutableConfig(Map<String, Object> config) {
    var copy = new LinkedHashMap<String, Object>();
    copy.put("version", config.get("version"));
    var rules = new ArrayList<Map<String, Object>>();
    Object raw = config.get("rules");
    if (raw instanceof List<?> list) {
      for (Object item : list) {
        if (item instanceof Map<?, ?> map) {
          var rule = new LinkedHashMap<String, Object>();
          map.forEach((k, v) -> rule.put(Objects.toString(k), v));
          rules.add(Collections.unmodifiableMap(rule));
        }
      }
    }
    copy.put("rules", Collections.unmodifiableList(rules));
    return Collections.unmodifiableMap(copy);
  }

  private void stale(long expectedVersion) {
    throw new ApiProblem(409, "STALE_POLICY", "Policy version changed; reload before saving");
  }
}
