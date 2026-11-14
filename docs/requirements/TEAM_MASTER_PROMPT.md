# FILEGRID PPC — MASTER IMPLEMENTATION PROMPT

## 0. Rolul tău și modul de lucru

Ești agentul principal Codex pentru dezvoltarea proiectului **FileGrid PPC**, destinat unui hackathon organizat în contextul Rețele Electrice România / PPC.

Vei primi atașat fișierul PDF oficial cu cerințele hackathonului. Citește-l integral înainte de orice modificare.

Acest prompt conține deciziile arhitecturale și funcționale luate de echipă. PDF-ul este sursa autoritară pentru cerințele obligatorii, iar acest prompt completează cerințele prin decizii de proiectare.

**ROLUL ACESTEI INSTANȚE CODEX: `BACKEND` sau `FRONTEND` — setează rolul înainte de execuție.**

Lucrăm în doi membri, pe două calculatoare diferite, în același repository Git.

- Calculatorul 1: agent principal BACKEND.
- Calculatorul 2: agent principal FRONTEND.
- Fiecare agent principal poate coordona maximum doi subagenți:
  1. Implementation Agent — realizează implementarea.
  2. Verification Agent — verifică implementarea, rulează teste și identifică probleme.

Agentul principal este responsabil de arhitectura domeniului său, coordonare, integrare și deciziile finale.

Dacă subagenții nu sunt disponibili în mediul curent, execută cele două responsabilități secvențial, fără a pretinde că au fost create procese separate.

Nu crea subagenți suplimentari. Nu lansa delegări recursive. Evită consumul inutil de tokenuri.

## 1. Obiectivul proiectului

Construim **FileGrid**, un sistem unificat care primește direct patru categorii de date:

1. Citiri de contoare inteligente.
2. Înregistrări de avarie.
3. Documente de racordare.
4. Videoclipuri de inspecție cu drona.

FileGrid trebuie să:

- primească fișiere și evenimente;
- identifice categoria și caracteristicile lor;
- aplice politici configurabile per categorie;
- aleagă unde și cum sunt stocate;
- folosească efectiv FTP, S3 și Database;
- permită recuperarea fișierelor;
- demonstreze integritatea lor;
- măsoare latența, throughput-ul și erorile;
- tolereze întreruperi și vârfuri de încărcare;
- protejeze datele personale;
- ofere statistici tehnice și de business.

Adăugăm o funcționalitate originală numită provizoriu **FileGrid Storm Intelligence**, care folosește două modele ML specializate și un Decision Agent pentru a ajuta dispeceratul să analizeze și prioritizeze avariile.

**Regulă esențială: procesarea ML nu trebuie să blocheze upload-ul, stocarea sau recuperarea fișierelor.**

## 2. Cerințe obligatorii din PDF

Verifică formulările exacte din PDF și creează o matrice de trasabilitate între cerințe, implementare și teste.

Tratează următoarele drept obligatorii:

### Funcționalitate

- Toate cele patru categorii sunt suportate.
- FTP, S3 și Database sunt folosite efectiv, fiecare ca serviciu separat.
- S3 poate fi emulat local.
- Politicile de stocare sunt configurabile fără modificarea codului.
- Fișierele pot fi încărcate, căutate și descărcate.
- Fișierul recuperat este identic cu cel original, demonstrabil.
- Există un simulator de contoare care trimite citiri continuu, la volum configurabil.
- Aplicația pornește pe o mașină curată printr-o singură comandă documentată.
- Codul, simulatorul, configurațiile și scripturile sunt în repository.

### Scalabilitate

- Un vârf de 10 ori într-o categorie nu trebuie să degradeze semnificativ celelalte categorii.
- Capacitatea trebuie să poată crește prin adăugarea de instanțe, fără modificări de cod.
- Fișierele mai mari de 1 GB nu trebuie încărcate integral în memoria backend-ului.

### Observabilitate

Pentru fiecare categorie și storage:

- p50, p95, p99;
- throughput;
- rată de erori;
- urmărirea unei operații prin correlation ID / trace ID;
- alerte când cerințele de business sunt în pericol.

### Securitate

- Storage-urile nu sunt accesibile direct din exterior; FileGrid este singura cale externă de acces.
- Traficul extern este criptat.
- Accesul la FileGrid necesită autentificare.
- Accesul direct neautorizat la storage nu trebuie să expună datele personale.
- Parolele și cheile nu apar în repository.

### Reziliență

