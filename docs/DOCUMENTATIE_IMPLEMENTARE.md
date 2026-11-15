# FileGrid — documentație concisă de implementare

> Document de prezentare bazat pe cerințele **FileGrid PPC**, codul ramurii
> `feature/demo-command-center` și verificările consemnate la 15.11.2026.
> Datele din modul Demo sunt sintetice. **Verificat** înseamnă că există o probă
> executată; **implementat** că funcția există în cod; **parțial** că mai lipsește o parte
> din cerința PDF.

## 1. Ce este FileGrid

FileGrid este punctul unic prin care intră, se stochează și se recuperează patru categorii
de date ale rețelei electrice. Aplicația alege storage-ul prin politici configurabile,
păstrează metadatele, verifică integritatea și măsoară operațiile.

```text
Utilizator / contor simulat
          │ HTTPS + autentificare
          ▼
 Angular + Nginx ──► Spring Boot ──► motor de politici
                              ├────► PostgreSQL (date + metadate)
                              ├────► MinIO / S3 (obiecte)
                              └────► FTP (integrare legacy)
                                      │
                                      └── worker ML asincron
```

Stack: **Angular, Spring Boot, PostgreSQL, MinIO, vsftpd, Python ML,
Prometheus și Docker Compose**. Numai gateway-ul HTTPS publică un port către host;
storage-urile și serviciile interne sunt în rețele Docker private.

## 2. Tratarea celor patru categorii

| Categoria din PDF | Intrare | Storage principal | Garanția implementată |
|---|---|---|---|
| Citiri de contoare | Simulator continuu / API | PostgreSQL | Payload original, identitate stabilă, ACK după commit, retry fără duplicate |
| Înregistrări de avarie | Interfață/API | S3 sau FTP, conform politicii | Metadate disponibile imediat; atașamentul nu așteaptă ML |
| Documente de racordare | Interfață/API | S3 privat | AES-256-GCM înainte de storage, control pe proprietar și audit |
| Video de dronă | Interfață/API | S3 multipart | Părți de 8 MiB, pauză/reluare și verificare SHA-256 |

PostgreSQL păstrează și metadatele comune: proprietar, categorie, status, SHA-256,
storage, cheia internă, politica și versiunea ei, motivul rutării, starea integrității,
ID-ul operației și datele de audit.

## 3. Funcționalități implementate

### Rutare și politici

- Politicile sunt configurabile per categorie din pagina **Politici de stocare**.
- Configurația activă este versionată și persistată în PostgreSQL; YAML-ul este doar
  configurația inițială/default.
- Modificarea se aplică imediat sesiunilor noi, fără restart și fără comenzi manuale.
- O sesiune deja creată își păstrează versiunea și destinația inițială.
- Optimistic locking împiedică suprascrierea unei versiuni concurente.
- Regulile de securitate nu permit rutarea documentelor personale către FTP.

### Upload, recuperare și integritate

- Uploadurile mici folosesc sesiuni durabile și un singur transfer binar.
- Fișierele mari folosesc multipart S3; părțile confirmate pot fi reluate după refresh
  sau restart fără retransmiterea celor acceptate.
- Clientul declară SHA-256, backend-ul verifică datele stocate, iar download-ul
  reverifică plaintext-ul înainte de livrare.
- Browserul verifică din nou SHA-256 după download.
- La nepotrivire, fișierul devine `CORRUPTED`, livrarea este blocată și evenimentul
  este auditat.
- Fișierul devine `AVAILABLE` numai după confirmarea stocării și integrității.

### Citiri de contoare și idempotency

- Fiecare citire are `readingId`, `meterId` și `sequenceNumber` stabile.
- PostgreSQL impune unicitatea ID-ului și a perechii contor/secvență.
- Repetarea aceluiași payload returnează rezultatul existent ca duplicat; aceeași
  identitate cu alte date este respinsă cu `409 Conflict`.
- Simulatorul păstrează în SQLite payload-urile neconfirmate și le retrimite cu aceiași
  bytes și aceeași secvență după revenirea serviciului.
- Rata de bază și numărul de contoare sunt configurabile; UI oferă control Demo 1×–10×.

### Avarii, dispecerat și ML

