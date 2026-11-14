package ro.filegrid;

import java.io.*;
import java.security.*;
import java.util.HexFormat;

public final class Integrity {
  private Integrity() {}

  public static String sha256(byte[] b) {
    try {
      return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(b));
    } catch (NoSuchAlgorithmException e) {
      throw new IllegalStateException(e);
    }
  }

  public static String sha256(InputStream in) throws IOException {
    try {
      var md = MessageDigest.getInstance("SHA-256");
      byte[] b = new byte[65536];
      int n;
      while ((n = in.read(b)) != -1) md.update(b, 0, n);
      return HexFormat.of().formatHex(md.digest());
    } catch (NoSuchAlgorithmException e) {
      throw new IllegalStateException(e);
    }
  }

  public static byte[] limited(InputStream in, long maximum) throws IOException {
    var out = new ByteArrayOutputStream();
    byte[] b = new byte[65536];
    int n;
    long total = 0;
    while ((n = in.read(b)) != -1) {
      total += n;
      ApiProblem.require(total <= maximum, 413, "TOO_LARGE", "Request exceeds the upload limit");
      out.write(b, 0, n);
    }
    return out.toByteArray();
  }
}