- Căderea unui storage nu oprește inutil celelalte categorii.
- Fișierele deja confirmate nu se pierd.
- Transferurile pot fi reluate după întreruperi.
- Reîncercările nu dublează citirile contoarelor.
- Fișierele corupte sunt detectate la recuperare.

### Statistici și interpretare

Sistemul trebuie să ajute la explicarea alegerii storage-ului, la compararea unei zile normale cu una de vârf și la identificarea tiparelor relevante pentru rețeaua electrică.

Nu sacrifica aceste cerințe pentru funcționalitățile ML.

## 3. Stack tehnologic propus

Respectă mai întâi tehnologiile existente dacă repository-ul conține deja o implementare funcțională.

Pentru un repository nou, propunerea implicită este:

- Backend principal: Java + Spring Boot.
- Frontend: Angular + TypeScript.
- Database: PostgreSQL.
- S3 local: MinIO.
- FTP: server FTP într-un container separat, izolat de exterior.
- ML: Python + scikit-learn, într-un serviciu separat.
- Infrastructură locală: Docker Compose.
- Metrici: Micrometer / Prometheus.
- Vizualizare: dashboard propriu, cu Grafana opțional.
- Testare: JUnit, teste de integrare, pytest, teste frontend.

Nu introduce Kubernetes ca dependență obligatorie pentru MVP. Poate fi documentat drept direcție de scalare.

Dacă timpul este limitat, prioritizează o implementare end-to-end funcțională, demonstrabilă.

## 4. Arhitectura de ansamblu

Fluxul conceptual:

```text
                UTILIZATORI / CONTOARE SIMULATE
                             |
                             v
                       FILEGRID API
                             |
           +-----------------+----------------+
           |                 |                |
           v                 v                v
       Validare        Policy Engine      Observabilitate
           |                 |
           +--------+--------+
                    |
                    v
              Storage Router
                    |
           +--------+--------+
           |        |        |
           v        v        v
       Database     S3      FTP
           |        |        |
           +--------+--------+
                    |
                    v
           Integrity Verification
                    |
                    v
             File AVAILABLE
                    |
          doar pentru avarii
                    v
             Async ML Pipeline
                    |
             +------+------+
             |             |
             v             v
         Model 1         Model 2
             |             |
             +------+------+
                    |
                    v
             Decision Agent
                    |
                    v
             Dispatch Dashboard
```

Acesta este un model logic. Nu este obligatoriu ca fiecare componentă să fie un microserviciu.

Preferă un backend modular, cu interfețe clare, în locul unor servicii distribuite inutile.

## 5. Politicile de stocare

Nu crea un mapping rigid exclusiv după extensia fișierului.

Politicile trebuie să țină cont de:

- categorie;
- dimensiune;
- structură;
- sensibilitate;
- frecvență;
- cerințe de integritate;
- necesitatea transferului reluabil;
- cerințe de acces;
- disponibilitatea sistemului de stocare;
- eventual costuri și performanță măsurate.

Fiecare categorie are o politică de bază.

Regulile obligatorii sunt **hard constraints**; optimizările de performanță sau cost sunt **soft constraints**.

La MVP, deciziile trebuie să fie deterministe și explicabile.

Politicile se definesc în YAML/JSON sau alt mecanism configurabil fără modificarea codului. Prevede reîncărcarea configurației sau o procedură documentată de aplicare a schimbărilor.

La fiecare decizie, salvează:

- politica și versiunea ei;
- criteriile utilizate;
- destinația aleasă;
- motivul;
- timestamp-ul;
- operation ID.

### Tabelul de analiză aprobat

| Proprietate | Contoare | Avarii | Racordare | Drone |
|---|---|---|---|---|
| Intrare | Automată | Manuală | Manuală | Manuală |
| Structură | Standardizată în simulator | Variabilă | Variabilă | Fișier video |
| Dimensiune | 1–50 KB | 1–10 MB | 0,1–10 MB | 100 MB–1 GB+ |
| Frecvență | Continuă | Vârfuri după furtuni | Moderată | Redusă, cu vârfuri |
| Prioritate | Corectitudinea facturării | Disponibilitate rapidă | Securitate | Transfer fiabil |
| Pre-ingestion | Schemă și identificator | Tip, urgență, dimensiune | Sensibilitate și acces | Dimensiune și format declarat |
| Post-ingestion | Deduplicare și integritate | Integritate și disponibilitate | Integritate și audit | Checksum complet |
| Destinație inițială | Database | S3 / Database, după conținut | Storage privat | S3 |

