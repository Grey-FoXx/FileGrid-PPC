# FileGrid frontend

Angular existent, cu același client `/api/v1`. Nu necesită servicii frontend suplimentare.

## Verificare locală

Node compatibil cu lockfile-ul: `^22.22.3`, `^24.15.0` sau `>=26`.

```bash
cd frontend
npm ci
npx playwright install chromium
npm run build
npm test
```

Playwright folosește `CHROME_BIN`, Google Chrome local dacă există, sau Chromium instalat de Playwright. Testele cu fixtures nu necesită backend. Testul live este omis implicit.

## Testare manuală cu servicii reale

Din rădăcina repository-ului, pornește stack-ul conform README-ului principal:

```bash
./scripts/start.sh
```

Deschide **https://localhost:8443**, acceptă certificatul local și folosește conturile din `.runtime/accounts.txt`. Nu publica acest fișier. După modificări frontend, actualizează imaginea:

```bash
docker compose up --build -d gateway
```

Pentru development cu API nativ la `localhost:8080`: `npm start`, apoi http://localhost:4200. Proxy-ul implicit nu expune storage-urile.

Test browser live pe stack-ul Compose (din frontend/):

```bash
FILEGRID_BASE_URL=https://localhost:8443 FILEGRID_LIVE=1 FILEGRID_COMPOSE_LIVE=1 npm test -- e2e/live.spec.ts e2e/live-acceptance.spec.ts
```

Aceste teste creează exclusiv documente și incidente fictive în baza locală. Testul de independență ML suspendă temporar worker-ul local și îl repornește în `finally`; sunt necesare Docker și stack-ul Compose local. Pentru acceptanța completă, elimină lista de fișiere de la finalul comenzii: aceeași suită verifică și build-ul servit cu fixtures API.

La verificarea Compose din această sesiune, serviciile au pornit și smoke-test-ul a trecut, dar `scripts/start.sh` a raportat timeout la readiness: în gateway, `localhost` se rezolvă la `::1`, iar Nginx ascultă IPv4. Verificarea pe `https://127.0.0.1:8443/` reușește. Dacă întâlnești același timeout, verifică `docker compose ps` și adresa din browser înainte de a concluziona că stack-ul nu a pornit. Corecția scriptului/configurației este în ownership backend și nu a fost inclusă aici.

## Traseu de verificare vizuală

1. `admin` / `dispatcher`: vezi ratele B/s, operații/s, percentilele și zonele. Datele lipsă sunt diferențiate de erori/loading.
2. Încarcă un document fictiv, caută-l după nume/stare și deschide detaliile. Descarcă-l: rezultatul este confirmat doar după verificarea dimensiunii și SHA-256.
3. Încarcă un videoclip, pune pauză, reîncarcă pagina, restaurează transferul salvat și selectează fișierul original. Contextul este păstrat, părțile confirmate sunt reutilizate. Anularea serverului este distinctă de ștergerea referințelor locale.
4. În dispecerat, observă separat fișierele AVAILABLE și ML PENDING/RUNNING/FAILED/COMPLETED. Inspectează contribuțiile celor două modele, versiunile și recomandarea Decision Agent-ului.
5. `field`: fișiere/avarii proprii, fără metrici sau citiri administrative. `connection`: documente proprii; nu are formular sau navigare de avarii. Autorizarea efectivă rămâne pe server.
6. Folosește numai tastatura: Tab pentru „Sari la conținut”, navigare, formulare, detalii (Escape închide și întoarce focusul), progres și anulare.
7. În DevTools verifică 320/390/768/1440 px și zoom 200%. Tabelele au scroll local și acces din tastatură.

Pentru un exemplu Storm Mode cu date reale sintetice, din rădăcina repository-ului:

```bash
python3 scripts/demo-data.py --count 22
```

Modul se calculează pe fereastra ultimelor 5 minute; ulterior poate reveni automat la Normal. Referințele de upload rămân locale browserului, iar datele generate pentru demo rămân în volumele locale.

## Organizarea frontend-ului

- `src/app/app.ts` și `app.html`: un singur shell, autentificare și navigare.
- `src/app/workspace.ts`: state comun, roluri, refresh, paginare și interpretarea metricilor.
- `src/app/pages/`: șase pagini standalone care folosesc aceeași instanță de state.
- `src/app/upload.ts`: worker, idempotency, sesiuni, retry, pauză/reluare/anulare.
- `src/app/download.ts`: streaming, progres, anulare și verificarea bytes/SHA-256.
- `src/app/api.ts`: singurul client HTTP, cu credențiale exclusiv în memorie.
- `src/app/section-state.ts`: stări comune de loading/error/stale/retry.

