# FileGrid PPC

Prototip pentru ingestia și recuperarea verificabilă a citirilor de contoare, avariilor, documentelor private de racordare și fișierelor de inspecție cu drona.

**Spring Boot + Angular + PostgreSQL + MinIO + FTP separat.** Include simulator durabil și două modele ML sintetice, asincrone.

## Pornire

Premise: Linux, Docker Engine accesibil utilizatorului curent, Docker Compose v2.24+ (testarea configurației: v2.40.3), internet la primul build, aproximativ 16 GB RAM și 20 GB liberi. Java/Node/Python nu sunt necesare pe host pentru Compose.

```bash
./scripts/start.sh
```

Interfață: **https://localhost:8443**. Acceptă certificatul local generat pentru demonstrație. Conturile sunt generate în `.runtime/accounts.txt`. Parolele, certificatele și cheia AES nu sunt în Git. Nu șterge `.runtime/` dacă păstrezi datele: cheia este necesară decriptării documentelor. Numai gateway-ul publică un port.

Pentru o instanță de verificare izolată, fără ștergerea volumelor existente: `COMPOSE_PROJECT_NAME=filegrid-review FILEGRID_RUNTIME_DIR=.runtime/review FILEGRID_HTTPS_PORT=20443 ./scripts/start.sh`.

**Stare verificată:** build backend/frontend, teste automate și integrare nativă cu PostgreSQL 17, MinIO și FTP reale. **Pornirea completă prin Docker Compose pe o mașină curată nu a fost executată:** utilizatorul curent nu are acces la socket-ul Docker. Validarea YAML Compose nu echivalează cu validarea containerelor. Vezi [rezultatele](docs/VALIDATION.md) și [limitele](docs/LIMITATIONS.md).

## Fluxuri

- Contoare: JSON original în Database, identități unice, confirmare după commit și retry durabil al simulatorului.
- Avarii: metadate în PostgreSQL, atașamente în S3; logurile legacy declarate nesensibile merg în FTP conform politicii.
- Politicile sunt editate live de un utilizator ADMIN în secțiunea „Politici de stocare”. Salvarea este persistentă și se aplică imediat numai sesiunilor noi; nu necesită descărcarea YAML-ului sau restartul API. Fișierele/sesiunile existente păstrează versiunea și motivul inițial.
- Racordare: AES-256-GCM înainte de stocarea S3; acces per proprietar sau administrator.
- Drone: multipart de 8 MiB prin API, părți persistente, reluare după restart și SHA-256 complet.
- ML: Random Forest + DBSCAN + reguli explicabile; disponibilitatea fișierelor rămâne independentă de ML. Date sintetice, fără validare operațională.

Politicile sunt în `config/storage-policies.yaml`; aplicare prin `docker compose restart api`. Schimbările afectează sesiuni noi. Ratele simulatorului se configurează cu `SIMULATOR_RATE`, `SIMULATOR_METERS` și, pentru retransmisii, `SIMULATOR_DUPLICATE_EVERY` în mediul serviciului.

## Verificări reproductibile

Cu stack-ul pornit și Python 3.12 disponibil pe host:

```bash
python3 scripts/smoke-test.py
python3 scripts/demo-data.py --count 22
python3 scripts/large-file-test.py --size-mib 1229
```

Aceste comenzi generează exclusiv fixtures fictive. Testul mare este un test de transport, nu de validare semantică a unui codec video. Testele de încărcare și întrerupere sunt în `scripts/load-test.py` și `scripts/fault-test.sh`.

Verificări pentru dezvoltare:

```bash
(cd backend && ./mvnw verify)
(cd frontend && npm ci && npm run build && npm test)
python3 -m unittest discover -s meter-simulator/tests -v
python3 -m pip install -r ml-service/requirements.lock
python3 -m unittest discover -s ml-service/tests -v
docker compose config --quiet
```

Backend: Java 21; testele pornesc PostgreSQL 17 temporar fără Docker și trebuie rulate de un utilizator fără privilegii root. Adaptoarele externe sunt simulate în testul Java; smoke-test-ul separat verifică serviciile reale. Frontend: Node 24.15+, Chrome la `/usr/bin/google-chrome` sau `CHROME_BIN` configurat. În CI se folosește Chromium Playwright. `FILEGRID_LIVE=1 npm test` activează suplimentar testul browser cu API-ul local la portul 8080 și conturile `.runtime/`; implicit acel test este omis. Comenzile frontend se rulează din `frontend/`.

## Colaborare și checkpoint

Un singur repository: https://github.com/Grey-FoXx/FileGrid-PPC. Branch de integrare la predare: `develop`.

Citește [AGENTS.md](AGENTS.md), [raportul pentru calculatorul 2](docs/HANDOFF_SECOND_COMPUTER.md), [contractul OpenAPI](contracts/openapi.yaml), [arhitectura](docs/ARCHITECTURE.md), [modelul de date](docs/DATA_MODEL.md), [milestone-urile](docs/MILESTONES.md) și [task-urile frontend](docs/FRONTEND_TASKS.md).

Cerințele originale sunt în `docs/requirements/`. Ele sunt documente de referință; instrucțiunile de execuție ale sesiunii și regulile din AGENTS.md au prioritate pentru agenți.