Cazurile detaliate sunt descrise mai jos.

## 6. Categoria 1 — Citiri de contoare

### Comportament

- Intrare automată.
- Simulator de contoare inteligente.
- Payload-uri mici, 1–50 KB.
- Flux continuu.
- Volum configurabil.
- Citirile influențează facturarea.
- Nu trebuie să existe pierderi sau duplicări logice.

### Format comun pentru simulator

Definește o schemă JSON versionată, de exemplu:

```json
{
  "schema_version": 1,
  "reading_id": "MTR-1001-000001",
  "meter_id": "MTR-1001",
  "sequence_number": 1,
  "measured_at": "2026-11-14T10:00:00Z",
  "energy_kwh": 1542.8
}
```

Toate contoarele simulate pot folosi schema comună. Valorile, ID-urile și frecvența se schimbă.

Simulatorul trebuie să poată produce:

- trafic normal;
- trafic de 10 ori mai mare;
- retransmisii;
- duplicate;
- secvențe lipsă;
- întreruperi simulate;
- mesaje invalide.

### Storage

**Database este destinația principală.**

Folosește PostgreSQL cu:

- identificatori unici;
- constrângeri UNIQUE;
- tranzacții;
- idempotency;
- validare;
- confirmare după commit durabil;
- detectarea secvențelor lipsă.

Reîncercarea aceluiași eveniment trebuie să reutilizeze același identificator.

Nu pretinde garanții absolute „exactly once” doar pentru că există o cheie unică. Demonstrează concret că retransmisiile nu produc citiri duplicate și că mecanismul de retry poate recupera evenimentele neconfirmate.

Un jurnal durabil / o coadă de mesaje poate fi inclusă dacă este justificată de arhitectură și timp. Nu transforma Kafka într-o dependență obligatorie care blochează MVP-ul.

Citirile confirmate trebuie să poată fi recuperate în forma originală. Dacă sunt parsate în coloane, păstrează și reprezentarea canonică sau payload-ul necesar verificării identității la nivel de octeți.

### Statistici relevante

- Citiri/secundă.
- Duplicate detectate.
- Citiri lipsă.
- Retry-uri.
- Latență de ingestie.
- Throughput.
- Anomalii simple în valori, opțional.

## 7. Categoria 2 — Înregistrări de avarie

### Comportament

- Încărcare manuală.
- Fișiere aproximativ 1–10 MB.
- Formate variabile.
- Puține în condiții normale.
- Vârfuri bruște după furtuni.
- Informațiile trebuie să fie disponibile rapid pentru dispecerat.

### Model conceptual

Separă:

1. Metadatele incidentului.
2. Conținutul fișierului.
3. Starea upload-ului.
4. Starea verificării integrității.
5. Starea analizei ML.
6. Recomandările pentru dispecerat.

Un incident poate avea:

- incident ID;
- station ID;
- zone;
- event type;
- severity reported;
- timestamp;
- estimated affected customers;
- equipment type;
- attachment type;
- uploaded file;
- uploader;
- upload status.

Aceste câmpuri sunt propuneri pentru datele de test, nu sunt obligatorii în PDF.

### Formate simulate

Suportă câteva variante:

- JSON structurat;
- XML / log;
- PDF sau alt atașament de diagnostic.

Nu este necesar să implementezi parsere universale pentru orice document posibil. Construiește un set controlat de formate demonstrabile, cu validare și handling pentru tipuri necunoscute.

### Storage

Politică inițială:

- metadatele incidentului: Database;
- atașamente binare: S3;
- unele loguri non-sensibile / diagnostice legacy: FTP, conform unei reguli configurabile.

FTP trebuie folosit efectiv pentru cel puțin un flux demonstrabil, nu doar pornit ca serviciu gol.

FTP nu trebuie expus direct din exterior. Protejează comunicațiile și datele, iar pentru o variantă simplă de laborator folosește o rețea internă izolată. Nu trimite documente personale necriptate prin FTP simplu.

Căderea FTP nu trebuie să blocheze citirile contoarelor sau documentele de racordare.

### Disponibilitate

Fișierul devine `AVAILABLE` după finalizarea upload-ului și verificarea cerută.

Metadatele urgente ale incidentului pot fi afișate imediat după recepționarea și validarea lor, chiar dacă un atașament este încă în procesare.

**ML-ul nu condiționează disponibilitatea fișierului.**

### Statistici

