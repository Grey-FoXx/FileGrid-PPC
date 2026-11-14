package ro.filegrid;

import com.fasterxml.jackson.databind.ObjectMapper;
import io.micrometer.core.instrument.MeterRegistry;
import jakarta.servlet.*;
import jakarta.servlet.http.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.Semaphore;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Bounded admission before large request bodies; retries receive the existing 429 problem shape.
 */
@Component
public class CategoryAdmissionFilter extends OncePerRequestFilter {
  private final JdbcTemplate db;
  private final ObjectMapper json;
  private final MeterRegistry metrics;
  private final AuditRecorder audit;
  private final Map<String, Semaphore> lanes = new LinkedHashMap<>();

  public CategoryAdmissionFilter(
      JdbcTemplate db, ObjectMapper json, MeterRegistry metrics, AuditRecorder audit) {
    this.db = db;
    this.json = json;
    this.metrics = metrics;
    this.audit = audit;
    Map.of(
            "METER_READING",
            3,
            "INCIDENT",
            2,
            "CONNECTION_DOCUMENT",
            2,
            "DRONE_VIDEO",
            1,
            "CONTROL",
            4,
            "INTERNAL",
            1)
        .forEach(
            (name, count) -> {
              int limit =
                  Integer.parseInt(
                      System.getenv()
                          .getOrDefault("FILEGRID_LIMIT_" + name, Integer.toString(count)));
              if (limit < 1 || limit > 8)
                throw new IllegalArgumentException("Admission limits must be 1..8");
              var semaphore = new Semaphore(limit, true);
              lanes.put(name, semaphore);
              metrics.gauge(
                  "filegrid.admission.available",
                  List.of(io.micrometer.core.instrument.Tag.of("category", name)),
                  semaphore,
                  Semaphore::availablePermits);
            });
    int pool = Integer.parseInt(System.getenv().getOrDefault("FILEGRID_SQL_POOL_SIZE", "16"));
    int slots = lanes.values().stream().mapToInt(Semaphore::availablePermits).sum();
    if (pool < slots + 3)
      throw new IllegalArgumentException(
          "SQL pool must reserve >=3 slots beyond request admission capacity");
  }

  @Bean
  FilterRegistrationBean<CategoryAdmissionFilter> disableServletRegistration(
      CategoryAdmissionFilter filter) {
    var registration = new FilterRegistrationBean<>(filter);
    registration.setEnabled(false);
    return registration;
  }

  @Override
  protected boolean shouldNotFilter(HttpServletRequest r) {
    return !r.getRequestURI().startsWith("/api/v1/")
        && !r.getRequestURI().startsWith("/internal/v1/jobs/");
  }

  @Override
  protected void doFilterInternal(
      HttpServletRequest request, HttpServletResponse response, FilterChain chain)
      throws IOException, ServletException {
    HttpServletRequest wrapped = request;
    String category = "CONTROL";
    String path = request.getRequestURI();
    try {
      if (path.startsWith("/internal/")) category = "INTERNAL";
      else if (path.startsWith("/api/v1/meter-readings")) category = "METER_READING";
      else if (path.startsWith("/api/v1/incidents")) category = "INCIDENT";
      else if (path.equals("/api/v1/upload-sessions") && request.getMethod().equals("POST")) {
        byte[] bytes = Integrity.limited(request.getInputStream(), 65536);
        wrapped = new ReplayRequest(request, bytes);
        try {
          var body = json.readTree(bytes);
          category = body.path("category").asText("CONTROL");
        } catch (Exception ignored) {
          category = "CONTROL";
        }
      } else if (path.matches("/api/v1/(files|upload-sessions)/[0-9a-fA-F-]{36}.*")) {
        String[] parts = path.split("/");
        UUID id = UUID.fromString(parts[4]);
        var categories =
            path.startsWith("/api/v1/files/")
                ? db.queryForList("SELECT category FROM files WHERE id=?", String.class, id)
                : db.queryForList(
                    "SELECT f.category FROM upload_sessions s JOIN files f ON f.id=s.file_id WHERE"
                        + " s.id=?",
                    String.class,
                    id);
        if (!categories.isEmpty()) category = categories.getFirst();
      }
      category = lanes.containsKey(category) ? category : "CONTROL";
      var lane = lanes.get(category);
      if (!lane.tryAcquire()) {
        metrics.counter("filegrid.admission.rejected", "category", category).increment();
        response.setHeader("Retry-After", "1");
        problem(
            response,
            429,
            "CATEGORY_BUSY",
            "Category capacity is busy; retry with the same identity",
            request);
        return;
      }
      try {
        chain.doFilter(wrapped, response);
      } finally {
        lane.release();
      }
      if (response.getStatus() == 403)
        audit.denied(
            org.springframework.security.core.context.SecurityContextHolder.getContext()
                        .getAuthentication()
                    == null
                ? "anonymous"
                : org.springframework.security.core.context.SecurityContextHolder.getContext()
                    .getAuthentication()
                    .getName(),
            "HTTP_DENIED",
            path,
            "DENIED");
    } catch (ApiProblem e) {
      problem(response, e.status, e.code, e.getMessage(), request);
    } catch (org.springframework.dao.DataAccessException e) {
      problem(
          response,
          503,
          "DEPENDENCY_UNAVAILABLE",
          "Metadata service unavailable; retry with the same identity",
          request);
    }
  }

  private void problem(
      HttpServletResponse response,
      int status,
      String code,
      String detail,
      HttpServletRequest request)
      throws IOException {
    if (response.isCommitted()) return;
    response.setStatus(status);
    response.setContentType("application/problem+json");
    json.writeValue(
        response.getOutputStream(),
        Map.of(
            "code",
            code,
            "status",
            status,
            "detail",
            detail,
            "correlationId",
            Objects.toString(request.getAttribute("correlationId"), "unknown")));
  }

  static class ReplayRequest extends HttpServletRequestWrapper {
    private final byte[] bytes;

    ReplayRequest(HttpServletRequest request, byte[] bytes) {
      super(request);
      this.bytes = bytes;
    }

    @Override
    public ServletInputStream getInputStream() {
      var in = new ByteArrayInputStream(bytes);
      return new ServletInputStream() {
        public int read() {
          return in.read();
        }

        public int read(byte[] b, int o, int n) {
          return in.read(b, o, n);
        }

        public boolean isFinished() {
          return in.available() == 0;
        }

        public boolean isReady() {
          return true;
        }

        public void setReadListener(ReadListener listener) {
          throw new IllegalStateException("Synchronous metadata request");
        }
      };
    }

    @Override
    public BufferedReader getReader() {
      return new BufferedReader(new InputStreamReader(getInputStream(), StandardCharsets.UTF_8));
    }
  }
}
