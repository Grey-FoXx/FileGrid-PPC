package ro.filegrid;

import java.io.*;
import java.nio.file.*;
import java.security.SecureRandom;
import javax.crypto.*;
import javax.crypto.spec.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
public class Crypto {
  private final SecretKeySpec key;

  public Crypto(@Value("${filegrid.encryption-key-file}") String path) throws IOException {
    byte[] bytes = Files.readAllBytes(Path.of(path));
    ApiProblem.require(
        bytes.length == 32, 500, "INVALID_KEY", "Encryption key must contain exactly 32 bytes");
    key = new SecretKeySpec(bytes, "AES");
  }

  public byte[] nonce() {
    byte[] b = new byte[12];
    new SecureRandom().nextBytes(b);
    return b;
  }

  public byte[] encrypt(byte[] data, byte[] nonce) {
    try {
      return cipher(Cipher.ENCRYPT_MODE, nonce).doFinal(data);
    } catch (Exception e) {
      throw new IllegalStateException(e);
    }
  }

  public InputStream decrypt(InputStream in, byte[] nonce) {
    try {
      return new CipherInputStream(in, cipher(Cipher.DECRYPT_MODE, nonce));
    } catch (Exception e) {
      throw new IllegalStateException(e);
    }
  }

  private Cipher cipher(int mode, byte[] nonce) throws Exception {
    var c = Cipher.getInstance("AES/GCM/NoPadding");
    c.init(mode, key, new GCMParameterSpec(128, nonce));
    return c;
  }
}