- Număr incidente per zonă;
- Incidente per stație;
- Distribuție severitate;
- Evoluție în timp;
- Vârfuri de volum;
- Incidente corelate;
- Timp de la raportare la disponibilitate;
- Timp de procesare ML.

## 8. Categoria 3 — Documente de racordare

### Comportament

- Încărcare manuală.
- Dimensiuni 0,1–10 MB.
- PDF, JPG, PNG și alte formate acceptate.
- Cereri, avize, cărți de identitate, documente justificative.
- Pot conține date personale.

### Storage

Folosește:

- S3 privat pentru conținutul fișierelor;
- PostgreSQL pentru metadate și permisiuni.

Toate documentele personale trebuie să respecte aceeași politică de securitate de bază, indiferent de dimensiune.

Nu direcționa un pașaport către un storage mai slab protejat doar pentru că este mic.

### Securitate

- Acces autentificat.
- Autorizare per document.
- Control pe roluri.
- Criptarea conținutului.
- Audit pentru operații relevante.
- Fără acces public.
- Fără date personale în nume de obiect sau chei.
- Fără secrete în Git.
- Date de test fictive, nu acte reale.

Ține cont de cerința din PDF conform căreia accesul direct neautorizat la storage nu trebuie să expună datele personale.

Dacă pentru MVP folosești criptare la nivelul aplicației, documentează gestionarea cheilor și limitele implementării.

Nu pretinde certificare GDPR sau securitate enterprise completă pentru prototip.

### Metadate

- document ID;
- owner ID;
- application ID;
- document type;
- storage key;
- upload timestamp;
- checksum;
- access level;
- retention category;
- status.

### Audit

Înregistrează încărcările, descărcările, accesările refuzate și ștergerile.

## 9. Categoria 4 — Videoclipuri de dronă

### Comportament

- Încărcare manuală.
- Fișiere 100 MB–1 GB+.
- Posibile transferuri lente și instabile.
- Fișiere puține, dar mari.
- Posibile vârfuri după furtuni.

### Flux de upload

1. Utilizatorul selectează videoclipul.
2. Frontend-ul transmite metadatele către FileGrid.
3. FileGrid verifică categoria, utilizatorul, dimensiunea și politica.
4. FileGrid alege S3 și metoda de upload.
5. Se creează o sesiune de transfer.
6. Fișierul este transmis în streaming sau chunks.
7. Părțile complet transmise sunt urmărite.
8. Părțile eșuate pot fi reîncercate.
9. La final se verifică integritatea.
10. Fișierul devine `AVAILABLE`.

Nu încărca tot fișierul în memoria backend-ului.

Pentru fișiere mari, utilizează streaming și multipart/resumable upload.

Păstrează starea necesară reluării unui transfer după întrerupere. Suportă idempotency și cleanup pentru upload-uri abandonate.

Deoarece PDF-ul cere ca storage-urile să nu fie accesibile direct din exterior, fluxul browser → FileGrid → storage trebuie proiectat astfel încât FileGrid să rămână singurul punct de intrare extern.

### Analiza videoclipului

Înainte de upload pot fi utilizate:

- categoria;
- dimensiunea declarată;
- tipul declarat;
- drepturile utilizatorului;
- politica de routing.

În timpul upload-ului pot fi colectate:

- progres;
- chunk status;
- retry count;
- bytes transferred;
- durată;
- checksum incremental.

După upload:

- verificare integritate;
- tip real de fișier, dacă se implementează;
- metadata extraction opțional;
- AVAILABLE / FAILED.

Nu este necesară analiza semantică ML a conținutului video.

### Statistici

- Viteză medie de transfer;
- Durată upload;
- Retry-uri;
- Procent de upload-uri reluate;
- Eșecuri;
- Throughput;
- Integritate.

## 10. Ciclul de viață comun al fișierelor

Folosește un model coerent de stări:

```text
CREATED
   |
UPLOADING
   |
UPLOADED
   |
VERIFYING
   |
AVAILABLE
```

Pentru cazuri de eroare:

```text
FAILED
RETRY_PENDING
CANCELLED
```

Dacă o operație este confirmată ca reușită, trebuie să existe un fișier recuperabil și valid.

Verificarea integrității este separată de validarea semantică.

Folosește SHA-256 sau un mecanism criptografic echivalent.

Trebuie demonstrat:

```text
hash(original) == hash(downloaded)
```

Nu considera ETag-ul unui multipart upload drept hash-ul complet al fișierului fără verificarea semanticii concrete a providerului.

## 11. Originalitate — FileGrid Storm Intelligence

