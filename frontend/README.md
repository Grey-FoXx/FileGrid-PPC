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
FILEGRID_BASE_URL=https://localhost:8443 FILEGRID_LIVE=1 npm test -- e2e/live.spec.ts
```

Acesta creează exclusiv documente și incidente fictive în baza locală.

La verificarea Compose din această sesiune, serviciile au pornit și smoke-test-ul a trecut, dar `scripts/start.sh` a raportat timeout la readiness: în gateway, `localhost` se rezolvă la `::1`, iar Nginx ascultă IPv4. Verificarea pe `https://127.0.0.1:8443/` reușește. Dacă întâlnești același timeout, verifică `docker compose ps` și adresa din browser înainte de a concluziona că stack-ul nu a pornit. Corecția scriptului/configurației este în ownership backend și nu a fost inclusă aici.

## Traseu de verificare vizuală

1. `admin` / `dispatcher`: vezi ratele B/s, operații/s, percentilele și zonele. Datele lipsă sunt diferențiate de erori/loading.
2. Încarcă un document fictiv, caută-l după nume/stare și deschide detaliile. Descarcă-l: rezultatul este confirmat doar după verificarea dimensiunii și SHA-256.
3. Încarcă un videoclip, pune pauză, reîncarcă pagina, restaurează transferul salvat și selectează fișierul original. Contextul este păstrat, părțile confirmate sunt reutilizate. Anularea serverului este distinctă de ștergerea referințelor locale.
4. În dispecerat, observă separat fișierele AVAILABLE și ML PENDING/RUNNING/FAILED/COMPLETED. Inspectează contribuțiile celor două modele, versiunile și recomandarea Decision Agent-ului.
5. `field`: fișiere/avarii proprii, fără metrici sau citiri administrative. `connection`: documente proprii; nu are formular sau navigare de avarii. Autorizarea efectivă rămâne pe server.
6. Folosește numai tastatura: Tab pentru „Sari la conținut”, navigare, formulare, detalii (Escape închide și întoarce focusul), progres și anulare.
7. În DevTools verifică 320/390/768/1440 px și zoom 200%. Tabelele au scroll local și acces din tastatură.

## Limite explicite

- Normal/Storm este calculat de server. Compararea din UI folosește două instantanee măsurate în sesiunea curentă; ferestrele pot fi suprapuse. Nu există API de istoric pe zile sau de alerte business.
- Cluster ID este local analizei. Nu este folosit pentru a uni global incidente sau pentru a afirma cauze comune. Modelele existente sunt sintetice.
- Filtrele dispeceratului și ordonarea se aplică paginii afișate; paginarea este pe server. Filtrul de contor folosește `meterId` din contract.
- Peste 128 MiB, download-ul necesită File System Access (Chrome/Edge). În celelalte browsere, limita este afișată înainte de transfer; nu se încearcă bufferizarea unui fișier mare.
- Referințele de upload sunt locale browserului. După reload trebuie reselectate bytes-urile originale. Întreruperea din browser nu anulează retroactiv o cerere deja acceptată de server.
