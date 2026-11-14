# Demo

1. Start: ./scripts/start.sh; open https://localhost:8443; use generated account file.
2. Show live simulated meter readings, retransmit and prove one logical reading.
3. Create incident and upload NON_SENSITIVE LEGACY_LOG: show FTP route and download checksum.
4. Upload incident PDF: show S3 route and rapid availability.
5. Upload fictitious connection document: owner can download, other user cannot; storage contains ciphertext.
6. Upload video in parts, interrupt/retry and verify final SHA-256.
7. Change policy, restart API, upload a new eligible log and show new routing reason.
8. Show independent AVAILABLE and ML PENDING/COMPLETED. Stop ML and keep file accessible.
9. Corrupt a test object and demonstrate failed recovery.
10. Stop FTP and show meter/S3 functionality. Do not claim PostgreSQL HA or 10x isolation unless separately measured.