Construiește partea ML ca subsistem separat, asincron, numai pentru categoria avarii.

Scopul nu este controlul automat al rețelei electrice, ci **suportul decizional pentru dispecerat**.

Arhitectură:

```text
Incident uploaded
       |
       v
FileGrid storage
       |
       v
Integrity verified
       |
       +----------------------> Dispatcher can access file
       |
       v
Async ML event
       |
       +-------------------+
       |                   |
       v                   v
Model 1                Model 2
Impact & Urgency       Incident Correlation
       |                   |
       +---------+---------+
                 |
                 v
         Decision Agent
                 |
                 v
       Dispatcher Recommendations
```

### Model 1 — Impact & Urgency Predictor

Scop: estimarea priorității de investigare.

Intrări posibile:

- event type;
- reported severity;
- voltage deviation;
- estimated affected customers;
- equipment type;
- incident age;
- weather context;
- historical incidents in zone.

Ieșiri:

- priority score;
- priority class;
- confidence, dacă este calibrată;
- factori explicativi.

Pentru MVP, folosește un model tabular precum Random Forest sau Gradient Boosting.

Dacă datele sunt sintetice și etichetele generate artificial, marchează clar că rezultatele demonstrează pipeline-ul, nu acuratețea operațională reală.

### Model 2 — Incident Correlation

Scop: identificarea grupurilor de incidente posibil corelate.

Intrări posibile:

- zonă;
- coordonate simulate;
- timp incident;
- tip eveniment;
- station ID;
- equipment type;
- alte caracteristici utile.

Metodă recomandată: DBSCAN sau alt algoritm de clustering potrivit.

Normalizează corespunzător dimensiunile spațiale și temporale înainte de clustering.

Ieșiri:

- cluster ID;
- dimensiunea grupului;
- interval temporal;
- zone afectate;
- anomalii / incidente izolate;
- informații despre corelația posibilă.

Nu afirma că două incidente au aceeași cauză doar pentru că sunt apropiate în timp sau spațiu.

### Decision Agent

Este o componentă mică, explicabilă, care combină:

- ieșirile Modelului 1;
- ieșirile Modelului 2;
- reguli de siguranță;
- informații despre incident;
- disponibilitatea documentelor;
- contextul operațional.

Pentru MVP, implementează-l ca **rule-based decision engine**, nu ca LLM obligatoriu.

Exemplu:

```text
IF safety_critical_flag:
    human_review = IMMEDIATE

ELSE IF urgency_score > configured_threshold
    AND incident_cluster_size > configured_threshold:
    human_review = HIGH_PRIORITY

ELSE IF anomaly_detected:
    human_review = SPECIALIST_REVIEW

ELSE:
    human_review = STANDARD
```

Ieșirea trebuie să includă:

- recomandare;
- motive;
- model versions;
- policy version;
- factori relevanți;
- timestamp.

Nu permite agentului să comande echipamente, să dispună întreruperi sau să controleze autonom infrastructura electrică.

### Normal Mode și Storm Mode

Adaugă o funcție care identifică vârfurile de incidente și adaptează prezentarea dashboard-ului.

Normal Mode:

- accent pe incidente individuale;
- anomalii;
- istoric.

Storm Mode:

- accent pe grupuri;
- volum mare;
- prioritizare;
- zone afectate;
- tendințe.

Tranziția poate fi calculată printr-o regulă configurabilă bazată pe volumul recent, nu necesită neapărat al treilea model ML.

### Disponibilitatea dispeceratului

Aceasta este o cerință arhitecturală fundamentală.

**Fișierul trebuie să fie accesibil dispeceratului independent de terminarea analizei ML.**

Afișează separat:

```text
File status: AVAILABLE
ML status: PENDING
```

Ulterior:

```text
File status: AVAILABLE
ML status: COMPLETED
Recommendation: HIGH_PRIORITY_REVIEW
```

Dacă ML-ul eșuează:

```text
File status: AVAILABLE
ML status: FAILED
```

Fișierul trebuie să rămână disponibil.

Nu bloca dispeceratul dacă serviciul ML nu răspunde.

## 12. Observabilitate și dashboard

Pentru fiecare operație urmărește:

- operation ID;
- category;
- storage;
- upload start/end;
- bytes transferred;
- duration;
- success/failure;
- retry count;
- checksum result;
- policy decision;
- error type.

Agregă pentru fiecare combinație categorie-storage:

- p50;
- p95;
- p99;
- throughput;
- rata de erori;
- numărul operațiilor.

