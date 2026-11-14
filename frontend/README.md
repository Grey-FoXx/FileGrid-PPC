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

- **Politici (ADMIN):** selectează categoria → „O nouă politică”. Confirmarea descarcă `storage-policies.yaml` în format JSON compatibil YAML, cu regula introdusă înaintea regulilor categoriei și versiune nouă. Nu modifică serverul. Înlocuiește manual `config/storage-policies.yaml`, apoi rulează `docker compose restart api`. Restabilirea descarcă exact configurația activă citită din API; aplicarea ei este tot manuală. Păstrează o copie proprie înainte de înlocuirea configurației. UI nu poate dezactiva constrângerile de securitate backend.
- **Avarii:** un singur flux pentru metadate și fișier opțional. „Raportează avaria” creează raportul, apoi încarcă fișierul dacă există. La eroare de transfer, incidentul deja confirmat rămâne selectat. Pentru alt raport alege din nou opțiunea de creare din „Incident asociat”.
- **Dispecerat:** contur geografic România (Natural Earth 1:50m, domeniu public), evidențieri regionale orientative, coordonate API și grupări vizuale de maximum 8 km / 30 minute pentru același tip de eveniment. Aceste grupări nu confirmă aceeași defecțiune; API-ul nu expune apartenență globală la grupuri ML. Rapoartele fără coordonate rămân în lista ordonată după prioritate. Acoperire: pagina curentă și filtrele curente. Datele se actualizează la 5 secunde, cu marcaje noi animate; reduced motion este respectat.
- **Fișiere:** metricile sunt cele din `/stats/technical`, separat pe categorie/storage/operație, cu „Not measured” când nu există serie. Traseul animat explică etapele pe baza metadatelor fișierului; nu inventează timpi interni. Pentru upload-uri efectuate în sesiunea curentă afișează cererile reale, duratele observate în browser și X-Correlation-ID pentru corelare în loguri. Se păstrează cel mult 32 de cereri în memorie, șterse la logout.
- **Acasă:** Normal/Storm schimbă scenariul explicativ local; nu generează trafic și nu modifică statisticile sau modul serverului. Pentru un Storm real se poate folosi comanda existentă `python3 scripts/demo-data.py --count 22` (creează date sintetice persistente în API). Avertizările vizibile sunt locale browserului, bazate pe erorile API disponibile; notificarea automată a echipei în afara browserului nu este validată.

**Cerință eliminatorie încă nevalidată:** pornirea pe o mașină curată cu o singură comandă. Refolosirea stack-ului local și reconstruirea gateway-ului nu reprezintă acest test. Problema readiness IPv6/IPv4 din scriptul existent rămâne de coordonat cu backend-ul.
