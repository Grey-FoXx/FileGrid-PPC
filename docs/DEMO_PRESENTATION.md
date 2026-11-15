# Demonstrație FileGrid: ce arătăm și ce putem afirma

Actualizare 2026-11-15. Referință: PDF pp. 2–4. Datele generate sunt sintetice; sunt stocate, rutate și verificate efectiv. Nu sunt telemetrie de teren sau benchmark-uri inventate.

## Pornire și fluxuri continue

După `git pull`, rulează `./scripts/start.sh`; simplul pull nu înlocuiește imaginile containerelor deja pornite. Demo este o funcție permanentă, fără flag de activare. Intră ca ADMIN cu contul local din `.runtime/accounts.txt`. Nu distribui credențialele/cheia în Git.

Bara globală de volum 1×–10× este disponibilă în fiecare tab pentru ADMIN/DISPATCHER; ADMIN o modifică. Simulatorul separat citește multiplicatorul din API la circa 2 secunde și păstrează rata de bază `SIMULATOR_RATE` și numărul `SIMULATOR_METERS` configurabile în Compose. Contoarele au jurnale durabile distincte pentru setul obișnuit și Demo, retry cu bytes originali și ACK după commit. Modificarea este comună tuturor browserelor conectate la același API.

Demo Normal continuă citirile. La aproximativ 45 secunde / multiplicator (verificare la 5 secunde), generatorul adaugă un raport cu atașament, un document de racordare criptat și un obiect de inspecție sintetic. Pentru lizibilitate și spațiu sunt fixtures compacte, nu dimensiuni reprezentative pentru toate categoriile din tabelul PDF. La 2000 de fișiere demo, loturile mixte sunt oprite până la Reset; contoarele continuă. Storm adaugă și rafala de avarii existentă, plafonată la 40 de incidente demo totale. „Toate datele” include și Demo, nu este un set de producție exclusiv.

Acest flux automat mixt este exclusiv o facilitate de demo. În fluxul cerut de PDF, avariile, documentele și videoclipurile se încarcă manual prin UI, iar contoarele sunt automate. Upload-ul manual și rolurile rămân disponibile.

## Pași pentru juriu

1. **Acasă → volum 1×:** urmărește numărul citirilor. Mergi la Citiri contoare; observă identitățile noi, apoi treci la **10×** și urmărește creșterea. Numerele animate afișează valorile API, fără numere aleatorii. La motion redus, animația este dezactivată. Multiplicatorul nu este singur dovada izolării sub încărcare.
2. **Fișiere:** filtrează Avarii, Racordare, Inspecții dronă. Așteaptă următorul lot și vezi metadatele/ruta/versiunea; descarcă un fișier și verifică SHA-256. **Dispecerat:** urmărește raportul nou și grupul primit din API; Storm permite rafala vizibilă. Folosește Normal pentru a opri rafala, nu fluxul continuu.
3. **Acasă → Simulează notificare de risc:** în câteva secunde apare mesajul `TEST SINTETIC`. Deschide un al doilea browser ca ADMIN/DISPATCHER și verifică aceeași notificare. Mesajul este persistent pe server. Erorile reale înregistrate în `operations` generează și un semnal automat, limitat la unul/minut. Nu există livrare email/SMS/webhook și nu este acoperită automat fiecare garanție din tabelul 2.1.
4. **Acasă → Testează corupere și recuperare automată:** urmărește INJECTED → DETECTED → RECOVERED, la tick-uri de aproximativ 3 secunde. Proba creează propriul fișier în S3, verifică originalul și păstrează separat copia în Database. Scrie bytes corupți în versiunea referită, detectează SHA-256 diferit, blochează conținutul și restaurează automat copia validă, verificată din nou. În Fișiere caută `demo-auto-recovery.bin`, descarcă și verifică integritatea. Nu se corupe niciun upload existent. Dacă storage-ul este indisponibil, proba rămâne în așteptare și reîncearcă automat. Acest mecanism nu este un backup general pentru toate fișierele și nu presupune recuperare după pierderea simultană a ambelor copii. PDF-ul cere detectare la recuperare; restaurarea acestei probe este o extensie demonstrativă.
5. **Politici:** modifică regula legacy Avarii FTP ↔ S3; sesiunile noi primesc versiunea/ruta nouă fără restart. Constrângerile de securitate nu se ocolesc. Sesiunile și fișierele existente păstrează decizia inițială.
6. **Reset demo:** reface setul demo, șterge doar resursele demo și mesajele/probele aferente, revine la 1×. Datele din afara Demo și jurnalul obișnuit nu se șterg. Citirile și loturile încep apoi să crească din nou; nu trebuie să rămână un set înghețat.

## Probe live cu un terminal alături de aplicație

### Fișier peste 1 GB