Nu inventa costuri reale dacă nu există o configurație de pricing. Poți calcula estimări marcate explicit și bazate pe parametri configurabili.

Frontend-ul trebuie să arate atât statistici tehnice, cât și statistici de business.

## 13. Structura repository-ului

Inspectează repository-ul înainte de a crea fișiere.

Nu șterge sau rescrie inutil structuri existente.

Pentru un repository nou, folosește ca punct de plecare:

```text
filegrid/
├── AGENTS.md
├── README.md
├── .env.example
├── .gitignore
├── docker-compose.yml
│
├── backend/
│   ├── src/
│   ├── tests/
│   └── ...
│
├── frontend/
│   ├── src/
│   ├── tests/
│   └── ...
│
├── ml-service/
│   ├── app/
│   ├── models/
│   ├── training/
│   ├── tests/
│   └── ...
│
├── meter-simulator/
│   ├── src/
│   ├── tests/
│   └── ...
│
├── infra/
│   ├── postgres/
│   ├── minio/
│   ├── ftp/
│   └── monitoring/
│
├── config/
│   └── storage-policies.yaml
│
├── contracts/
│   ├── openapi.yaml
│   ├── incident.schema.json
│   ├── meter-reading.schema.json
│   └── ml-result.schema.json
│
├── docs/
│   ├── ARCHITECTURE.md
│   ├── REQUIREMENTS_MATRIX.md
│   ├── DECISIONS.md
│   ├── BACKEND_TASKS.md
│   ├── FRONTEND_TASKS.md
│   ├── INTEGRATION_CONTRACT.md
│   ├── TEST_PLAN.md
│   ├── DEMO_PLAN.md
│   ├── PROGRESS_BACKEND.md
│   └── PROGRESS_FRONTEND.md
│
└── scripts/
    ├── smoke-test.*
    └── demo-data.*
```

Folosește structura ca recomandare, nu ca motiv pentru a reconstrui un proiect deja existent.

## 14. Fișierele de coordonare obligatorii

Creează / menține următoarele:

### AGENTS.md

Documentul comun pentru toate instanțele Codex.

Trebuie să conțină:

- obiectivul proiectului;
- sursa cerințelor;
- arhitectura;
- responsabilități;
- reguli de ownership;
- reguli Git;
- convenții;
- criterii de acceptare;
- verificări înainte de commit;
- regula că ML-ul nu blochează stocarea;
- regula că nu se schimbă contractele unilateral.

### docs/REQUIREMENTS_MATRIX.md

Pentru fiecare cerință din PDF:

- ID;
- pagină;
- descriere;
- prioritate;
- componenta responsabilă;
- implementare;
- test;
- status.

### docs/DECISIONS.md

Architecture Decision Records concise:

- decizia;
- motivul;
- alternativele;
- compromisurile;
- status.

### docs/INTEGRATION_CONTRACT.md

Contractul dintre frontend și backend:

- endpoint-uri;
- request/response;
- erori;
- autentificare;
- upload sessions;
- chunk upload;
- download;
- file statuses;
- metrics;
- incidente;
- ML statuses;
- recomandări.

Backend-ul este owner-ul contractului API. Frontend-ul îl consumă.

Orice modificare incompatibilă necesită comunicare și coordonare între cei doi membri.

### docs/BACKEND_TASKS.md și docs/FRONTEND_TASKS.md

Task-uri clare, cu:

- ID;
- descriere;
- dependențe;
- fișiere deținute;
- criterii de acceptare;
- teste;
- stare.

### docs/PROGRESS_BACKEND.md și docs/PROGRESS_FRONTEND.md

Jurnal scurt, pentru handoff între membri.

Include:

- ce s-a terminat;
- ce se implementează;
- contractele modificate;
- blocaje;
- teste rulate;
- commit relevant.

### docs/TEST_PLAN.md

Planul de validare pentru cerințele obligatorii și scenariile de demo.

## 15. Împărțirea lucrului pe calculatoare

### Calculatorul BACKEND

Agent principal BACKEND:

- analizează PDF-ul;
- definește arhitectura backend;
- stabilește contractele API;
- coordonează infrastructura;
- planifică implementarea ML și simulatorului;
- verifică integrarea backend;
- menține documentația tehnică generală.

Implementation Agent BACKEND:

- implementează API;
- storage adapters;
- policy engine;
- integrity verification;
- simularea contoarelor;
- ML service;
- metrics;
- infrastructura necesară.

Verification Agent BACKEND:

