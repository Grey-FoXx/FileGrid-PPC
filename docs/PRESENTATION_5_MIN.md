# FileGrid — flow de prezentare de 5 minute

Acest scenariu separă ce se vede, mecanismul explicat și dovezile suplimentare. Nu declară toate cerințele PDF încheiate. Detalii și limite: [DEMO_PRESENTATION.md](DEMO_PRESENTATION.md).

## Înainte să înceapă prezentarea

- Deschide `https://localhost:8443`, autentificat ca ADMIN, în setul **Demo**, cu modul **Normal** și volumul **1×**. Normal este profilul de generare; Demo/Toate datele este selecția setului de date. Sunt controale diferite.
- Setul Demo trebuie pregătit înainte de intrarea juriului. `Reset demo` curăță doar setul Demo, nu vechile citiri ale simulatorului obișnuit. Nu promite un total înghețat: citirile continuă intenționat.
- Pregătește un al doilea browser/cont pentru roluri. Închide în IDE fișierele cu parole și cheia; nu le afișa pe proiector.
- Ai pregătite fișiere fictive în `.runtime/presentation-files/`: raport de aproximativ 1 MiB, plan de racordare și payload de transport de 25 MiB. Cel de 1229 MiB este pentru extensia tehnică. Fișierele `.bin` sunt teste de transport, nu videoclipuri reale.
- Verifică înainte toate serviciile cu `docker compose ps`. Pentru probele tehnice, pregătește terminalul și nu improviza comenzi în timpul celor 5 minute.

## Cele 5 minute

| Timp | În aplicație | Ce explici |
|---|---|---|
| 0:00–0:30 | **Acasă**, Demo Normal, numerele și cele patru surse | „FileGrid este singurul punct de intrare. Contoarele sunt automate; celelalte categorii se încarcă manual. Generatorul mixt este exclusiv o facilitate sintetică de demo.” |
| 0:30–1:10 | **Încarcă fișiere**: creează un raport cu coordonate în Banat și atașează raportul fictiv | „Putem înregistra avaria și fără atașament obligatoriu. Stocarea și verificarea fișierului sunt separate de analiza ML asincronă.” |
| 1:10–2:00 | **Dispecerat**: selectează raportul/grupul; arată Modelul 1, Modelul 2, Decision Agent; trimite echipaj pentru grup | „Modelul de impact estimează prioritatea, corelarea propune gruparea, iar agentul aplică regulile explicabile. Acțiunea operează pe grupul persistent. Proximitatea nu dovedește singură cauza fizică.” |
| 2:00–2:45 | **Politici**: arată regula legacy FTP, schimbă în S3, aplică; **Fișiere**: compară versiunea/destinația unui fișier nou cu unul vechi | „Politica este persistentă și versionată. Schimbarea se aplică sesiunilor noi, fără cod sau restart. Constrângerile de securitate rămân obligatorii.” Nu pretinde că un fișier vechi este mutat. |
| 2:45–3:25 | **Acasă**: Storm, apoi bara 1× → 10×; urmărește harta și metricile | „Acesta este trafic sintetic trimis și stocat efectiv. Bara schimbă ținta simulatorului; rata atinsă depinde de capacitate. Această animație nu dovedește izolarea la 10× a celorlalte categorii.” |
| 3:25–4:10 | **Acasă**: test notificare, apoi test corupere/recuperare; așteaptă starea finală | „Mesajul de test este etichetat. Erorile de operații produc și semnale automate în aplicație. Pentru fișierul sintetic, SHA-256 detectează coruperea, iar o copie independentă permite restaurarea automată. Nu avem recuperare generală fără o copie validă.” |
| 4:10–5:00 | **Fișiere**: download verificat; arată rolurile/explică securitatea; revino la Normal și 1× | „Bytes recuperați sunt verificați față de original. Documentele personale sunt criptate înainte de S3 și accesul este controlat pe rol și proprietar. Garanțiile de infrastructură au probe separate, nu doar badge-uri.” |

Pentru regula FTP ↔ S3, alege un atașament declarat `LEGACY_LOG` și `NON_SENSITIVE`; nu orice fișier poate fi trimis în FTP. Un document de racordare sau video are alte constrângeri. Dacă dorești să arăți toate trei storage-urile, păstrează și un fișier FTP confirmat înainte de modificarea regulii.

## Explicația securității — aproximativ 40 de secunde

> Accesul exterior intră prin gateway-ul HTTPS, astfel încât credențialele și conținutul sunt protejate în tranzit. API-ul autentifică fiecare cerere și verifică atât rolul, cât și proprietarul documentului. Pentru documentele de racordare, backend-ul criptează conținutul cu AES-256-GCM și nonce propriu înainte să îl scrie în S3. Un obiect brut nu reprezintă documentul în clar, iar GCM detectează modificarea conținutului criptat. Cheia este păstrată separat de storage, în runtime, și nu este în Git. Storage-urile nu publică porturi spre exterior; accesul utilizatorilor trece prin FileGrid. SHA-256 verifică integritatea fișierului recuperat; nu este mecanismul de criptare.

Certificatul local este pentru demonstrație; nu îl prezenta ca infrastructură PKI de producție. Basic Auth este protejat de HTTPS, nu un mecanism MFA/SSO. Izolarea rețelei, ciphertext-ul și absența secretelor în întreg istoricul Git se probează separat.

## Cele trei probe tehnice: există integral în UI?

| Probă | Ce există în UI | Ce necesită terminal / verificare separată |
|---|---|---|
| Fișier >1 GB, memorie limitată | Alegere fișier, multipart, progres, pauză/reluare, download verificat | `docker stats` sau scriptul `large-file-test.py` măsoară memoria. Un progres de upload nu demonstrează singur consum neproporțional de resurse. |
| Securitate | HTTPS/login, funcții diferite pe roluri, catalog limitat după proprietar | Refuzul direct 403 se verifică prin API/smoke; obiectul criptat și porturile private prin storage/Docker. Nu există un buton care să dovedească toate acestea. |
| FTP indisponibil | Erori, metrici, notificare, continuitatea citirilor și operațiilor S3 | `./scripts/fault-test.sh ftp` oprește/repornește serviciul. UI nu controlează Docker. După restaurare compari download-ul FTP cu hash-ul anterior. |

Proba FTP se face într-o extensie tehnică separată de cele 5 minute. Dovada FTP nu certifică HA pentru PostgreSQL, care este catalog comun.

## Propunere pentru ultima iterație UI — neimplementată aici

1. **Bară de prezentare compactă:** separă explicit `Set de date: Demo / Toate` de `Profil: Normal / Storm`; afișează rate observate într-o fereastră de un minut, separat de multiplicatorul țintă.
2. **Panou „Demonstrație în 5 pași”**, pliabil: scurtături către Ingestie → Dispecerat → Politici → Integritate → Securitate, fără navigare nouă și fără automatizarea acțiunilor dispecerului.
3. **Panou de dovezi:** fiecare cerință are „Arată în aplicație”, „Necesită terminal” și limita probei; un buton explică mecanismul, fără badge „validat” bazat doar pe configurație.
4. **Acasă mai concentrat:** patru indicatori, câteva semnale prioritare și harta; metricile și explicațiile ample rămân accesibile în secțiuni pliabile. Păstrează toate funcțiile existente.

Acestea sunt propuneri, nu schimbări de interfață deja implementate. Prioritatea următoare este să îmbunătățim claritatea dovezilor, nu să adăugăm animații sau să ascundem limitările.