## Limite explicite

- Normal/Storm este calculat de server. Compararea din UI folosește două instantanee măsurate în sesiunea curentă; ferestrele pot fi suprapuse. Nu există API de istoric pe zile sau de alerte business.
- Cluster ID este local analizei. Nu este folosit pentru a uni global incidente sau pentru a afirma cauze comune. Modelele existente sunt sintetice.
- Filtrele dispeceratului și ordonarea se aplică paginii afișate; paginarea este pe server. Filtrul de contor folosește `meterId` din contract.
- Peste 128 MiB, download-ul necesită File System Access (Chrome/Edge). În celelalte browsere, limita este afișată înainte de transfer; nu se încearcă bufferizarea unui fișier mare.
- Referințele de upload sunt locale browserului. După reload trebuie reselectate bytes-urile originale. Întreruperea din browser nu anulează retroactiv o cerere deja acceptată de server.

## Interfața PPC cu șase secțiuni

Navigarea păstrează Acasă, Încarcă fișiere, Fișiere, Dispecerat, Citiri contoare și Politici de stocare. Logo-ul PPC furnizat este servit local; harta nu necesită servicii externe sau chei.

- **Politici (ADMIN):** selectează categoria și regula → „Aplică politica”. API-ul validează constrângerile și salvează în PostgreSQL o versiune nouă, folosită imediat pentru noile sesiuni. Fără download, comenzi Docker sau restart. Fișierele și sesiunile deja create își păstrează storage-ul/versiunea. Revenirea la politica inițială se aplică live, tuturor categoriilor, cu versiune nouă. `config/storage-policies.yaml` rămâne configurația de bootstrap/reset; după inițializare, sursa activă este baza de date. Modificările sunt globale pentru Demo și Toate datele. Conflictele de versiune cer reîncărcarea explicită a politicii, păstrând formularul nesalvat.
- **Avarii:** un singur flux pentru metadate și fișier opțional. „Raportează avaria” creează raportul, apoi încarcă fișierul dacă există. La eroare de transfer, incidentul deja confirmat rămâne selectat. Pentru alt raport alege din nou opțiunea de creare din „Incident asociat”.
- **Dispecerat:** contur geografic România și trei evidențieri regionale orientative. Grupurile reale și statusurile provin din backend. Marcajele sunt separate local, cu linii spre coordonatele reale, iar aglomerarea se afișează ca agregare vizuală în interiorul țării. Click pe o agregare → selectează intervenția; acțiunile rămân per grup backend, nu pe toate intervențiile agregate. Rapoartele nou afișate au o animație de reunire în grupul lor; reduced motion este respectat. GPS-urile și gruparea ML nu sunt rescrise de layout.
- **Fișiere:** metricile sunt cele din `/stats/technical`, separat pe categorie/storage/operație, cu „Not measured” când nu există serie. Traseul animat explică etapele pe baza metadatelor fișierului; nu inventează timpi interni. Pentru upload-uri efectuate în sesiunea curentă afișează cererile reale, duratele observate în browser și X-Correlation-ID pentru corelare în loguri. Se păstrează cel mult 32 de cereri în memorie, șterse la logout.
- **Acasă:** Normal/Storm schimbă scenariul explicativ local; nu generează trafic și nu modifică statisticile sau modul serverului. Pentru un Storm real se poate folosi comanda existentă `python3 scripts/demo-data.py --count 22` (creează date sintetice persistente în API). Avertizările vizibile sunt locale browserului, bazate pe erorile API disponibile; notificarea automată a echipei în afara browserului nu este validată.

**Cerință eliminatorie încă nevalidată:** pornirea pe o mașină curată cu o singură comandă. Refolosirea stack-ului local și reconstruirea gateway-ului nu reprezintă acest test. Problema readiness IPv6/IPv4 din scriptul existent rămâne de coordonat cu backend-ul.

## Demo cu date persistente și intervenții

Versiunea actuală extinde API-ul pentru scenariul cerut, fără a schimba routing-ul sau garanțiile de integritate. Demo este disponibil permanent, fără flag în `.env`. După `git pull`, rulează `./scripts/start.sh` pentru a reconstrui serviciile și autentifică-te ca ADMIN. Prima autentificare inițializează setul o singură dată; reload-ul nu îl multiplică.

