# Audit FileGrid PPC — 15 noiembrie 2026

Acest document separă implementarea, testele executate și demonstrația posibilă în UI. Nu transformă un test de browser cu răspunsuri simulate într-o dovadă de storage, scalare sau securitate. Sursa cerințelor: `FileGrid PPC.pdf`, paginile 1–4. Scope-ul modificărilor acestui checkpoint: politici live și harta aglomerată; nu au fost adăugate controalele de testare propuse mai jos.

## Concluzie pentru cerințele eliminatorii

Cerințele de storage, politici și integritate au dovezi de integrare curente. La sincronizarea cu GitHub au fost păstrate și corecțiile de pornire, împreună cu verificarea Compose izolată documentată în [review-ul comun](../docs/PDF_REQUIREMENTS_REVIEW.md). Aceasta dovedește pornirea pe această mașină, fără a certifica orice mașină curată.

| Cerință PDF p. 2 | Cum este tratată / dovadă actuală | Ce poți testa în aplicație |
|---|---|---|
| Stocare și recuperare pentru toate cele patru categorii | Testul real `scripts/smoke-test.py` trece pentru contoare, avarii, documente, dronă. Bytes/SHA sunt verificate la recuperare. | Citiri contoare → descarcă; Încarcă fișiere pentru cele trei categorii manuale; Fișiere → caută/descarcă. |
| FTP, S3 și Database folosite efectiv, servicii separate | Smoke real recuperează date din toate trei; Compose are containere postgres/minio/ftp distincte, fără porturi publicate pe host pentru storage. | Coloana Destinație și metadatele arată ruta; caracterul separat al serviciilor se verifică prin Docker, nu din aspectul UI. |
| Politică pe categorie configurabilă fără cod | `PUT /policies` ADMIN + versiune optimistă; PostgreSQL păstrează politica. Test real: schimbare FTP → S3 din formular, rutare nouă imediată, sesiune veche păstrată, persistență după restart API. | Politici → Avarii → regula legacy nesensibilă → S3/FTP → Aplică politica → upload nou eligibil. Vezi destinația/versiunea în Fișiere. |
| Fișier recuperat identic cu originalul | Smoke real și download-urile browser verifică SHA-256/bytes; coruperea sau lungimea incorectă sunt refuzate. | Mesajul de verificare SHA-256 la upload/download. Pentru dovada completă compară și bytes/hash în testul extern. |
| Pornire curată cu o singură comandă din README | Corecțiile remote pentru startup/readiness au fost păstrate. `docs/PDF_REQUIREMENTS_REVIEW.md` și `docs/VALIDATION.md` consemnează pornirea izolată reușită pe această mașină. | Nu se validează în frontend; repetă comanda README pe celălalt calculator, cu runtime nou. |

Configurabilitatea este limitată de constrângerile implementate: contoare → Database, racordare și dronă → S3, FTP doar pentru INCIDENT/LEGACY_LOG/NON_SENSITIVE. UI-ul nu oferă rutare arbitrară care să ocolească aceste limite. YAML rămâne bootstrap/reset; politica activă este în PostgreSQL. Nu se mută sau rerutează fișiere/sesiuni existente la salvare.

## Restul cerințelor funcționale și de business

