# Backend observability

Prometheus scrapes private API metrics every 5 seconds. Only the gateway publishes a host port; use internal tooling for Prometheus/Alertmanager. The public `/stats/technical` endpoint remains unchanged and requires dispatcher/admin authorization.

## Three distinct measurements

1. Storage-operation metrics (`filegrid_operation_seconds`, `filegrid_bytes_total`) cover ingest/upload part or content, verify and download by bounded category/storage/operation/outcome labels. Acknowledged bytes exclude failed attempts. The same logical file can contribute upload, verification and download bytes; sum one operation at a time to avoid describing I/O as unique business ingestion.
2. SQL `/stats/technical` returns exact `percentile_cont` p50/p95/p99 of recorded operation durations over the trailing **fixed 60-minute window**, bytes/3600, count/3600 and unsuccessful/total operations. All recorded outcomes contribute to these percentiles. A newly started system has zero traffic before startup within that window; rates are not the current 5-minute load-generator rate. There is no date-range API change.
3. `scripts/isolation-test.py` measures whole logical workflows from scheduled arrival through durable ingest or verified download. It includes queue delay, authentication/TLS, retries, polling and all file-transfer steps. Report terminal operation failures separately from physical HTTP 429/5xx attempts. Its p95 is not a storage-only timer.

Example PromQL (seconds converted to milliseconds; change 0.95 to 0.50 or 0.99):

```promql
1000 * histogram_quantile(0.95,
  sum by (le, category, storage, operation) (
    rate(filegrid_operation_seconds_bucket{outcome="success"}[5m])
  )
)
```

```promql
# Acknowledged I/O bytes per second for each operation
sum by (category, storage, operation) (rate(filegrid_bytes_total[5m]))

# All recorded operation attempts per second
sum by (category, storage, operation) (rate(filegrid_operation_seconds_count[5m]))

# Recorded error fraction; keep count/denominator visible for low-volume series
sum by (category, storage, operation) (rate(filegrid_operation_seconds_count{outcome="error"}[5m]))
/
sum by (category, storage, operation) (rate(filegrid_operation_seconds_count[5m]))

# Backpressure is separate from storage failures
sum by (category) (rate(filegrid_admission_rejected_total[5m]))
```

Histogram quantiles are estimates (1ms–5min expected range); no samples means no valid percentile, not zero latency. Runtime registries reset on API restart; SQL records remain persistent. Metrics cannot be used as a delivery guarantee: recorder SQL failures are intentionally best effort and do not invalidate an otherwise acknowledged operation. Tables currently have no retention policy; growth/index costs need a separate long-duration campaign.

## Alerts and correlation

`infra/monitoring/alerts.yml` defines incident queue-age, recent integrity failures, significant storage error ratio, meter sequence gaps after grace, stalled drone progress, ML backlog and metadata/API availability. `infra/monitoring/tests/alerts.test.yml` checks seven firing/resolution scenarios. Alertmanager sends token-authenticated notifications to the private webhook; SQL fingerprint upserts and structured `business_alert` logs retain delivery state. Notifications depend on SQL availability; no public UI/read/ack or external pager receiver exists.

HTTP response/log correlation IDs, immutable file operation IDs and asynchronous verification logs connect request → file → storage. Gateway logs omit query strings and credentials. This is correlated logging, not a distributed tracing product. The gateway log ID is the incoming header; callers omitting it receive the API-generated ID in the response, which is not retroactively inserted into the gateway access-log field.

Read BH02_06_REPORT.md for measured normal/spike comparisons. Routing fits the tested design: meter identity transactions in Database; private encrypted documents and large multipart transport in S3; explicitly non-sensitive legacy diagnostics in FTPS. This is a policy choice supported by the workflows, not a comparative benchmark proving one storage fastest for every category.