- scrie / rulează teste;
- verifică integritatea;
- testează duplicatele;
- testează întreruperile de upload;
- verifică comportamentul la căderea unui storage;
- verifică securitatea;
- raportează probleme.

Agentul principal face integrarea și rezolvă conflictele.

### Calculatorul FRONTEND

Agent principal FRONTEND:

- analizează PDF-ul;
- planifică UI/UX;
- consumă API contract;
- coordonează componentele frontend;
- verifică integrarea cu backend-ul.

Implementation Agent FRONTEND:

- dashboard;
- upload forms;
- progres upload;
- căutare și download;
- politici;
- metrici;
- simulator controls;
- Storm Intelligence dashboard.

Verification Agent FRONTEND:

- teste componente;
- verificări de UX;
- teste de loading/error/empty states;
- verificarea fluxurilor upload/download;
- teste de integrare cu API-ul;
- probleme de accesibilitate.

### Ownership pe directoare

BACKEND este owner pentru:

```text
backend/
ml-service/
meter-simulator/
infra/
config/
contracts/
scripts/
docker-compose.yml
```

FRONTEND este owner pentru:

```text
frontend/
```

Documentația comună este coordonată prin Git.

BACKEND deține modificările contractului și infrastructurii. FRONTEND poate propune modificări, dar nu editează unilateral fișierele de contract partajate.

Fișierele de progres sunt deținute separat.

Nu permite subagenților să facă simultan modificări incompatibile în aceleași fișiere.

## 16. Git și colaborare

Folosiți branch-uri separate:

```text
main
develop
feature/backend-core
feature/frontend-core
feature/ml-storm-intelligence
```

Puteți adăuga alte branch-uri doar dacă există nevoie reală.

Reguli:

- Nu lucrați amândoi direct pe `main`.
- Nu executa force push pe branch-uri comune.
- Nu rescrie codul celuilalt membru fără coordonare.
- Contractele API se definesc înainte de integrarea componentelor.
- Commits mici și clare.
- Nu comiteți parole, chei, documente personale reale sau fișiere video mari.
- Nu presupune că schimbările de pe alt calculator sunt deja disponibile local.
- Nu pretinde că ai făcut merge sau push dacă operația nu a avut loc.
- La fiecare handoff, actualizează progresul și testele.

## 17. Ordinea implementării

### Faza 0 — Analiză și contracte

1. Citește PDF-ul.
2. Inspectează repository-ul.
3. Creează matricea cerințelor.
4. Definește arhitectura.
5. Definește politicile.
6. Definește contractele API.
7. Creează fișierele de coordonare.
8. Stabilește task-uri separate pentru cei doi membri.

### Faza 1 — MVP end-to-end

1. Docker Compose.
2. Trei servicii storage funcționale.
3. API de upload și download.
4. Routing configurabil.
5. Metadate.
6. Verificare integritate.
7. Interfață funcțională.
8. Teste smoke.

### Faza 2 — Cerințe critice pe categorie

1. Simulator contoare.
2. Deduplicare și retry.
3. Avarii cu acces rapid.
4. Documente private.
5. Upload video reluabil.
6. Izolare între categorii.

### Faza 3 — Observabilitate

1. Metrici.
2. Percentile.
3. Throughput.
4. Error rate.
5. Correlation ID.
6. Dashboard.
7. Alerte.

### Faza 4 — Storm Intelligence

1. Date de test.
2. Model 1.
3. Model 2.
4. Decision Agent.
5. Integrare asincronă.
6. Dashboard dispecerat.
7. Normal Mode / Storm Mode.

### Faza 5 — Validare și demo

1. Teste end-to-end.
2. Scenariu de furtună.
3. Test 10x load.
4. Test fișier peste 1 GB.
5. Test conexiune degradată.
6. Test duplicate.
7. Test corupere.
8. Test cădere storage.
9. Pornire pe mașină curată.
10. Documentarea limitărilor.

## 18. Scenariile obligatorii de demonstrație

Pregătește o demonstrație reproductibilă cu:

**Scenariul A — Meter Duplication**

Simulează retransmiterea aceleiași citiri și arată că nu produce două înregistrări logice.

**Scenariul B — Storm Spike**

Crește de 10 ori numărul rapoartelor de avarie și arată că celelalte categorii continuă să funcționeze.

**Scenariul C — Sensitive Document**

Încarcă un document fictiv și demonstrează că un utilizator neautorizat nu îl poate descărca.

**Scenariul D — Drone Resume**

