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

## Command Center — demonstrație de 5 minute

Branch: `feature/demo-command-center`, bazat pe `feature/frontend-improvements`. Cele patru zone principale sunt Command Center, Data Ingestion, Storage Decision Lab și System Health; instrumentele existente rămân disponibile în bara de acces rapid, conform rolului.

1. **0:00–1:00:** de pe autentificare, „Deschide Demo simulation” funcționează fără API. Selectează Normal → Storm → Recovery. Numerele sunt numărări ale fixtures-urilor statice, nu telemetrie sau benchmark-uri. Pentru integrarea reală, autentifică-te și selectează Live.
2. **1:00–2:00:** filtrează Muntenia/Banat/Dobrogea, mărește harta și selectează un marker sau o grupare. Harta este schematică; gruparea vizuală prin proximitate nu este clusterul ML și nu demonstrează cauze comune. În Live sunt afișate numai incidentele paginii API curente, cu coordonate disponibile. Cele fără coordonate utilizabile rămân în listă.
3. **2:00–3:00:** arată Incident Journey: sesiune → transfer → verificare → disponibilitate. Analiza ML are un panou separat, cu Model 1, Model 2 și Decision Agent. Un fișier AVAILABLE rămâne accesibil cu ML PENDING/FAILED. Etapele nu reprezintă procente de transfer sau un istoric de timpi pe care API-ul nu îl furnizează.
4. **3:00–4:00:** în Storage Decision Lab, Explore citește politica activă/versionată din API și metricile observate. Simulate permite parametri și o țintă ipotetică, fără scrieri în API. Document racordare → FTP este respins. Pentru log legacy nesensibil, S3 și FTP pot fi permise, dar ruta rămâne prima regulă activă potrivită; simularea nu rescrie YAML-ul. Lipsa unei reguli nu produce o destinație activă inventată. Lipsa măsurătorilor este „Not measured”; zero măsurat rămâne zero.
5. **4:00–5:00:** Data Ingestion păstrează upload/reluare/download verificat. System Health afișează metricile disponibile rolului, fără a pretinde că acestea probează HA sau sănătatea fiecărui storage. Evidențiază limitările de validare.

**Configurarea reală rămâne `config/storage-policies.yaml`, cu restart API pentru aplicare. Nu există editor de politici sau ML de routing în UI.** Compararea observațiilor nu certifică superioritatea vreunui storage și nu introduce prețuri sau scoruri de performanță.

**Cerință eliminatorie încă nevalidată:** pornirea întregului sistem pe o mașină curată printr-o singură comandă. Funcționarea locală și testele browser nu închid această cerință. Problema existentă de readiness IPv6/IPv4 este descrisă mai sus; backend-ul și scripturile sale nu au fost modificate pe acest branch.

Referința video a fost folosită exclusiv pentru spacing, carduri, highlights, tranziții și milestone-uri. Nu este inclusă în build/repository și nu furnizează funcționalități sau branding FileGrid. Animațiile respectă `prefers-reduced-motion`.
