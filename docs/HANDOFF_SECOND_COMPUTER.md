# Handoff — calculatorul 2 / FRONTEND

## Stare curentă

Repository unic: https://github.com/Grey-FoXx/FileGrid-PPC. Baseline comun publicat pe `develop`: `f5b2580a4a669a27d90ad91a2f1af2e199df018b`. BACKEND lucrează pe `feature/backend-hardening`; FRONTEND pe `feature/frontend-improvements`. Nu crea alt repository sau un al doilea frontend. Hash-ul noului checkpoint backend este comunicat după commit; nu presupune că există pe GitHub înaintea publicării explicite.

BH01 și BH02–BH06 au fost autorizate ulterior opririi inițiale. Vezi [BH02_06_REPORT.md](BH02_06_REPORT.md), [VALIDATION.md](VALIDATION.md) și [LIMITATIONS.md](LIMITATIONS.md). Frontend și contractul public OpenAPI au rămas nemodificate în acest hardening.

## Implementat și demonstrat

- Angular existent: login în memorie, listare/căutare/paginare, upload, SHA-256 în worker, progres și sesiuni persistente, download verificat, dispecerat/ML, politici. Dezvoltarea UI continuă exclusiv pe calculatorul FRONTEND.
- Spring Boot: politici YAML, metadate/sesiuni/joburi/audit PostgreSQL, adaptoare Database/S3/FTPS, integritate și identități/idempotency durabile. Bulkhead-uri per categorie și verificatori separați limitează interferența; campania măsurată este documentată cu limite.
- Documente: conținut AES-GCM în S3, control de acces per proprietar/rol. Metadatele SQL nu sunt criptate.
- Drone: multipart 8MiB cu părți persistente; restart API și reluare cu hash identic demonstrate. Testul nativ de 1229MiB rămâne separat de benchmark-ul Docker.
- ML: două modele sintetice și Decision Agent, asincron. Fișierul devine AVAILABLE cu ML oprit; analiza se finalizează după revenire.
- Compose real pornește pe `filegrid-bh01`: PostgreSQL, MinIO, FTPS, API, Nginx/Angular, simulator, ML, Prometheus, Alertmanager. Doar gateway-ul publică portul 18443. Initializatoarele ies cu succes.
- FTPS necesită TLS>=1.2 și CA/hostname corecte; aplicația are cont S3 restrâns fără administrare bucket. Fiecare serviciu primește doar secretele necesare.
- Șapte reguli de alertă sunt testate; o alertă a fost livrată efectiv și rezolvată prin webhook privat. Nu există endpoint public pentru alerte.
- Testele Docker de roluri/owner/sesiuni, concurență meter, căderi FTP/S3/SQL/ML, corupere/restaurare și recuperare exactă au trecut. Numerele finale și campania de rețea/încărcare sunt în raport.

## Compatibilitate pentru FRONTEND

- Schemele și endpoint-urile `/api/v1` rămân cele din `contracts/openapi.yaml`.
- La saturare poate apărea `429 CATEGORY_BUSY`, cu `Retry-After: 1` și formatul problem existent. Folosește backoff limitat și **aceeași** cheie idempotency/identitate/parte. Nu abandona sau recrea automat o sesiune validă.
- `AVAILABLE` nu presupune `ML COMPLETED`. Nu bloca download-ul pe ML.
- Endpoint-ul intern de alerte este blocat de gateway. Orice viitor read/ack public cere acord comun pentru contract, roluri, paginare și stări; nu folosi `/internal/` în browser.
- Parolele locale se generează separat pe fiecare calculator în runtime/accounts.txt. Nu copia secrete, chei AES sau certificate private prin Git.
- Integrați branch-ul backend prin `develop` după publicare și verificarea SHA-ului; nu suprascrieți frontend-ul celuilalt calculator.

## Task-uri frontend independente

1. FE06: accesibilitate, focus și tastatură, etichete de progres, teste pe fixtures.
2. FE07: retry limitat pentru 429/rețea, sesiune expirată/anulată, reselectarea fișierului și păstrarea identității/părților; API existent.
3. FE08: separarea componentei principale în servicii/pagini fără schimbarea comportamentului sau contractului.
4. FE09: prezentarea bytesPerSecond/operationsPerSecond și latențelor existente, loading/empty/error; nu fabrica metrici.
5. FE10: UX și teste pe roluri connection/field/dispatcher, stări ML independente de disponibilitate.

Aceste task-uri pot folosi fixtures fără backend. Alertele publice sunt un task coordonat separat, nu independent.

```bash
cd frontend
npm ci
npm run build
npm test
```

Node 24.15+, Chrome local sau CHROME_BIN. FILEGRID_LIVE=1 presupune API-ul și runtime-ul configurate pentru test; testele fixtures îl omit implicit. `npm start` folosește proxy-ul existent către API localhost:8080; stack-ul Compose complet folosește HTTPS prin gateway. Consultați README pentru runtime/proiect/port și varianta `sg docker` în sesiunile cu grupuri vechi.

## Limite care nu trebuie prezentate drept finalizate

SQL HA, câștigul măsurat din scalare orizontală, backup restore, rotația cheilor/certificatelor, workload-uri mari/reprezentative de lungă durată, audit/penetration review complet, UI pentru alerte și validarea operațională ML. Certificatele locale expiră în 30 zile. Datele și volumele existente sunt păstrate; niciun cleanup distructiv nu este autorizat.

Ownership: FRONTEND deține frontend/ și propriile task/progress docs. BACKEND deține contractele, backend-ul, infrastructura, simulatorul, ML și scripturile. Documentele comune se coordonează prin principal.
