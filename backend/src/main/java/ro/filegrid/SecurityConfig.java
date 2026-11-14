package ro.filegrid;

import jakarta.servlet.*;
import jakarta.servlet.http.*;
import java.io.*;
import java.nio.file.*;
import java.util.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.*;
import org.springframework.core.annotation.Order;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.core.userdetails.*;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.provisioning.InMemoryUserDetailsManager;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.www.BasicAuthenticationFilter;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

@Configuration
class SecurityConfig {
  private static final Logger AUDIT = LoggerFactory.getLogger("ro.filegrid.security.audit");

  @Bean
  UserDetailsService users(@Value("${filegrid.accounts-file}") String path) throws IOException {
    var p = new Properties();
    try (var in = Files.newInputStream(Path.of(path))) {
      p.load(in);
    }
    var manager = new InMemoryUserDetailsManager();
    var encoder = new BCryptPasswordEncoder();
    p.forEach(
        (name, value) -> {
          String[] bits = value.toString().split(":", 2);
          manager.createUser(
              User.withUsername(name.toString())
                  .password("{bcrypt}" + encoder.encode(bits[0]))
                  .roles(bits[1])
                  .build());
        });
    return manager;
  }

  @Bean
  SecurityFilterChain security(HttpSecurity h, CategoryAdmissionFilter admission) throws Exception {
    h.csrf(c -> c.disable())
        .sessionManagement(
            s ->
                s.sessionCreationPolicy(
                    org.springframework.security.config.http.SessionCreationPolicy.STATELESS))
        .authorizeHttpRequests(
            a ->
                a.requestMatchers("/actuator/health", "/actuator/prometheus", "/internal/v1/**")
                    .permitAll()
                    .anyRequest()
                    .authenticated())
        .httpBasic(
            b ->
                b.authenticationEntryPoint(
                    (q, r, e) -> {
                      AUDIT.warn(
                          "authentication_denied correlationId={} method={} path={} remote={}",
                          Objects.toString(MDC.get("correlationId"), "unknown"),
                          q.getMethod(),
                          q.getRequestURI(),
                          q.getRemoteAddr());
                      error(r, 401, "UNAUTHENTICATED");
                    }))
        .exceptionHandling(
            e ->
                e.accessDeniedHandler(
                    (q, r, x) -> {
                      AUDIT.warn(
                          "authorization_denied correlationId={} method={} path={} user={}"
                              + " remote={}",
                          Objects.toString(MDC.get("correlationId"), "unknown"),
                          q.getMethod(),
                          q.getRequestURI(),
                          q.getUserPrincipal() == null ? "unknown" : q.getUserPrincipal().getName(),
                          q.getRemoteAddr());
                      error(r, 403, "FORBIDDEN");
                    }))
        .addFilterAfter(admission, BasicAuthenticationFilter.class);
    return h.build();
  }

  static void error(HttpServletResponse r, int status, String code) throws IOException {
    r.setStatus(status);
    r.setContentType("application/problem+json");
    r.setHeader("Cache-Control", "no-store");
    r.setHeader("X-Content-Type-Options", "nosniff");
    r.getWriter()
        .write(
            "{\"code\":\""
                + code
                + "\",\"status\":"
                + status
                + ",\"detail\":\"Authentication or authorization failed\",\"correlationId\":\""
                + Objects.toString(MDC.get("correlationId"), "unknown")
                + "\"}");
  }
}

@Component
@Order(org.springframework.boot.autoconfigure.security.SecurityProperties.DEFAULT_FILTER_ORDER - 1)
class CorrelationFilter extends OncePerRequestFilter {
  @Override
  protected void doFilterInternal(HttpServletRequest q, HttpServletResponse r, FilterChain c)
      throws ServletException, IOException {
    String id = q.getHeader("X-Correlation-ID");
    if (id == null || !id.matches("[a-zA-Z0-9_-]{1,100}")) id = UUID.randomUUID().toString();
    q.setAttribute("correlationId", id);
    r.setHeader("X-Correlation-ID", id);
    MDC.put("correlationId", id);
    try {
      c.doFilter(q, r);
    } finally {
      MDC.remove("correlationId");
    }
  }
}