| Cerință | Situație actuală | UI acum / posibil control viitor / verificare externă |
|---|---|---|
| Upload, căutare, download pentru categoriile manuale | Implementate; teste browser, inclusiv roluri, progres, worker hashing și download verificat. | **Acum:** Încarcă fișiere și Fișiere. |
| Simulator continuu, volum configurabil, normal/vârf | Containerul meter-simulator rulează. Citirile persistate cresc în testul curent; două teste de jurnal/replay trec. Volumul se configurează prin variabilele simulatorului. Normal/Storm din demo generează avarii, nu schimbă rata simulatorului de contoare. | **Acum:** Toate datele → Citiri contoare, observă actualizarea. **Posibil, neimplementat:** panou pentru rate/profiluri ale simulatorului, cu suport API. |
| Nicio citire pierdută/dublată | Identități unice în DB, ACK după commit, jurnal SQLite, retry cu aceiași bytes; smoke real confirmă replay identic și conflict la payload schimbat. Nu echivalează cu verificarea tuturor defectelor de host/DB. | **Acum:** identități/număr de citiri. **Posibil:** replay controlat și comparație produs/confirmat/pending. **Extern:** fault/restart/jurnal și constrângeri DB. |
| Avarii disponibile imediat pentru dispecerat | Raportul de metadate apare fără atașament obligatoriu; fișierul devine AVAILABLE după verificarea storage-ului, independent de ML. Test real cu worker ML oprit trece. | **Acum:** raportează avarie, urmărește harta/grupul și separat stările Fișier/ML. Nu există garanție de latență numerică/SLA demonstrată doar de UI. |
| Documente personale protejate și verificabile la audit | Criptare AES-256-GCM înainte de S3, verificare integritate, autorizare pe proprietar, audit events în backend. Smoke real refuză accesul altui proprietar. Nu este audit complet de conformitate. | **Acum:** două conturi de racordare și accesul permis/refuzat; hash. **Posibil:** vizualizator read-only de audit, cu API. **Extern:** ciphertext și chei/configurație. |
| Video pe conexiuni lente/instabile | Multipart, parts confirmate, retry limitat, pauză/reluare și referințe locale; test browser real reia după reload fără retransmiterea primei părți. | **Acum:** încarcă dronă, pauză, reload/reselectare fișier, reia. **Extern:** campanie cu latență/pierderi de pachete; reluarea manuală după reload nu dovedește reluare complet nesupravegheată în orice defect. |
| Codul/configurile/scripturile publicate în Git înainte de termen | Există commit-uri și remote; fișierele runtime sunt ignorate. Publicarea tuturor modificărilor finale trebuie verificată înainte de predare. | **Extern:** verifică SHA/branch/remote și termenul. Nu poate fi demonstrat de frontend. |

## Cerințe nefuncționale, pe rând — PDF p. 3

| Cerință | Ce este implementat și ce dovadă există | Cum se testează / ce ar putea fi adăugat fără să fie implementat acum |
|---|---|---|
| Vârf 10× într-o categorie fără degradarea celorlalte | Există generator de încărcare și metrici. Storm produce date reale sintetice, dar **nu certifică izolarea 10×**. | **Acum:** observi metrici pe categorii. **Extern:** baseline + vârf 10×, trafic simultan în celelalte categorii, ferestre comparabile, p95/erori. **Posibil UI:** lansator și rezultate ale acestei campanii, necesitând orchestrare backend. |
| Scalare prin adăugarea instanțelor fără cod | Metadata/sesiunile/politicile sunt partajate în DB; testul politicii verifică un al doilea PolicyEngine. **Nu există probă actuală de rulare și câștig cu două API-uri.** | **Extern:** două instanțe + balancing și verificări de consistență/throughput. UI poate doar prezenta rezultatele măsurate. |
| Fișiere >1 GB fără creștere proporțională a resurselor | Upload pe bucăți și download streaming; script de transport cu eșantionare RSS. Există dovadă istorică în docs/VALIDATION.md; testul actual de 1229 MiB este consemnat la Dovezi de execuție. | **Acum:** progres/reluare; pentru download mare trebuie browser cu salvare streaming. **Extern:** monitorizare RSS/cgroup/JVM în timpul upload/verificare/download. Nu pretindem test de codec sau benchmark general. |
| p50/p95/p99, throughput, erori per categorie/storage | API `/stats/technical`, măsurători reale pe operații; afișaj cu Not measured pentru combinații fără serii. | **Acum:** Acasă și Fișiere → Performanță. Valorile nu stabilesc singure superioritatea unui storage. |
| O operație urmărită cerere → storage | X-Correlation-ID în cereri/loguri, file ID/versiune/routingReason/audit; UI arată doar cererile capturate și etapele explicative din metadate. | **Acum:** Traseul unui fișier și identificatori. **Extern:** corelează logurile API/storage. **Posibil UI:** timeline alimentat de evenimente reale din backend; animația actuală nu este un trace distribuit complet și nu inventează timpi. |
| Echipa notificată automat când business-ul este în pericol | **Nerealizat complet:** există avertizări locale în browser; Prometheus are scrape, nu o configurație de livrare alerte demonstrată. | **Posibil UI:** panou de alerte și test de livrare, necesitând API/alerting real. **Extern:** declanșarea riscului și confirmarea livrării. Simplul Storm nu dovedește cerința. |
| Storage inaccesibil direct din exterior | În Compose numai gateway publică host-port 8443; postgres/minio/ftp nu publică porturi. | **Extern:** scan de porturi și încercări din afara rețelei sistemului. Browserul nu poate certifica izolarea doar prin afișarea unui badge. |
| Trafic exterior criptat și acces autentificat | Gateway HTTPS; clientul smoke validează certificatul local; Basic Auth/roluri. Browser real și API verifică login și refuzuri. Certificatul local este de dezvoltare. | **Acum:** HTTPS/login/logout/roluri. **Extern:** handshake/certificat și cereri anonime/refuzate. |
| Acces direct neautorizat nu expune PII | Documentele sunt criptate înainte de storage; proprietarul este verificat prin API. Există teste crypto și evidență istorică de ciphertext. | **Acum:** acces refuzat altui proprietar. **Extern:** inspectează obiectul brut/ciphertext și izolația cheii. |
| Fără parole/chei în repository | `.runtime/accounts.txt` și `.runtime/encryption.key` sunt ignorate și nu sunt în fișierele urmărite curente. Nu s-au citit sau publicat cheile pentru audit. **Istoricul complet Git nu a fost certificat printr-un secret scanner în această rundă.** | **Extern:** scan inclusiv istoric, nu un indicator în UI. |
| Căderea unui storage nu oprește alte categorii și nu pierde fișiere confirmate | Retry/jurnal/volume durabile există; dovezi istorice pentru FTP căzut, nu o certificare curentă a tuturor storage-urilor. PostgreSQL este și catalog comun, deci disponibilitatea lui este o dependență critică, fără HA validată. | **Extern:** oprire/restaurare FTP, MinIO și DB pe rând, verificare categorie neafectată și hash-uri după revenire. **Posibil UI:** comenzi de fault numai într-un mediu de test, cu restaurare și dovezi backend. |
| Latență mare/pierderi: finalizare sau reluare fără intervenție | Retry automat limitat + sesiuni durabile; testele reale arată reluarea după reload. **Campania netem/packet-loss și recuperarea nesupravegheată nu sunt validate.** | **Acum:** pauză/reluare și mesaje retry. **Extern:** profil de rețea măsurat. **Posibil UI:** scenarii și rezultate ale unui harness de rețea; nu a fost adăugat. |
| Retry fără dubluri și detectarea coruperii la recuperare | Unicitate meter/sequence + idempotency; smoke real dedupe/conflict, teste SHA-256/AEAD și browser care refuză bytes/hash/lungime greșite. | **Acum:** rezultat integritate și erori; citiri. **Extern:** replay și coruperea controlată a unei copii sintetice. **Posibil UI:** scenariu de replay/corupere izolat; nu se alterează datele utilizatorului pentru demonstrație. |

