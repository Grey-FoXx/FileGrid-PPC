# Audit cerințe PDF — 2026-11-15

Acest document descrie starea ramurii `feature/demo-command-center`, nu intenția din alte ramuri. Legendă:

- **UI acum** — poate fi demonstrat direct în aplicație;
- **UI posibil** — un ecran/control de demonstrație ar putea fi adăugat, dar nu este implementat în această etapă;
- **Harness/infra** — testul corect se face din exteriorul aplicației; UI poate cel mult afișa rezultatul;
- **Documentație** — proprietate de repository/arhitectură care se inspectează, nu un comportament UI.

## Cerințe funcționale minime

| ID | Cerință PDF | Tratare curentă și dovadă | Unde se testează | Stare |
|---|---|---|---|---|
| F01 | Stocare și recuperare pentru toate cele patru categorii | Contoarele păstrează payload-ul original în PostgreSQL; avariile folosesc FTP/S3; documentele private și dronele folosesc S3. Smoke Compose a recuperat aceiași octeți pentru toate. | **UI acum** pentru cele trei categorii manuale; simulator/API pentru contoare | VERIFICAT |
| F02 | FTP, S3 și DB folosite efectiv ca servicii separate | PostgreSQL, MinIO și FTP sunt containere distincte, pe rețeaua privată; smoke-ul a obținut DATABASE, FTP și S3. | **UI acum** arată storage-ul ales; separarea este **Harness/infra** (`docker compose ps`) | VERIFICAT |
| F03 | Politici configurabile fără modificare de cod | Configurația activă este versionată în PostgreSQL. ADMIN o modifică prin API/UI, cu validare și optimistic locking; sesiunile noi folosesc imediat noua versiune, cele existente își păstrează decizia. YAML-ul este doar bootstrap/default reset. | **UI acum**, secțiunea „Politici de stocare”; test browser și test API live | VERIFICAT |
| F04 | Fișier recuperat identic și demonstrabil | SHA-256 este declarat, verificat la finalizare și din nou la recuperare; clientul verifică download-ul. | **UI acum** afișează verificarea; smoke compară octeți și digest | VERIFICAT |
| F05 | Pornire pe mașină curată cu o singură comandă | `./scripts/start.sh` generează secrete/certificat local, construiește și pornește stack-ul, apoi verifică gateway + API. Pornirea izolată din 2026-11-15 a trecut. | **Harness/infra**; nu este adecvat un buton în aplicație | VERIFICAT PE ACEASTĂ MAȘINĂ |
| F06 | UI de upload, căutare și download | Fluxuri Angular cu roluri, progres, reluare multipart, căutare/paginare, detalii și download verificat. | **UI acum** | VERIFICAT |
| F07 | Simulator continuu, volum normal și vârf configurabil | Container separat cu ID-uri/sequence stabile, jurnal SQLite și rată/număr de contoare configurabile; modurile demo Normal/Furtună generează date sintetice explicite. | **UI acum** arată efectul; volumul real se setează prin Compose și se verifică prin **Harness/infra**. **UI posibil:** formular administrativ pentru rată/scenarii | PARȚIAL VERIFICAT |
| F08 | Tot codul în Git înainte de termen | Codul, configurațiile și scripturile sunt urmărite; secretele și artefactele runtime sunt ignorate. Publicarea se confirmă numai după push și verificarea SHA remote. | **Documentație/Git** | DE CONFIRMAT DUPĂ PUSH |

## Cerințe nefuncționale

