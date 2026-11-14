package ro.filegrid;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import com.fasterxml.jackson.databind.ObjectMapper;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.util.concurrent.*;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.*;

class CategoryAdmissionTest {
  @Test
  void exhaustedMeterCapacityDoesNotConsumeIncidentCapacity() throws Exception {
    var filter =
        new CategoryAdmissionFilter(
            mock(JdbcTemplate.class),
            new ObjectMapper(),
            new SimpleMeterRegistry(),
            mock(AuditRecorder.class));
    var entered = new CountDownLatch(3);
    var release = new CountDownLatch(1);
    var pool = Executors.newFixedThreadPool(3);
    try {
      var tasks = new java.util.ArrayList<Future<?>>();
      for (int i = 0; i < 3; i++)
        tasks.add(
            pool.submit(
                () -> {
                  try {
                    filter.doFilter(
                        new MockHttpServletRequest("POST", "/api/v1/meter-readings"),
                        new MockHttpServletResponse(),
                        (q, r) -> {
                          entered.countDown();
                          try {
                            release.await(5, TimeUnit.SECONDS);
                          } catch (InterruptedException e) {
                            Thread.currentThread().interrupt();
                          }
                        });
                  } catch (Exception e) {
                    throw new RuntimeException(e);
                  }
                }));
      assertTrue(entered.await(5, TimeUnit.SECONDS));
      var rejected = new MockHttpServletResponse();
      filter.doFilter(
          new MockHttpServletRequest("POST", "/api/v1/meter-readings"),
          rejected,
          (q, r) -> fail("Overloaded meter request entered"));
      assertEquals(429, rejected.getStatus());
      assertTrue(rejected.getContentAsString().contains("CATEGORY_BUSY"));
      assertEquals("1", rejected.getHeader("Retry-After"));
      var incident = new MockHttpServletResponse();
      filter.doFilter(
          new MockHttpServletRequest("POST", "/api/v1/incidents"),
          incident,
          (q, r) -> ((jakarta.servlet.http.HttpServletResponse) r).setStatus(201));
      assertEquals(201, incident.getStatus());
      release.countDown();
      for (var task : tasks) task.get(5, TimeUnit.SECONDS);
    } finally {
      release.countDown();
      pool.shutdownNow();
    }
  }
}
