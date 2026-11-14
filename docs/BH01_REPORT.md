# BH01 — Docker și pornirea completă

Stare: **VERIFICAT**, 2026-11-14. Branch: `feature/backend-hardening`. Commitul raportului se identifică prin `git rev-parse HEAD` și este comunicat în răspunsul final. Această etapă nu implementează BH02–BH06.

## Izolare și acces

- Docker Engine 29.2.1, Compose v2.40.3, Linux x86_64.
- Utilizatorul a adăugat `but` în grupul Docker. Procesul IDE păstrează grupurile vechi; comenzile au rulat cu `sg docker`, fără modificarea permisiunilor socket-ului.
- Proiect separat: `filegrid-bh01`; runtime separat: `.runtime/bh01`; HTTPS: **https://localhost:18443**.
- Volume dedicate: `filegrid-bh01_postgres-data`, `filegrid-bh01_minio-data`, `filegrid-bh01_ftp-data`, `filegrid-bh01_prometheus-data`.
- Nu au fost șterse volume sau date existente. Nu s-au executat `down -v`, `volume rm` sau prune. Instanța folosită pentru teste și volumele sale sunt păstrate.

## Modificări

- `FILEGRID_RUNTIME_DIR` permite separarea credențialelor, cheilor, certificatului și jurnalului simulatorului între proiecte; implicit rămâne `.runtime`.
- Scriptul de pornire folosește probe HTTP live în locul unui mesaj istoric din log. Construcțiile Compose sunt serializate implicit, iar build-ul MinIO limitează paralelismul Go.
- API-ul are healthcheck HTTP; gateway-ul, simulatorul, worker-ul ML și Prometheus așteaptă API sănătos.
- FTP are healthcheck pe bannerul portului 21; gateway-ul verifică servirea HTTPS.
- Imaginea API declară explicit curl/CA pentru probele de health.
- `scripts/verify-compose.py` adaugă fazele `seed` și `recover`, fără oprire/ștergere automată de resurse.
- Nicio modificare în `frontend/`, în contractele API sau în logica de business Java/ML.

## Servicii verificate

| Serviciu | Rezultat |
|---|---|
| PostgreSQL 17.6 | Running, healthy; citiri/metadate recuperate după restart |
| MinIO, construit din commitul fixat | Running, healthy; obiecte și versiuni persistente |
| vsftpd | Running, healthy; upload și download FTP reale |
| Spring Boot API | Running, healthy; autentificare și fluxuri API funcționale |
| Nginx + Angular build | Running, healthy; HTTPS, autentificare în browser și catalog |
| meter-simulator | Running; citiri automate `MTR-1001` observate în Database |
| ml-worker | Running; rezultat cu două versiuni de modele, persistat după restart |
| Prometheus | Running; target `filegrid` UP și metrici Micrometer disponibile |
| storage-init | One-shot finalizat cu exit code 0 |
| bootstrap | One-shot reexecutat cu succes; fișierele existente au rămas identice |

Singurul port publicat este gateway HTTPS 18443. Storage-urile și Prometheus nu publică porturi pe host.

## Teste trecute

1. Pornire printr-o singură comandă, cu runtime și volume noi pentru aplicație. Build-urile backend/frontend/ML/simulator și infrastructură au fost executate în Docker; nu s-au folosit artefactele native de la checkpoint.
2. HTTPS verificat cu certificatul generat ca trust anchor și verificare de hostname: TLS 1.3. Probele interne de gateway sar peste validarea certificatului doar pentru readiness; testele de integrare nu o sar.
3. Intrare Angular disponibilă; acces anonim API refuzat cu 401; `/internal/` și `/actuator/` blocate la gateway cu 404.
4. Citire de contor în Database, diagnostic legacy în FTP, atașament de avarie în S3, document de racordare în S3 și fișier din categoria dronă prin două părți S3.
5. Descărcare și SHA-256 identic pentru toate cele cinci fixtures, acoperind toate cele patru categorii și toate cele trei storage-uri.
6. Documentul nu poate fi descărcat de alt proprietar (403).
7. Simulatorul trimite continuu citiri; jobul ML ajunge la COMPLETED, cu două modele și marker synthetic.
8. Prometheus colectează API-ul înainte și după restart; endpoint-ul intern Micrometer expune metricile FileGrid.
9. Reexecutarea bootstrap-ului nu modifică parolele, cheia AES, tokenul worker sau certificatul/cheia TLS.
10. Restart al întregului proiect, inclusiv PostgreSQL, MinIO și FTP, fără ștergerea volumelor. Aceleași ID-uri de fișier rămân AVAILABLE, cu dimensiuni și SHA-256 identice.
11. Retransmisia exactă a citirii după restart produce duplicate=true și o singură citire logică; rezultatul ML anterior este păstrat.
12. Verificare Chrome după restart: build-ul Angular servit de Nginx pe HTTPS, autentificare și catalog cu datele persistate. Browserul a folosit pin-ul cheii publice a certificatului local; verificarea strictă TLS/hostname a fost executată separat de scriptul Python.
13. `docker compose config --quiet`, sintaxă shell, compilarea scriptului Python și `git diff --check`.

Fixtures-ul dronă din această etapă depășește 8 MiB și verifică multipart. Testul de 1229 MiB din checkpoint-ul anterior este dovadă nativă, nu este prezentat drept test Docker BH01.

## Eșec găsit și remediat

Prima probă de gateway a eșuat cu `Connection refused`: wget a ales localhost IPv6, iar Nginx ascultă IPv4. Proba folosește acum `127.0.0.1`. Pornirea a fost reluată fără ștergerea datelor; toate verificările finale au trecut. Nu există teste BH01 eșuate rămase deschise.

## Reproducere

Cu grupul Docker activ în sesiune:

```bash
COMPOSE_PROJECT_NAME=filegrid-bh01 FILEGRID_RUNTIME_DIR=.runtime/bh01 FILEGRID_HTTPS_PORT=18443 COMPOSE_BAKE=false ./scripts/start.sh
python3 scripts/verify-compose.py seed
COMPOSE_PROJECT_NAME=filegrid-bh01 FILEGRID_RUNTIME_DIR=.runtime/bh01 FILEGRID_HTTPS_PORT=18443 docker compose restart --timeout 30
python3 scripts/verify-compose.py recover
```

Dacă IDE-ul păstrează grupurile vechi, rulează comenzile Docker prin `sg docker -c 'COMPOSE_PROJECT_NAME=filegrid-bh01 FILEGRID_RUNTIME_DIR=.runtime/bh01 FILEGRID_HTTPS_PORT=18443 COMPOSE_BAKE=false ./scripts/start.sh'`, respectiv aceeași încadrare pentru restart.

Folosește aceleași trei variabile Compose la toate comenzile asupra acestui proiect. Fazele seed/recover acceptă `--url`, `--runtime-dir` și `--report` pentru altă instanță. Raportul fixture-urilor este ignorat de Git, la `.runtime/bh01/verification.json`. Conturile sunt în `.runtime/bh01/accounts.txt`; nu se copiază în Git.

## Ce rămâne

BH02–BH06 nu au fost începute. Izolarea la 10×, alertele, securitatea completă, căderile individuale de servicii, HA și campania de rețea degradată păstrează starea anterioară. Recomandarea pentru BH02 este calibrarea unui baseline și măsurarea simultană a celor patru categorii, cu rate oferite/procesate, backlog, p50/p95/p99, erori și buget de disc/memorie documentate.
