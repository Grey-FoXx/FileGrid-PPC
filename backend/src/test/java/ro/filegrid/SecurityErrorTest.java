package ro.filegrid;

import static org.junit.jupiter.api.Assertions.*;

import org.junit.jupiter.api.Test;
import org.slf4j.MDC;
import org.springframework.mock.web.MockHttpServletResponse;

class SecurityErrorTest {
  @Test
  void deniedResponseIsNonCacheableAndCarriesCorrelationId() throws Exception {
    var response = new MockHttpServletResponse();
    MDC.put("correlationId", "request_42");
    try {
      SecurityConfig.error(response, 403, "FORBIDDEN");
    } finally {
      MDC.remove("correlationId");
    }

    assertEquals(403, response.getStatus());
    assertEquals("application/problem+json", response.getContentType());
    assertEquals("no-store", response.getHeader("Cache-Control"));
    assertEquals("nosniff", response.getHeader("X-Content-Type-Options"));
    assertTrue(response.getContentAsString().contains("\"correlationId\":\"request_42\""));
  }
}
