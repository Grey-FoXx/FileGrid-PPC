package ro.filegrid;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
public class FileGridApplication {
  public static void main(String[] args) {
    // Docker service DNS can disappear briefly during stop/start. Keep failed lookups short.
    java.security.Security.setProperty("networkaddress.cache.ttl", "5");
    java.security.Security.setProperty("networkaddress.cache.negative.ttl", "1");
    SpringApplication.run(FileGridApplication.class, args);
  }
}