## Statistici și interpretare — PDF p. 4

- **Potrivirea storage-ului:** destinația și motivul vin din politica activă; comparația de performanță cere aceleași payload-uri/operații și condiții. Nu există costuri/scoruri de superioritate fabricate. Un dashboard de benchmark comparabil poate fi adăugat ulterior, cu date măsurate.
- **Normal vs zi de vârf:** modul și seria curentă sunt reale în scope-ul demo, însă acesta nu este istoric pe zile sau o demonstrație de izolare 10×. Pot fi adăugate rulări comparabile și un istoric, cu suport API; nu s-a implementat acum.
- **Rețea:** se văd distribuția avariilor, severități, grupuri și recomandări ale celor două modele sintetice/Decision Agent. Cauza fizică comună nu este dovedită de proximitate. Anomalii/tipare de contoare ar necesita agregări și măsurători suplimentare; nu sunt pretinse ca existente.

## Pași rapizi în aplicația pornită

1. Autentifică-te ca ADMIN la `https://localhost:8443`.
2. Politici → Avarii → regula legacy → schimbă FTP/S3 → Aplică politica; încarcă un nou log legacy NON_SENSITIVE și inspectează destinația/versiunea. O sesiune creată înainte de salvare păstrează ruta veche.
3. Dispecerat: pentru multe grupuri apropiate, o bulină poate totaliza mai multe **intervenții distincte**, fără să modifice gruparea din backend. Click → alege intervenția din selector; statusurile/acțiunile de sub hartă rămân per grup real. Rapoartele/centrele GPS nu sunt rescrise pentru spațiere.
4. Fișiere → descarcă și verifică SHA-256; testează pauza/reluarea cu un fișier de dronă.
5. Toate datele → Citiri contoare pentru simulatorul continuu. Scope-ul Demo are citiri-seed fixe; Storm din demo generează avarii.