Întrerupe un upload mare, reia transferul și verifică integritatea fișierului final.

**Scenariul E — Storage Routing**

Modifică politica prin configurație și demonstrează schimbarea destinației pentru un nou fișier eligibil.

**Scenariul F — ML Independent**

Încarcă un incident, confirmă că fișierul este disponibil, apoi arată că analiza ML se finalizează separat.

**Scenariul G — ML Failure**

Oprește serviciul ML și demonstrează că dispeceratul poate continua să acceseze fișierele.

**Scenariul H — Integrity Verification**

Modifică intenționat un fișier din storage și demonstrează că sistemul detectează coruperea la recuperare.

**Scenariul I — Storage Failure**

Oprește un storage și verifică faptul că fișierele deja confirmate din celelalte sisteme rămân accesibile.

**Scenariul J — Clean Start**

Rulează exact comanda documentată de pornire, pe un mediu curat.

## 19. Reguli de calitate

- Cod modular.
- Responsabilități separate.
- Fără secrete hardcodate.
- Fără date personale reale în fixtures.
- Fără încărcarea fișierelor mari integral în RAM.
- Retry-uri cu limite și comportament documentat.
- Erori clare.
- Endpoint-uri versionate.
- Status-uri consistente.
- Teste automate pentru mecanismele critice.
- Documentare pentru compromisurile făcute.
- Fără rezultate fictive prezentate ca benchmark-uri reale.
- Fără modele ML prezentate ca validate operațional dacă sunt antrenate pe date sintetice.

## 20. Cum trebuie să începi

Nu începe prin a genera întregul proiect într-un singur pas, fără planificare.

În prima etapă:

1. Citește PDF-ul atașat integral.
2. Inspectează structura actuală a repository-ului.
3. Identifică ce există deja.
4. Construiește matricea cerințelor.
5. Semnalează eventualele contradicții între arhitectura propusă și PDF.
6. Creează `AGENTS.md` și documentele de coordonare necesare.
7. Definește API contract și datele comune.
8. Creează task-uri cu criterii de acceptare.
9. Separă responsabilitățile după rolul acestei instanțe.
10. Începe implementarea pe domeniul tău, în ordinea priorităților.

Nu aștepta confirmare pentru fiecare detaliu minor. Ia decizii rezonabile și documentează-le.

Dacă o alegere are implicații majore asupra contractului comun, marcheaz-o explicit în documentația de integrare.

## 21. Instrucțiuni pentru agentul principal

Tu coordonezi activitatea în rolul selectat.

Folosește maximum doi subagenți:

- Implementare.
- Verificare.

Nu da aceeași sarcină ambilor agenți.

Nu porni implementarea și verificarea concurent pe exact aceleași fișiere.

Flux preferat:

```text
Principal Agent
      |
      v
Definește task și criterii
      |
      v
Implementation Agent
      |
      v
Code changes
      |
      v
Verification Agent
      |
      v
Tests + findings
      |
      v
Principal Agent
      |
      v
Integrare + documentare
```

Dacă mediul suportă subagenți concurenți și există task-uri independente, aceștia pot lucra în paralel numai pe directoare/fișiere distincte.

Subagentul de verificare trebuie să raporteze problemele fără să rescrie simultan codul agentului de implementare.

La finalul fiecărei etape, raportează:

- ce ai implementat;
- ce fișiere ai modificat;
- ce teste au fost rulate și rezultatele lor;
- ce cerințe din PDF sunt acoperite;
- ce lipsește;
- ce trebuie preluat de celălalt membru.

## 22. Criteriul final de succes

Proiectul este reușit dacă:

1. FileGrid primește toate cele patru categorii.
2. Folosește efectiv FTP, S3 și Database.
3. Aplică politici configurabile.
4. Permite recuperarea și demonstrează integritatea fișierelor.
5. Gestionează corect retransmisiile contoarelor.
6. Protejează documentele personale.
7. Suportă transferuri mari și întreruperi.
8. Oferă metrici și statistici interpretate.
9. Respectă testele relevante de reziliență și scalabilitate.
10. Pornește printr-o singură comandă.
11. Storm Intelligence oferă recomandări explicabile.
12. ML-ul nu blochează accesul dispeceratului la informațiile deja stocate.

**Prioritate absolută: cerințele eliminatorii și corectitudinea funcțională înaintea complexității suplimentare.**

Începe acum cu analiza PDF-ului și a repository-ului, creează documentația și contractele, apoi execută sarcinile corespunzătoare rolului configurat.
