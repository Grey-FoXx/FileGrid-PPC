# Politici configurabile per categorie — 2026-11-15

Referință: PDF p. 1–2, FileGrid decide unde și cum se scrie fiecare fișier, prin politici configurabile fără modificarea codului. Această implementare înlocuiește restricțiile istorice categorie → destinație fixă. Alegerea este deterministă, explicabilă și versionată; PDF-ul nu impune rutare ML sau un optimizator automat.

## Configurare în aplicație

ADMIN → Politici de stocare → categoria dorită → Configurează politica → regula dorită → Destinație → Aplică politica. Fiecare dintre cele patru categorii acceptă DATABASE, S3 și FTP. La Avarii, regula legacy specifică este evaluată înaintea regulii generale: pentru un atașament BINARY se configurează regula generală, nu cea legacy.

Salvarea este persistentă în PostgreSQL și se aplică imediat sesiunilor/citirilor noi. Fișierele și sesiunile existente păstrează destinația, versiunea și motivul inițial; modificarea politicii nu migrează datele. Un editor cu versiune veche primește 409 și trebuie să reîncarce configurația. Fiecare categorie trebuie să păstreze o regulă fallback necondiționată. Numai ADMIN poate salva; celelalte roluri pot consulta configurația. Editorul modifică reguli existente; API-ul permite înlocuirea listei ordonate.

YAML-ul este folosit numai pentru inițializarea unei baze noi și pentru resetarea explicită. Nu este necesar să fie editat sau să repornești API-ul. Resetarea reface toate regulile implicite, nu doar categoria deschisă.

## Garanții independente de destinație

- Documentele de racordare: AES-GCM înainte de DATABASE/S3/FTP; decriptare autorizată și verificare SHA-256 la recuperare. Cheia nu este păstrată împreună cu obiectele.
- Contoare: payload original, identități unice, commit înainte de ACK. S3/FTP sunt scrise și recitite pentru verificare înainte de commit; o eroare I/O anulează tranzacția. Retrimiterea aceleiași identități nu creează încă o citire; bytes diferiți dau 409. Catalogul și identitățile rămân în PostgreSQL indiferent de destinația payload-ului.
- Drone: protocolul multipart de 8 MiB și sesiunile persistente sunt păstrate pentru toate destinațiile. S3 folosește multipart nativ. DATABASE păstrează bucăți durabile în `blob_chunks`, citite succesiv. FTP folosește aceleași bucăți pentru staging durabil în PostgreSQL, apoi le transferă prin streaming într-un fișier temporar și îl redenumește; staging-ul se elimină după finalizare. Nu se asamblează întregul video în heap.
- Confirmarea aceleiași părți este idempotentă; anularea/expirarea curăță staging-ul. Fiecare fișier este verificat înainte să devină AVAILABLE și din nou la download.
- Metricile contoarelor înregistrează destinația efectivă, inclusiv pentru replay-ul unei citiri create sub o politică mai veche.

## Valori implicite și compromisuri

DATABASE pentru contoare, S3 pentru documente/drone și avarii obișnuite, FTP pentru diagnostice legacy sunt recomandările inițiale ale echipei, nu restricții impuse de PDF. Toate trei sunt utilizate efectiv cu configurația implicită. Alegerea unei alte politici poate concentra traficul într-un storage; configurabilitatea nu demonstrează izolarea la 10× sau superioritatea acelei destinații.

FTP pentru drone necesită spațiu temporar în PostgreSQL și retransmite intern obiectul complet la finalizarea unei sesiuni. Reluarea client → FileGrid păstrează părțile confirmate; o finalizare FTP întreruptă poate fi reîncercată, cu retransmiterea internă. Accesul FTP rămâne pe rețeaua privată. Compose pornește FTP cu `init: true` pentru supravegherea proceselor daemonului; vezi rezultatele și incidentul consemnat în VALIDATION.md.

## Verificare reproductibilă

```bash
./scripts/start.sh
python3 scripts/policy-routing-test.py
```

Testul live creează numai fixtures sintetice, verifică toate cele 12 combinații, SHA-256/bytes originali, replay/conflict la contoare, refuzul altui proprietar, replay multipart și păstrarea rutei vechi. Restaurează regulile inițiale într-o versiune nouă și folosește optimistic locking pentru a nu suprascrie o editare concurentă. Nu resetează datele existente. Fixtures de test rămân disponibile pentru inspecție.

Test browser real, cu stack-ul deja pornit:

```bash
cd frontend
FILEGRID_POLICY_LIVE=1 FILEGRID_BASE_URL=https://localhost:8443 npx playwright test e2e/policy-routing-live.spec.ts
```

Acesta reproduce cazul din captura utilizatorului: racordare → Database prin UI, apoi upload și recuperare exactă; restaurează regulile inițiale. Testele Java verifică suplimentar ciphertext-ul pentru fiecare destinație și rollback/retry după o eroare de storage.
