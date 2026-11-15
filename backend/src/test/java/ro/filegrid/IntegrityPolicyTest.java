package ro.filegrid;

import static org.junit.jupiter.api.Assertions.*;

import java.io.*;
import java.nio.file.*;
import java.util.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.io.TempDir;

class IntegrityPolicyTest {
  @TempDir Path directory;

  @Test
  void detectsChangedBytesAndBoundsInput() throws Exception {
    assertEquals(
        "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
        Integrity.sha256("abc".getBytes()));
    assertNotEquals(Integrity.sha256("abc".getBytes()), Integrity.sha256("abd".getBytes()));
    assertEquals(
        Integrity.sha256("abc".getBytes()),
        Integrity.sha256(new ByteArrayInputStream("abc".getBytes())));
    assertThrows(
        ApiProblem.class, () -> Integrity.limited(new ByteArrayInputStream(new byte[20]), 10));
  }

  @Test
  void encryptionAuthenticatesCiphertext() throws Exception {
    Path key = directory.resolve("key");
    Files.write(key, new byte[32]);
    var crypto = new Crypto(key.toString());
    byte[] nonce = crypto.nonce();
    byte[] plain = "fictitious identity document".getBytes();
    byte[] encrypted = crypto.encrypt(plain, nonce);
    assertFalse(Arrays.equals(plain, encrypted));
    try (var stream = crypto.decrypt(new ByteArrayInputStream(encrypted), nonce)) {
      assertArrayEquals(plain, stream.readAllBytes());
    }
    encrypted[0] ^= 1;
    assertThrows(
        IOException.class,
        () -> crypto.decrypt(new ByteArrayInputStream(encrypted), nonce).readAllBytes());
    assertFalse(Arrays.equals(nonce, crypto.nonce()));
  }

  @Test
  void routingDefaultsAndEveryCategoryCanSelectAnyStorage() throws Exception {
    var engine = new PolicyEngine(Path.of("../config/storage-policies.yaml").toString());
    assertEquals("DATABASE", engine.decide("METER_READING", "", "NON_SENSITIVE").storage());
    assertEquals("FTP", engine.decide("INCIDENT", "LEGACY_LOG", "NON_SENSITIVE").storage());
    assertEquals("S3", engine.decide("INCIDENT", "LEGACY_LOG", "SENSITIVE").storage());
    assertEquals("S3", engine.decide("CONNECTION_DOCUMENT", "", "SENSITIVE").storage());
    String defaults = Files.readString(Path.of("../config/storage-policies.yaml"));
    for (String target : List.of("DATABASE", "S3", "FTP")) {
      Path policy = directory.resolve(target + ".yaml");
      Files.writeString(policy, defaults.replaceAll("storage: (DATABASE|S3|FTP)", "storage: " + target));
      var configured = new PolicyEngine(policy.toString());
      for (String category : List.of("METER_READING", "INCIDENT", "CONNECTION_DOCUMENT", "DRONE_VIDEO"))
        assertEquals(target, configured.decide(category, "BINARY", "SENSITIVE").storage());
    }
    Path invalid = directory.resolve("bad.yaml");
    Files.writeString(invalid, defaults.replace("storage: DATABASE", "storage: UNKNOWN"));
    assertThrows(ApiProblem.class, () -> new PolicyEngine(invalid.toString()));
  }
}