- Incidentele păstrează zonă, tip, severitate, coordonate, proprietar și atașament.
- Dispeceratul afișează incidentele pe harta României; distribuirea markerelor este
  limitată în poligonul țării chiar și pentru zone aglomerate.
- Rapoartele apropiate pot forma grupuri operaționale cu stare și istoric. Gruparea este
  o corelare statistică, nu dovada unei cauze fizice comune.
- Workerul privat rulează **Random Forest** pentru impact/severitate și **DBSCAN**
  pentru corelare spațio-temporală.
- Un Decision Agent determinist combină rezultatele, explică decizia și aplică o regulă
  de siguranță pentru cazurile critice.
- ML este asincron: fișierul și incidentul rămân disponibile dacă workerul ML este oprit.
  Modelele și datele sunt demonstrative, nu validate pentru producție.

### Statistici, urmărire și Demo

- Sunt agregate p50, p95, p99, throughput, operații/secundă și rata de eroare pe
  categorie, storage și tip de operație.
- Fiecare cerere primește `X-Correlation-ID`, păstrat în loguri, audit și metadatele
  operației pentru urmărirea traseului până la storage.
- Dashboardul prezintă volume, storage ales, zone, severități și scenarii sintetice
  Normal/Furtună.
- Reset Demo șterge numai resursele înregistrate ca Demo.
- Există un feed persistent de semnale de risc, inclusiv semnal la erori operaționale și
  un test sintetic. Nu există încă livrare email/SMS/webhook sau reguli complete pentru
  toate garanțiile business din PDF.
- Proba izolată de corupere creează propriul fixture, detectează hash-ul greșit și îl
  restaurează din copia de test. Nu reprezintă backup general pentru toate fișierele.

## 4. Securitate și controlul accesului

Traficul extern folosește HTTPS prin Nginx. Certificatul local este self-signed, potrivit
pentru demo. API-ul folosește HTTP Basic stateless, exclusiv peste HTTPS, și autorizare
pe rol plus proprietarul resursei.

| Cont local | Rol | Acces principal |
|---|---|---|
| `admin` | ADMIN | Administrare completă, politici și toate resursele |
| `dispatcher` | DISPATCHER | Incidente/drone, contoare și intervenții; nu documentele private ale clienților |
| `connection`, `connection2` | CONNECTION_AGENT | Fiecare vede numai propriile documente de racordare |
| `field` | FIELD_OPERATOR | Creează și vede propriile incidente și fișiere operaționale |
| `meter` | METER_INGEST | Cont tehnic pentru trimiterea citirilor |

Conturile și parolele sunt generate în `.runtime/accounts.txt`, ignorat de Git. La pornire,
Spring Security transformă parolele în hash-uri BCrypt în memorie. Cheile, parolele și
certificatele runtime nu sunt urmărite de Git.

### Protecția documentelor personale

Documentele de racordare sunt criptate înainte de MinIO cu **AES-256-GCM**:

1. aplicația verifică SHA-256 al documentului original;
2. generează un nonce aleator unic de 12 bytes;
3. criptează cu o cheie de 256 biți ținută în `.runtime`;
4. stochează ciphertext-ul sub o cheie UUID, fără numele clientului;
5. la download verifică rolul și proprietarul înainte să citească storage-ul;
6. decriptează în flux și verifică din nou SHA-256.

GCM autentifică și conținutul: modificarea ciphertext-ului este detectată. Accesul direct
la MinIO nu expune plaintext-ul fără cheia AES. Limitarea curentă este folosirea unei
singure chei locale persistente, fără KMS sau rotație automată.

## 5. Acoperirea cerințelor PDF

### Cerințe funcționale minime

| Cerință | Stare | Dovadă |
|---|---|---|
| Toate cele 4 categorii | **Verificat** | UI + simulator + smoke Compose |
| FTP, S3 și DB ca servicii separate | **Verificat** | Ruta din UI și containerele Compose |
| Politici fără schimbarea codului | **Verificat** | Editor ADMIN, versiune nouă fără restart |
| Fișier recuperat identic | **Verificat** | SHA-256 backend și client |
| Pornire cu o singură comandă | **Verificat local** | `./scripts/start.sh` |
| UI upload, căutare și download | **Verificat** | paginile Angular |
| Simulator continuu configurabil | **Verificat** | serviciu separat, jurnal durabil, Normal/Furtună |
| Cod/configurații/scripturi în Git | **Implementat** | livrarea finală depinde de push-ul commitului |