| ID | Cerință PDF | Tratare curentă și limită exactă | Unde se testează | Stare |
|---|---|---|---|---|
| N01 | Vârf 10× într-o categorie fără degradarea celorlalte | Există generator de load și metrici, dar ramura curentă nu are bulkhead/admission control și nu are o campanie 10× în Compose cu pragurile p95 ≤ +20% și erori < +1 pp. | **Harness/infra**. **UI posibil:** lansare controlată și comparație baseline/storm, fără a înlocui măsurarea externă | NEÎNDEPLINIT/NETESTAT |
| N02 | Capacitate prin instanțe suplimentare, fără cod | API-ul este stateless pentru autentificare și păstrează sesiuni/politici în DB, însă Compose rulează o instanță și nu există rezultat cu două replici/load balancing. | **Harness/infra**; UI ar putea doar afișa replicile/throughput-ul | NETESTAT |
| N03 | Fișiere >1 GB cu resurse neproporționale | Multipart și streaming sunt implementate. O probă nativă istorică de 1229 MiB a trecut cu heap 512 MiB; nu a fost repetată acum în Compose din cauza spațiului local insuficient. | **Harness/infra**; upload UI poate demonstra reluarea, nu limita de memorie | VERIFICAT NATIV, NU REVALIDAT COMPOSE |
| N04 | p50/p95/p99, throughput și erori per categorie/storage | `operations` și `/stats/technical` agregă percentile/rate pe categorie, storage și operație; tabelele sunt vizibile în Acasă/Fișiere. Combinațiile fără trafic sunt marcate nemăsurate. | **UI acum** | IMPLEMENTAT |
| N05 | Urmărirea unei operații până la storage | Correlation ID este propagat, păstrat în fișier/audit/operații și logat; UI arată traseul și identificatorul cunoscut. Nu există încă distributed tracing cu timpi pentru fiecare hop. | **UI acum** parțial; traseul complet se verifică în loguri. **UI posibil:** timeline backend per etapă | PARȚIAL |
| N06 | Alertare automată când garanțiile business sunt în pericol | UI afișează avertismente derivate din datele încărcate, dar ramura curentă nu are reguli backend persistente și nici livrare Alertmanager/email/webhook. | **UI posibil:** inbox/stare alerte și butoane de test; declanșarea/livrarea reală este **Harness/infra** | NEIMPLEMENTAT |
| N07 | Storage inaccesibil direct din exterior | Numai gateway-ul publică port; rețeaua `data` este internă, storage-urile nu au `ports`. | **Harness/infra** (inspect/port scan), apoi se menționează în demo | IMPLEMENTAT |
| N08 | Trafic extern criptat și acces autentificat | Nginx expune HTTPS cu certificat local; API folosește Basic Auth și roluri. | **UI acum** pentru login/roluri; TLS și acces anonim prin **Harness/infra** | IMPLEMENTAT |
| N09 | Acces direct neautorizat nu expune PII | Documentele de racordare sunt AES-GCM înainte de S3, cheia rămâne în runtime, bucket-ul nu este public, iar alt proprietar primește 403. | **UI acum** pentru controlul proprietarului; ciphertext/bucket privat prin **Harness/infra** | VERIFICAT ÎN DOMENIUL TESTAT |
| N10 | Nicio parolă/cheie în repository | Bootstrap generează secrete în `.runtime`, ignorat de Git; necesită scanare înainte de fiecare livrare. | **Documentație/Git/harness** | VERIFICAT LOCAL |
| N11 | Căderea unui storage nu oprește celelalte și nu pierde confirmări | Adaptoarele sunt separate, iar testul nativ istoric a arătat DB/S3 active cu FTP suspendat. Nu există probă Compose curentă pentru fiecare storage, HA PostgreSQL sau restore. | **Harness/infra**. **UI posibil:** panou de sănătate și scenarii de avarie sigure | PARȚIAL |
| N12 | Latență/pierderi: finalizare sau reluare fără intervenție | Sesiunile multipart, părțile confirmate și reluarea după refresh/restart sunt implementate. Campania cerută la 200 ms/2% loss nu a fost executată pe această ramură. | **UI acum** pentru pause/reload/resume; pierderea de rețea este **Harness/infra** | PARȚIAL |
| N13 | Retry fără dublarea citirilor | `reading_id` și identitatea meter/sequence sunt unice; replay identic răspunde `duplicate`, payload diferit primește 409; jurnalul simulatorului păstrează bytes/sequence. | API/simulator și statistici; **UI posibil:** control de replay demonstrativ | VERIFICAT |
| N14 | Fișier corupt detectat la recuperare | SHA-256 este reverificat înainte de livrare și statusul devine `CORRUPTED`; mutația intenționată a storage-ului a trecut în testul nativ istoric. | **Harness/infra**. **UI posibil:** scenariu administrativ sigur pe fixture sintetic | VERIFICAT NATIV |

## Statistici și interpretare

| ID | Întrebare PDF | Tratare curentă | Unde se testează | Stare |
|---|---|---|---|---|
| B01 | Ce storage se potrivește și de ce? | Politicile, versiunea și motivul rutării sunt vizibile; DB pentru citiri/idempotency, S3 pentru obiecte private/mari, FTP pentru integrarea legacy nesensibilă. | **UI acum** | IMPLEMENTAT |
| B02 | Vârf versus zi normală | UI poate captura/compara ferestre observate Normal/Furtună, dar acestea nu sunt încă benchmark-uri istorice sau campania 10×. | **UI acum** ca demonstrație sintetică; **UI posibil** pentru istoric server-side; benchmark prin **Harness/infra** | PARȚIAL |
| B03 | Tipare/anomalii în datele rețelei | Hartă, zone, severitate, grupuri de intervenție, rezultate separate ale celor două modele și Decision Agent. Datele demo sunt etichetate sintetice. | **UI acum** | IMPLEMENTAT PENTRU DEMO |

## Concluzie de eligibilitate

Minimul funcțional F01–F06 este demonstrabil end-to-end în Compose; F07 este configurabil și funcțional, iar F08 depinde de confirmarea push-ului. Cerințele nefuncționale nu sunt toate închise: N01, N02 și N06 sunt lacune explicite; N05, N11 și N12 sunt parțiale. Acestea nu trebuie prezentate juriului ca verificate doar pe baza ecranelor existente.
