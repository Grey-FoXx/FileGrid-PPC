package ro.filegrid;

import jakarta.servlet.http.HttpServletRequest;
import java.util.*;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;

public class ApiProblem extends RuntimeException {
  public final int status;
  public final String code;

  public ApiProblem(int status, String code, String message) {
    super(message);
    this.status = status;
    this.code = code;
  }

  static void require(boolean ok, int status, String code, String message) {
    if (!ok) throw new ApiProblem(status, code, message);
  }
}

@RestControllerAdvice
class ProblemAdvice {
  @ExceptionHandler(ApiProblem.class)
  ResponseEntity<?> problem(ApiProblem e, HttpServletRequest r) {
    return reply(e.status, e.code, e.getMessage(), r);
  }

  @ExceptionHandler({
    IllegalArgumentException.class,
    org.springframework.http.converter.HttpMessageNotReadableException.class,
    org.springframework.web.bind.MissingRequestHeaderException.class,
    org.springframework.web.method.annotation.MethodArgumentTypeMismatchException.class
  })
  ResponseEntity<?> invalid(Exception e, HttpServletRequest r) {
    return reply(422, "INVALID_REQUEST", "Invalid or missing request data", r);
  }

  @ExceptionHandler(org.springframework.dao.DataIntegrityViolationException.class)
  ResponseEntity<?> conflict(Exception e, HttpServletRequest r) {
    return reply(409, "CONFLICT", "Conflicting resource identity", r);
  }

  @ExceptionHandler(Exception.class)
  ResponseEntity<?> unexpected(Exception e, HttpServletRequest r) {
    org.slf4j.LoggerFactory.getLogger(getClass())
        .error("Operation failed correlationId={}", r.getAttribute("correlationId"), e);
    return reply(
        503,
        "DEPENDENCY_UNAVAILABLE",
        "Operation could not complete; retry with the same identity",
        r);
  }

  private ResponseEntity<?> reply(int status, String code, String detail, HttpServletRequest r) {
    return ResponseEntity.status(status)
        .contentType(MediaType.APPLICATION_PROBLEM_JSON)
        .body(
            Map.of(
                "code",
                code,
                "status",
                status,
                "detail",
                detail,
                "correlationId",
                Objects.toString(r.getAttribute("correlationId"), "unknown")));
  }
}
