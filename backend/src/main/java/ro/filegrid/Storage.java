package ro.filegrid;

import java.io.*;
import java.net.URI;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.GeneralSecurityException;
import java.security.KeyStore;
import java.security.cert.CertificateFactory;
import java.time.Duration;
import java.util.*;
import javax.net.ssl.SSLContext;
import javax.net.ssl.TrustManagerFactory;
import javax.net.ssl.X509TrustManager;
import org.apache.commons.net.ftp.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import software.amazon.awssdk.auth.credentials.*;
import software.amazon.awssdk.core.client.config.ClientOverrideConfiguration;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.http.urlconnection.UrlConnectionHttpClient;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.*;
import software.amazon.awssdk.services.s3.model.*;

@Component
public class Storage {
  private final JdbcTemplate db;
  private final S3Client s3;
  private final String bucket, host, user, password;
  private final boolean ftpTlsEnabled;
  private final SSLContext ftpSslContext;
  private final int port;

  public Storage(
      JdbcTemplate db,
      @Value("${filegrid.s3-endpoint}") String endpoint,
      @Value("${filegrid.s3-access-key}") String access,
      @Value("${filegrid.s3-secret-key}") String secret,
      @Value("${filegrid.s3-bucket}") String bucket,
      @Value("${filegrid.ftp-host}") String host,
      @Value("${filegrid.ftp-port}") int port,
      @Value("${filegrid.ftp-user}") String user,
      @Value("${filegrid.ftp-password}") String password,
      @Value("${filegrid.ftp-tls-enabled:true}") boolean ftpTlsEnabled,
      @Value("${filegrid.ftp-tls-ca-file:/run/filegrid/ftp-tls.crt}") String ftpTlsCaFile)
      throws GeneralSecurityException, IOException {
    this.db = db;
    this.bucket = bucket;
    this.host = host;
    this.port = port;
    this.user = user;
    this.password = password;
    this.ftpTlsEnabled = ftpTlsEnabled;
    this.ftpSslContext = ftpTlsEnabled ? ftpSslContext(ftpTlsCaFile) : null;
    s3 =
        S3Client.builder()
            .endpointOverride(URI.create(endpoint))
            .region(Region.US_EAST_1)
            .credentialsProvider(
                StaticCredentialsProvider.create(AwsBasicCredentials.create(access, secret)))
            .forcePathStyle(true)
            .httpClientBuilder(
                UrlConnectionHttpClient.builder()
                    .connectionTimeout(Duration.ofSeconds(3))
                    .socketTimeout(Duration.ofSeconds(30)))
            .overrideConfiguration(
                ClientOverrideConfiguration.builder()
                    .apiCallTimeout(Duration.ofSeconds(60))
                    .build())
            .build();
  }

  static SSLContext ftpSslContext(String caFile) throws GeneralSecurityException, IOException {
    var context = SSLContext.getInstance("TLS");
    context.init(null, new javax.net.ssl.TrustManager[] {ftpTrustManager(caFile)}, null);
    return context;
  }