- Set inițial: 6 rapoarte în Dobrogea/Muntenia/Banat, 4 citiri, 13 fișiere distribuite între Database, S3 și FTP; include documente criptate și fișiere binare sintetice în categoria dronă de 256 KiB, 9 MiB și 17 MiB, ultimele având mai multe părți reale. Acestea testează transferul; nu sunt clipuri video redabile sau un benchmark pentru fișiere >1 GB.
- **Normal/Storm** schimbă starea reală a generatorului backend. Storm produce progresiv rapoarte și atașamente, cu plafon de 40 de incidente demo. Normal oprește rafala Storm, dar păstrează contoarele continue și loturile mixte periodice; nu șterge rapoartele deja produse. Harta se actualizează la o secundă în Storm și la cinci secunde în mod obișnuit.
- **Reset demo**, dreapta sus, șterge exclusiv resursele înregistrate în setul demo și generează din nou setul inițial. Datele create anterior rămân intacte. Navigarea între Demo și Toate datele schimbă explicit scope-ul; setul demo este sintetic, dar este stocat și procesat efectiv de backend.
- Avariile au trei statusuri persistente, distincte de fișiere și ML: **Nouă → Echipaj trimis → Rezolvată**. Dispecerul/adminul acționează asupra întregului grup. Rapoartele noi compatibile se pot alătura grupurilor încă deschise; grupurile rezolvate nu se redeschid automat. Harta ascunde grupurile rezolvate; istoricul poate fi afișat separat.
- Gruparea provizorie din metadate este completată asincron de Modelul 2 (DBSCAN), care transmite acum identificatorii membrilor; backend-ul păstrează un UUID stabil pentru intervenție și validează compatibilitatea/scopul înaintea unirii. Etichetele numerice locale nu mai sunt utilizate drept identitate globală. Modelele sunt în continuare sintetice, iar proximitatea nu dovedește cauza fizică a defecțiunii. Nu există LLM introdus în acest flux.
- „+” lângă Incident asociat începe un raport nou; raportarea fără fișier rămâne permisă. Traseul fișierului este primul panou din Fișiere și citește categoria selectată direct din API, independent de filtrul/pagina catalogului. Fișierele vechi nu sunt marcate artificial drept nemăsurate doar fiindcă sunt în altă pagină.

Containerul `meter-simulator` rulează continuu, cu jurnale separate pentru fluxul obișnuit și Demo. Bara globală 1×–10× schimbă multiplicatorul real al ratei `SIMULATOR_RATE` fără restart (poll de control la aproximativ 2 secunde). În afara scope-ului demo, API-ul păstrează comportamentul original și oferă toate datele autorizate.

## Verificarea cerințelor PDF

Vezi [auditul complet actual](AUDIT_PDF.md), cu verificări reale, limite și controale de testare propuse (neimplementate). Pornirea pe mașină curată cu o singură comandă are încă un blocaj de readiness și nu este marcată ca validată.

## Demonstrație continuă și probe — 2026-11-15

- Bara de volum este sus, în toate tab-urile ADMIN/DISPATCHER; numai ADMIN o modifică. Este comună tuturor calculatoarelor conectate la același API. Contoarele din Demo continuă și în Normal. „Toate datele” include și Demo, nu este un filtru exclusiv de producție.
- Generatorul backend adaugă în Demo câte un raport cu atașament, un document criptat și un obiect de inspecție la circa 45 secunde / multiplicator (tick la 5 secunde), când serviciile sunt disponibile. Sunt fixtures sintetice compacte, nu videoclipuri reprezentative de >1 GB; upload-ul manual rămâne conform PDF-ului. La 2000 de fișiere demo se oprește lotul mixt până la Reset. Contoarele continuă.
- Acasă → **Simulează notificare de risc**: mesaj sintetic persistent, vizibil și altor administratori/dispeceri. Erorile reale de operații din ultimul minut produc un semnal server automat, limitat la unul/minut. Acestea sunt notificări în aplicație; nu email/SMS/webhook și nu monitorizarea tuturor garanțiilor business.
- Acasă → **Testează corupere și recuperare automată**: creează propriul fixture S3, păstrează bytes originali în Database și injectează coruperea. Worker-ul detectează SHA-256 diferit, blochează conținutul și restaurează automat copia verificată. Sunt afișate etapele INJECTED → DETECTED → RECOVERED; Fișiere permite download-ul verificat după recuperare. Nu acceptă un fișier existent ca țintă și nu pretinde redundanță pentru toate upload-urile.
- Reset păstrează datele din afara Demo, restaurează volumul 1× și curăță probele/mesajele demo. Citirile noi reîncep apoi automat.

Vezi [scenariul de prezentare și limitele probelor](../docs/DEMO_PRESENTATION.md) pentru >1 GB, securitate și căderea unui storage.