Încarcă manual un fișier de peste 1 GB în categoria Inspecții dronă. În paralel rulează `docker stats` și urmărește containerul API, împreună cu progresul, pauza/reluarea și download-ul verificat. Folosește Chrome/Edge cu salvare streaming pentru download mare. Pentru o probă repetabilă, rulează `python3 scripts/large-file-test.py --size-mib 1229`; scriptul existent măsoară și verifică transportul, nu un codec video. Pentru măsurare RSS se poate folosi opțiunea `--api-pid`, conform help-ului scriptului. Nu este necesar să generezi un fișier >1 GB în fiecare minut.

Există proba anterioară consemnată în `frontend/AUDIT_PDF.md`: 1229 MiB, SHA-256 exact, RSS maxim eșantionat aproximativ 438 MiB într-un API limitat la 1 GiB. Este o măsurătoare anterioară, nu rezultatul garantat al fiecărei demonstrații și nici o probă completă de scalare.

### Căderea unui storage

Folosește scriptul existent `./scripts/fault-test.sh ftp` într-un mediu de demo. Scriptul oprește FTP și îl repornește când apeși Enter sau când scriptul se închide. În timpul opririi:

- Încarcă un document de racordare în S3 și urmărește citirile din Database; descarcă fișierele deja confirmate din aceste storage-uri.
- Încearcă un log `LEGACY_LOG`, `NON_SENSITIVE`, cu politica activă către FTP. Operația trebuie să raporteze indisponibilitatea, nu succes fals sau pierderea integrității. Păstrează fișierul sursă și reia după revenire.
- Repornește FTP și descarcă un fișier FTP confirmat înaintea opririi, comparând SHA-256 original.

Această probă pentru FTP nu certifică defectele MinIO/PostgreSQL, pierderea hostului sau HA. PostgreSQL este catalog comun; căderea sa poate afecta toate categoriile. Butoanele web nu au acces la socket-ul Docker și nu pretind oprirea serviciilor printr-o animație.

### Securitate: nu doar de menționat

Arată HTTPS și login, apoi două conturi cu roluri diferite și accesul refuzat documentului altui proprietar. Scriptul `python3 scripts/smoke-test.py` verifică și acel refuz, storage-urile și bytes recuperați. Din terminal arată că numai gateway publică porturi (`docker compose ps`); configurația rețelei este internă pentru storage. Pentru criptare, inspectează exclusiv un obiect sintetic brut și arată că nu este plaintext; nu afișa cheia sau parolele. Absența secretelor din istoricul Git cere un scan dedicat, nu un badge în UI.

## Cerințe pe care nu le declarăm încheiate prin această etapă

| Cerință PDF | Demonstrație actuală | Limită / probă suplimentară |
|---|---|---|
| Patru categorii + DB/S3/FTP + integritate | Upload/download, metadate, smoke real | Fișierele demo compacte nu înlocuiesc toate dimensiunile tipice |
| Politici fără cod | Editor ADMIN persistent, sesiuni noi | Destinațiile sunt limitate de securitate |
| Simulator continuu configurabil | Control real 1×–10×, jurnale separate | Rata de bază/numărul contoarelor sunt în Compose; rata atinsă depinde de capacitate |
| Pornire cu o comandă | Script README, dovadă izolată anterioară | Se repetă pe alt calculator; nu se afirmă validare universală |
| Izolare la 10× într-o categorie | Metrici pe categorii și control volum | Necesită campanie baseline/vârf cu trafic simultan și praguri; bara nu dovedește izolarea |
| Scalare prin instanțe | Sesiuni/politici persistente în DB | Două instanțe + balancing/throughput nu sunt demonstrate aici |
| >1 GB, memorie neproporțională | Upload multipart și probă anterioară cu RSS | Se repetă live cu monitorizare; nu se deduce din animație |
| Percentile/throughput/erori | Tabele pe categorie/storage/operație | Fără trafic: nemăsurat; fără benchmark comparabil: fără clasament de superioritate |
| Trace până la storage | Correlation ID, metadate, loguri | Animația nu este tracing distribuit cu timpi per hop |
| Notificare automată business | Feed server partajat, erori de operații, test sintetic | Nu acoperă toate riscurile și nu livrează extern echipei |
| Securitate | HTTPS, autentificare, roluri, proprietar, rețea privată, AES-GCM | Audit de secrete/izolare/ciphertext separat |
| Storage căzut | Scenariu FTP cu celelalte categorii + hash după revenire | Nu certifică toate storage-urile sau HA PostgreSQL |
| Rețea lentă/pierderi, fără intervenție | Retry limitat, multipart durabil, pauză/reluare | Campanie netem și recuperare nesupravegheată completă rămân de validat |
| Retry fără dubluri, corupere detectată | Unicitate/replay, SHA-256, proba de recuperare izolată | Auto-repararea oricărui fișier nu este oferită |
| Normal/vârf și interpretarea rețelei | Moduri reale sintetice, metrici și grupuri ML distincte | Nu reprezintă o zi de telemetrie reală sau cauză fizică demonstrată |
| Cod în Git înainte de termen | Commit-uri locale/remote inspectabile | Livrarea se confirmă doar după push și verificarea SHA remote |
