# Handoff — calculatorul 2 / FRONTEND

## Punctul de pornire

- Repository unic: https://github.com/Grey-FoXx/FileGrid-PPC
- Branch de lucru: `develop`.
- SHA exact al checkpoint-ului: `git rev-parse HEAD`; este comunicat și în raportul final al sesiunii.
- Push-ul HTTPS anterior a eșuat: `could not read Username for https://github.com`. Nu presupune că sursele există pe GitHub până nu este confirmat push-ul checkpoint-ului.
- Implementarea este oprită la cererea utilizatorului. Reluarea necesită o sarcină explicită; acest raport nu lansează automat lucru nou.

După publicarea branch-ului:

```bash
git clone --branch develop https://github.com/Grey-FoXx/FileGrid-PPC.git
cd FileGrid-PPC
git rev-parse HEAD
```

Verificați același SHA pe ambele calculatoare. Pentru următoarea sarcină frontend aprobată, creați un branch `feature/frontend-<task>` din acest checkpoint. Nu creați alt repository sau un al doilea frontend.

## Ce este implementat

- Angular: autentificare în memorie, dashboard, căutare/listare/paginare, upload pe categorii, SHA-256 în Web Worker, progres, pause/resume bazat pe sesiuni persistente, download verificat, dispecerat și rezultate ML, politici active.
- Spring Boot: autentificare/roluri, politici YAML, adaptoare Database/S3/FTP, metadate, audit de bază, integritate și joburi durabile.
- Contoare: original în PostgreSQL, unicitate/idempotency și simulator SQLite durabil.
- Racordare: criptare AES-GCM și autorizare per proprietar.
- Drone: multipart persistent de 8 MiB, reluare după restart API.
- ML: Random Forest + DBSCAN + Decision Agent cu reguli, independent de disponibilitatea fișierelor.
- Compose, bootstrap fără secrete în Git, Nginx HTTPS, MinIO din sursă fixată, vsftpd separat și Prometheus.

## Ce funcționează demonstrat

Vezi [VALIDATION.md](VALIDATION.md): 4 teste Java, 4 teste browser (unul live), 2 teste simulator, 3 teste ML; build-uri; smoke real pentru toate storage-urile; 1229 MiB cu SHA-256 identic și heap 512 MiB; corupere FTP; document privat; ML suspendat; schimbare politică și restart API în timpul unui upload.

## Ce nu funcționează sau rămâne neverificat

- Push GitHub: autentificare Git absentă în acest mediu.
- Docker daemon: acces refuzat la socket. Compose este validat static; întregul stack în containere nu a fost pornit.
- O testare live anterioară a eșuat deoarece un JAR în execuție a fost suprascris de build. Verificarea finală folosește o copie runtime separată.
- Nu sunt livrate garanții HA, izolare demonstrată la 10x sau validare completă a rețelei degradate.
- Alertele automate, auditul complet, FTPS, rotația cheilor și contul S3 cu drepturi restrânse rămân task-uri backend. MVP folosește cheia de acces MinIO administrativă numai în rețeaua privată.
- Statistici: latențe, rate și contoare de bază; comparația normal/vârf și explorarea grupurilor necesită completare.
- Datele ML sunt sintetice. Cluster ID este local analizei, nu un identificator global stabil al unei cauze comune.

## Cum verifică FRONTEND fără să blocheze BACKEND

```bash
cd frontend
npm ci
npm run build
npm test
```

Node compatibil 24.15+, Chrome local sau `CHROME_BIN`. Cele trei teste cu fixtures funcționează fără backend; testul live este omis implicit. Nu activa `FILEGRID_LIVE=1` fără un API local la portul 8080 și `.runtime/accounts.properties`.

`npm start` servește numai pe 127.0.0.1:4200 și proxyează API către localhost:8080. Pentru stack-ul complet folosește comanda de pornire din README. Fiecare calculator generează propriile credențiale locale; nu copia secrete prin Git.

## Task-uri frontend independente, după o nouă atribuire

1. **FE06 — accesibilitate:** navigare exclusiv tastatură, focus la erori/modale și etichete pentru progres; modificări numai în frontend; criteriu: fluxurile existente rămân funcționale și testele browser trec.
2. **FE07 — resume și erori:** teste browser pentru retry de rețea, sesiune expirată/anulată, pauză și fișier reselectat. Folosește API-ul existent și fixtures, fără schimbări de contract.
3. **FE08 — organizare Angular:** separă componenta principală în pagini și servicii păstrând comportamentul și contractul. Nu crea un al doilea shell sau client HTTP.
4. **FE09 — statistici existente:** afișează bytesPerSecond și operationsPerSecond deja returnate; loading/empty/error coerente, fără metrici fabricate. Nu introduce alte endpoint-uri.
5. **FE10 — UX pe roluri:** verifică conturile connection/field/dispatcher, selecțiile și stările goale; completează teste pe fixtures. Autorizarea rămâne responsabilitatea backend-ului.

Ownership: FRONTEND deține `frontend/`, lista și jurnalul propriu. BACKEND deține contractele, configurația, infrastructura, simulatorul, ML și scripturile. Propunerile API se consemnează în integrare, fără modificări unilaterale.
