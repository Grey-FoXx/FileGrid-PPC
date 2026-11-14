package ro.filegrid;

import java.io.*;
import java.nio.file.*;
import java.util.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.yaml.snakeyaml.Yaml;

@Component
public class PolicyEngine {
  public record Decision(String storage, String version, String reason) {}

  private final Map<String, Object> config;

  public PolicyEngine(@Value("${filegrid.policy-file}") String path) throws IOException {
    var loaderOptions = new org.yaml.snakeyaml.LoaderOptions();
    loaderOptions.setAllowDuplicateKeys(false);
    try (var in = Files.newInputStream(Path.of(path))) {
      config = new Yaml(new org.yaml.snakeyaml.constructor.SafeConstructor(loaderOptions)).load(in);
    }
    validate();
  }

  @SuppressWarnings("unchecked")
  private List<Map<String, Object>> rules() {
    return (List<Map<String, Object>>) config.get("rules");
  }

  private void validate() {
    ApiProblem.require(
        config != null && config.get("version") != null && config.get("rules") instanceof List,
        500,
        "INVALID_POLICY",
        "Policy version/rules required");
    for (var r : rules()) {
      String category = Objects.toString(r.get("category"), "");
      String destination = Objects.toString(r.get("storage"), "");
      ApiProblem.require(
          r.get("id") instanceof String
              && r.keySet().stream()
                  .allMatch(
                      Set.of("id", "category", "storage", "attachmentType", "sensitivity")
                          ::contains),
          500,
          "INVALID_POLICY",
          "Rule ID and supported criteria are required");
      boolean allowed =
          switch (category) {
            case "METER_READING" -> destination.equals("DATABASE");
            case "CONNECTION_DOCUMENT", "DRONE_VIDEO" -> destination.equals("S3");
            case "INCIDENT" ->
                destination.equals("S3")
                    || (destination.equals("FTP")
                        && "LEGACY_LOG".equals(r.get("attachmentType"))
                        && "NON_SENSITIVE".equals(r.get("sensitivity")));
            default -> false;
          };
      ApiProblem.require(allowed, 500, "INVALID_POLICY", "Rule violates a category constraint");
    }
    for (String c : List.of("METER_READING", "INCIDENT", "CONNECTION_DOCUMENT", "DRONE_VIDEO"))
      decide(c, "", "SENSITIVE");
  }

  public Decision decide(String category, String attachmentType, String sensitivity) {
    for (var rule : rules()) {
      if (!category.equals(rule.get("category"))) continue;
      if (rule.containsKey("attachmentType") && !attachmentType.equals(rule.get("attachmentType")))
        continue;
      if (rule.containsKey("sensitivity") && !sensitivity.equals(rule.get("sensitivity"))) continue;
      String dest = rule.get("storage").toString();
      boolean valid =
          switch (category) {
            case "METER_READING" -> dest.equals("DATABASE");
            case "CONNECTION_DOCUMENT", "DRONE_VIDEO" -> dest.equals("S3");
            case "INCIDENT" ->
                dest.equals("S3")
                    || (dest.equals("FTP")
                        && sensitivity.equals("NON_SENSITIVE")
                        && attachmentType.equals("LEGACY_LOG"));
            default -> false;
          };
      ApiProblem.require(
          valid, 422, "POLICY_CONSTRAINT", "Storage rule violates category security constraints");
      return new Decision(
          dest,
          config.get("version").toString(),
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

  public Map<String, Object> configuration() {
    return config;
  }
}