  static X509TrustManager ftpTrustManager(String caFile)
      throws GeneralSecurityException, IOException {
    var certificateFactory = CertificateFactory.getInstance("X.509");
    java.security.cert.Certificate ca;
    try (var in = Files.newInputStream(Path.of(caFile))) {
      ca = certificateFactory.generateCertificate(in);
    }
    var trust = KeyStore.getInstance(KeyStore.getDefaultType());
    trust.load(null, null);
    trust.setCertificateEntry("filegrid-ftp-ca", ca);
    var trustManagers = TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm());
    trustManagers.init(trust);
    for (var manager : trustManagers.getTrustManagers()) {
      if (manager instanceof X509TrustManager x509) return x509;
    }
    throw new GeneralSecurityException("No X.509 trust manager available");
  }

  static FTPSClient ftpsClient(SSLContext sslContext) {
    var ftps = new FTPSClient(false, sslContext);
    ftps.setEndpointCheckingEnabled(true);
    ftps.setEnabledProtocols(new String[] {"TLSv1.3", "TLSv1.2"});
    return ftps;
  }

  private FTPClient ftp() throws IOException {
    FTPClient f;
    if (ftpTlsEnabled) {
      f = ftpsClient(ftpSslContext);
    } else {
      f = new FTPClient();
    }
    f.setConnectTimeout(3000);
    f.setDefaultTimeout(10000);
    f.setDataTimeout(Duration.ofSeconds(30));
    try {
      f.connect(host, port);
      if (!f.login(user, password)) throw new IOException("FTP login refused");
      if (f instanceof FTPSClient ftps) {
        ftps.execPBSZ(0);
        ftps.execPROT("P");
      }
      f.enterLocalPassiveMode();
      f.setFileType(FTP.BINARY_FILE_TYPE);
      return f;
    } catch (IOException | RuntimeException e) {
      if (f.isConnected()) {
        try {
          f.disconnect();
        } catch (IOException ignored) {
          // Preserve the connection or TLS error that caused cleanup.
        }
      }
      throw e;
    }
  }

  public String put(String dest, String key, byte[] bytes) throws IOException {
    switch (dest) {
      case "DATABASE":
        db.update(
            "INSERT INTO blobs(storage_key,content) VALUES (?,?) ON CONFLICT(storage_key) DO UPDATE"
                + " SET content=EXCLUDED.content",
            key,
            bytes);
        return null;
      case "S3":
        return s3.putObject(
                PutObjectRequest.builder().bucket(bucket).key(key).build(),
                RequestBody.fromBytes(bytes))
            .versionId();
      case "FTP":
        var f = ftp();
        try {
          String tmp = key + ".part";
          if (!f.storeFile(tmp, new ByteArrayInputStream(bytes)) || !f.rename(tmp, key))
            throw new IOException("FTP store refused");
          return null;
        } finally {
          f.disconnect();
        }
      default:
        throw new IllegalArgumentException("Unknown storage");
    }
  }

  public InputStream open(String dest, String key, String version) throws IOException {
    return switch (dest) {
      case "DATABASE" ->
          new ByteArrayInputStream(
              db.queryForObject(
                  "SELECT content FROM blobs WHERE storage_key=?", byte[].class, key));
      case "S3" ->
          s3.getObject(
              GetObjectRequest.builder().bucket(bucket).key(key).versionId(version).build());
      case "FTP" -> {
        var f = ftp();
        InputStream in = f.retrieveFileStream(key);
        if (in == null) {
          f.disconnect();
          throw new IOException("FTP file missing");
        }
        yield new FilterInputStream(in) {
          @Override
          public void close() throws IOException {
            try {
              super.close();
              if (!f.completePendingCommand()) throw new IOException("FTP transfer incomplete");
            } finally {
              f.disconnect();
            }
          }
        };
      }
      default -> throw new IllegalArgumentException("Unknown storage");
    };
  }

  public String beginMultipart(String key) {
    return s3.createMultipartUpload(
            CreateMultipartUploadRequest.builder().bucket(bucket).key(key).build())
        .uploadId();
  }

  public String part(String key, String uploadId, int number, byte[] data) {
    return s3.uploadPart(
            UploadPartRequest.builder()
                .bucket(bucket)
                .key(key)
                .uploadId(uploadId)
                .partNumber(number)
                .build(),
            RequestBody.fromBytes(data))
        .eTag();
  }

  public String complete(String key, String uploadId, List<Map<String, Object>> parts) {
    var p =
        parts.stream()
            .map(
                x ->
                    CompletedPart.builder()
                        .partNumber(((Number) x.get("part_number")).intValue())
                        .eTag(x.get("etag").toString())
                        .build())
            .toList();
    try {
      return s3.completeMultipartUpload(
              CompleteMultipartUploadRequest.builder()
                  .bucket(bucket)
                  .key(key)
                  .uploadId(uploadId)
                  .multipartUpload(CompletedMultipartUpload.builder().parts(p).build())
                  .build())
          .versionId();
    } catch (S3Exception e) {
      if (e.awsErrorDetails() != null && "NoSuchUpload".equals(e.awsErrorDetails().errorCode()))
        return s3.headObject(HeadObjectRequest.builder().bucket(bucket).key(key).build())
            .versionId();
      throw e;
    }
  }

  public void abort(String key, String uploadId) {
    s3.abortMultipartUpload(
        AbortMultipartUploadRequest.builder().bucket(bucket).key(key).uploadId(uploadId).build());
  }
}
