# Demo

1. Start: ./scripts/start.sh; open https://localhost:8443; use generated account file.
2. Show live simulated meter readings, retransmit and prove one logical reading.
3. Create incident and upload NON_SENSITIVE LEGACY_LOG: show FTP route and download checksum.
4. Upload incident PDF: show S3 route and rapid availability.
5. Upload fictitious connection document: owner can download, other user cannot; storage contains ciphertext.
6. Upload video in parts, interrupt/retry and verify final SHA-256.
7. Ca ADMIN, schimbă live politica unui log legacy din „Politici de stocare”, fără YAML/restart; creează un upload nou și arată noul storage/versiunea, apoi arată că un fișier existent și-a păstrat decizia inițială.
8. Pentru cerințele PDF care nu se demonstrează corect doar în UI, folosește matricea din `PDF_REQUIREMENTS_REVIEW.md` și nu prezenta avertismentele locale drept alerte externe sau scenariul Furtună drept benchmark 10×.
8. Show independent AVAILABLE and ML PENDING/COMPLETED. Stop ML and keep file accessible.
9. Corrupt a test object and demonstrate failed recovery.
10. Stop FTP and show meter/S3 functionality. Do not claim PostgreSQL HA or 10x isolation unless separately measured.
