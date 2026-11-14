package ro.filegrid;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
public class FileGridApplication {
  public static void main(String[] args) {
    SpringApplication.run(FileGridApplication.class, args);
  }
}