### Cerințe nefuncționale

| Cerință | Stare reală | Observație |
|---|---|---|
| Vârf 10× fără degradarea celorlalte categorii | **Netestat complet** | Controlul și metricile există; lipsește campania cu praguri p95/erori |
| Scalare prin instanțe suplimentare | **Netestat** | API stateless; două replici și load balancing nu au fost măsurate |
| Fișiere peste 1 GB | **Verificat nativ** | 1229 MiB, 154 părți, heap 512 MiB; nerepetat recent în Compose |
| Percentile, throughput și erori | **Implementat** | Per categorie/storage/operație |
| Urmărire până la storage | **Parțial** | Correlation ID și audit; fără tracing distribuit per hop |
| Alertare automată business | **Parțial** | Feed persistent și semnal pe erori; fără livrare externă/acoperire completă |
| Storage inaccesibil direct | **Implementat/verificat local** | Numai gateway-ul publică port |
| HTTPS, autentificare, protecția PII | **Verificat în domeniul testat** | TLS local, roluri, bucket privat, AES-GCM |
| Fără secrete în Git | **Verificat local** | Bootstrap în `.runtime` și scanare locală |
| Căderea unui storage | **Parțial** | FTP suspendat: DB/S3 au continuat; fără HA PostgreSQL/campanie completă |
| Rețea lentă și pierderi | **Parțial** | Multipart/retry există; testul 200 ms + 2% nu a fost executat |
| Retry contoare fără duplicate | **Verificat** | Replay identic și conflict la payload schimbat |
| Detectarea fișierului corupt | **Verificat** | SHA-256 blochează recuperarea și marchează `CORRUPTED` |

## 6. Rulare și demonstrație rapidă

```bash
./scripts/start.sh
```

Aplicația implicită: `https://localhost:8443`. Credentialele locale se citesc din
`.runtime/accounts.txt`; nu se copiază în documentație sau Git.

Ordinea recomandată pentru o demonstrație scurtă:

1. autentificare ca `admin` și dashboard;
2. upload/download pentru avarie, racordare și dronă, cu SHA-256;
3. citiri automate și retry fără duplicate;
4. schimbarea live a unei politici FTP/S3;
5. acces refuzat între `connection` și `connection2`;
6. hartă, grupuri și rezultate ML asincrone;
7. metrici p50/p95/p99 și correlation ID;
8. proba sintetică de corupere/recuperare, explicând limita ei.

## 7. Structura codului

| Director/fișier | Responsabilitate |
|---|---|
| `backend/` | API, politici, storage, securitate, integritate, audit, Demo |
| `frontend/` | aplicația Angular și verificarea downloadului |
| `meter-simulator/` | generator continuu, identități stabile, jurnal SQLite |
| `ml-service/` | Random Forest, DBSCAN și Decision Agent |
| `config/` | configurații inițiale și politici default |
| `contracts/openapi.yaml` | contractul API comun frontend/backend |
| `infra/`, `docker-compose.yml` | servicii, rețele private, volume, health checks |
| `scripts/` | bootstrap, pornire, smoke, fault și large-file tests |
| `docs/` | arhitectură, validări, cerințe și limitări |

## 8. Limite care trebuie declarate corect

- PostgreSQL este o dependență comună și nu are HA/restore demonstrat.
- Conturile sunt locale; nu există SSO, MFA sau administrare de identități în DB.
- FTP este necriptat, permis numai intern și pentru date legacy nesensibile.
- Volumele Docker protejează la restart, nu la pierderea calculatorului.
- Nu sunt închise campaniile 10×, două instanțe și rețea 200 ms/2% loss.
- Alertarea externă, tracing-ul distribuit și rotația cheilor rămân lucrări de producție.
- Rezultatele ML și scenariile Normal/Furtună sunt sintetice și nu demonstrează o
  cauză fizică ori performanța unei zile reale.

Pentru probele și comenzile executate: [`VALIDATION.md`](VALIDATION.md). Pentru
trasabilitatea fiecărei cerințe: [`PDF_REQUIREMENTS_REVIEW.md`](PDF_REQUIREMENTS_REVIEW.md).