Nu au fost șterse datele sau resetat demo-ul utilizatorului pentru acest audit. Fișierele sintetice adăugate de testele reale sunt etichetate prin numele/contextul lor de test. Politicile originale au fost restaurate după testul de rutare, într-o versiune nouă.

## Dovezi de execuție curente

- Angular production build și `docker compose config --quiet`: PASS; serviciile API/gateway au fost reconstruite și rulează.
- Browser, împotriva gateway-ului HTTPS cu testele live activate: **74 passed / 0 failed / 0 skipped**. Include pauză/reload/reluare multipart reală, worker ML oprit temporar, roluri și cazurile noi de politici/hartă.
- Java/PostgreSQL de integrare: **7 teste trecute** (4 API integration + 3 integrity/policy), inclusiv criteriu JSON null respins cu 422, stale version 409 și rutare/versionare per sesiune.
- Simulator: **2 teste trecute**; în verificarea runtime numărul citirilor persistate a crescut în intervalul observat de 3 secunde. Ratele/volumele nu au fost schimbate pentru acest audit.
- `scripts/smoke-test.py` cu storage-uri reale: PASS pentru Database, FTP, S3, document privat/alt proprietar refuzat, multipart, SHA-256 și replay/conflict al citirii.
- Test real prin browser al politicii: salvare live FTP → S3 fără download; noua sesiune S3, sesiunea creată anterior FTP; ambii bytes recuperați corect; politica persistă după restart API. Regulile originale au fost restaurate prin API cu versiune nouă.
- Test browser de densitate: 77 de rapoarte/intervenții sintetice în același punct din Dobrogea; toate păstrate în totaluri, toate cercurile în conturul României, deplasare locală <=90 unități SVG, intervenții distincte accesibile în selector. O agregare de pe hartă nu unește grupurile backend.
- **Test extern actual de transport >1 GB:** 1.288.699.904 bytes (1229 MiB), 154 părți, replay al primei părți, verificare și recuperare exactă SHA-256. PASS, API RSS maxim eșantionat **459.415.552 bytes (~438 MiB)**, container API limitat la 1 GiB. Durata observată a rulării: 91,86 secunde. Este dovadă pentru acest caz de transport, nu codec, benchmark general, scalare sau izolare 10×.
- Certificatul local HTTPS a fost folosit la verificarea conexiunilor API. Compose publică numai gateway pe 8443; nu există porturi host pentru postgres/minio/ftp. Nu echivalează cu audit de penetrare.
- Înainte de sincronizarea remote, readiness către `https://localhost:8443/` eșua, iar `https://127.0.0.1:8443/` trecea. Corecția startup publicată între timp și dovada Compose izolată sunt păstrate; vezi `docs/VALIDATION.md`. Testele enumerate aici au precedat această sincronizare.
- Nu s-au rulat în acest checkpoint campanii 10× pe categorii, două instanțe API, defecte de host/DB, pierderi de pachete, audit complet de secrete în istoric sau livrare de alerte. Nu sunt marcate drept trecute.

Verificare vizuală și geometrică suplimentară pe datele reale curente, în Toate datele: **81 rapoarte deschise / 73 intervenții**, reprezentate prin **5 marcaje vizuale**; conturul a fost verificat în browser, toate corpurile marker-elor în țară, deplasare maximă observată 60 unități SVG. Nu s-au unit intervențiile în DB. După optimizarea aglomerării, toate cele 7 cazuri dedicate politici/hartă au trecut din nou. Screenshot local: `.runtime/current-dense-map-fixed.png`.


## Actualizare: demonstrație continuă și recuperare izolată

Etapa ulterioară adaugă Demo permanent, controlul real al ratei simulatorului 1×–10×, citiri continue în Demo Normal, loturi mixte periodice și feed server de notificări. Mesajele de test sunt etichetate sintetice; operațiile eșuate declanșează un semnal automat. Nu este alertare externă sau acoperire completă a riscurilor din tabelul 2.1. Proba proprie S3 este coruptă și recuperată automat din bytes originali păstrați separat în Database; aceasta nu reprezintă repararea tuturor fișierelor. [Ghidul actual de prezentare](../docs/DEMO_PRESENTATION.md) înlocuiește descrierile anterioare despre citirile demo fixe și lipsa controalelor de volum/notificări.
