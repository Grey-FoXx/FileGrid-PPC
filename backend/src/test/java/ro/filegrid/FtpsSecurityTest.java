package ro.filegrid;

import static org.junit.jupiter.api.Assertions.*;

import java.nio.file.Path;
import java.security.cert.CertificateFactory;
import java.security.cert.X509Certificate;
import javax.net.ssl.SSLContext;
import org.apache.commons.net.ftp.FTPSClient;
import org.junit.jupiter.api.Test;

class FtpsSecurityTest {
  private static final Path TEST_CERTS = Path.of("src/test/resources/security");

  private X509Certificate certificate(String name) throws Exception {
    try (var input = java.nio.file.Files.newInputStream(TEST_CERTS.resolve(name))) {
      return (X509Certificate) CertificateFactory.getInstance("X.509").generateCertificate(input);
    }
  }

  @Test
  void configuredCaTrustsItsOwnCertificateAndRejectsAnotherCa() throws Exception {
    var trust = Storage.ftpTrustManager(TEST_CERTS.resolve("ftp-test-ca.crt").toString());

    assertDoesNotThrow(
        () ->
            trust.checkServerTrusted(
                new X509Certificate[] {certificate("ftp-test-ca.crt")}, "RSA"));
    assertThrows(
        java.security.cert.CertificateException.class,
        () ->
            trust.checkServerTrusted(
                new X509Certificate[] {certificate("other-test-ca.crt")}, "RSA"));
  }

  @Test
  void ftpsClientEnforcesHostnameChecking() throws Exception {
    SSLContext context = Storage.ftpSslContext(TEST_CERTS.resolve("ftp-test-ca.crt").toString());
    FTPSClient client = Storage.ftpsClient(context);

    assertTrue(client.isEndpointCheckingEnabled());
    // Enabled protocols are reported by Commons Net only after a live TLS handshake.
    // Actual control/data negotiation is covered by the container integration suite.
  }

  @Test
  void ftpsFailsClosedWhenCertificateIsMissing() {
    assertThrows(
        java.io.IOException.class,
        () -> Storage.ftpSslContext(TEST_CERTS.resolve("missing.crt").toString()));
  }
}
