# Deine Hörspiel-Website einrichten

Die Website ist vorbereitet. Für dauerhafte MP3-Uploads muss einmal der Online-Speicher eingerichtet und verbunden werden. Danach erledigst du alles auf deiner Website im Bereich **Mein Studio**.

## Startseite und Folgen

Die Startseite nutzt dein Motiv aus Merit.png. **Play** führt zur Folgenübersicht. Ein Countdown zeigt die nächste angekündigte Folge. Freigegebene Folgen haben **Abspielen** und **Download**. Unten öffnet **Admin-Login** deinen Verwaltungsbereich. Ohne verbundenen Speicher wird die Anmeldung als noch nicht verfügbar gekennzeichnet; über **Studio-Vorschau ansehen** kannst du die Oberfläche trotzdem ansehen.

## 1. Supabase vorbereiten

1. Auf https://supabase.com ein Konto anlegen und ein neues Projekt erstellen. Den passenden Tarif selbst prüfen; keine kostenpflichtige Erweiterung ist für die Programmierung erforderlich. Ein Free-Projekt kann bei Inaktivität pausiert werden; dann sind Aufnahmen vorübergehend nicht erreichbar, bis es im Dashboard wieder aktiviert wird.
2. Eine nahe Region wählen, z. B. Frankfurt. Das Datenbankpasswort sicher selbst festlegen und aufbewahren; es wird nicht in der Website verwendet.
3. Im Projekt **SQL Editor → New query** öffnen. Den vollständigen Inhalt von `setup.sql` einfügen und einmal ausführen. Das Skript ist für ein neues, ausschließlich für diese Website verwendetes Projekt gedacht.
4. Unter **Authentication → Users → Add user → Create new user** dein Studio-Konto mit deiner E-Mail und einem von dir festgelegten Passwort anlegen. Das Konto als bestätigt anlegen.
5. Die **User UID** des neuen Kontos kopieren. Im SQL Editor diese einzelne Zeile ausführen, wobei die UID ersetzt wird:

   ```sql
   insert into public.studio_admins (user_id) values ('DEINE-USER-UID');
   ```

6. Unter **Authentication → Sign In / Providers** die öffentliche Registrierung ausschalten. Deine Partnerin braucht kein Konto. Kein fremdes Konto wird allein durch seine Registrierung Studio-Administrator.

## 2. Website verbinden

Unter den Supabase-Projekteinstellungen die **Project URL** und unter **API Keys → Legacy anon, service_role API keys** den **anon / public**-Schlüssel finden. Diese Version verwendet den als JWT formatierten Legacy-`anon`-Schlüssel. Keinen `service_role`-, `sb_secret_`-Schlüssel oder ein Datenbankpasswort verwenden.

`config.js` öffnen und ausfüllen:

```js
window.HEART_CONFIG = {
  supabaseUrl: 'https://DEIN-PROJEKT.supabase.co',
  supabaseAnonKey: 'DEIN-OEFFENTLICHER-ANON-SCHLUESSEL',
  publicUrl: 'https://DEIN-GITHUB-NAME.github.io/herzfrequenz/',
};
```

Project URL und anon-Schlüssel dürfen öffentlich in der Website stehen. Die Zugriffsregeln aus Schritt 1 schützen die Daten. Ohne diese Regeln nicht veröffentlichen. Das Repository enthält keine MP3s und keine privaten Zugangsdaten.

## 3. Auf GitHub veröffentlichen

### Einfach über den Browser

1. Ein neues Repository namens `herzfrequenz` anlegen. Für GitHub Pages mit einem kostenlosen GitHub-Konto muss es öffentlich sein. Es enthält nur Website-Code.
2. Die **Inhalte** des Ordners `site` hochladen: `index.html`, `style.css`, `app.js`, `config.js`, `favicon.svg`, `merit-hero.png` sowie `qrcode.js` und `LICENSE-qrcode.txt`. Nicht nur eine ZIP-Datei hochladen.
3. Unter **Settings → Pages** als Quelle **Deploy from a branch** einstellen, dann **main** und **/(root)** wählen und speichern.
4. Warten, bis GitHub die Veröffentlichung als erfolgreich meldet. Der angezeigte Pages-Link ist die dauerhafte Website-Adresse.

### Als vollständiges Entwicklerprojekt

Alternativ den gesamten Projektordner einschließlich `.github/workflows/pages.yml` per Git ins Repository übertragen. Dann unter **Settings → Pages** die Quelle **GitHub Actions** wählen. Der Workflow veröffentlicht ausschließlich `site/`.

## 4. Dein erstes Hörspiel

1. Website öffnen → unten **Admin-Login** → mit deinem Studio-Konto anmelden.
2. MP3 auswählen oder hineinziehen. Maximal 50 MB; für längere Aufnahmen beim Export eine kleinere MP3-Bitrate wählen.
3. Titel und optional persönliche Worte ergänzen.
4. **Sofort**, **Zu einem bestimmten Zeitpunkt** oder **Als Entwurf behalten** wählen. Datum und Uhrzeit richten sich nach der am Gerät angezeigten Zeitzone; gespeichert wird ein weltweit eindeutiger Zeitpunkt.
5. Speichern. Den Tab bis zur Erfolgsmeldung geöffnet lassen. Bei einem Fehler bleiben deine Eingaben erhalten.
6. In einem privaten Browserfenster prüfen, dass veröffentlichte Folgen hörbar sind und Entwürfe fehlen und geplante Folgen nur als Ankündigung mit Countdown erscheinen.

Eine einmal gespeicherte geplante Folge braucht keinen laufenden Computer und keinen Hintergrundjob: Der Server erlaubt den Zugriff ab dem festgelegten Zeitpunkt. Bereits offene Hörseiten aktualisieren sich innerhalb von 30 Sekunden.

## 5. QR-Code verschenken

**Link & QR-Code** öffnen, die endgültige Website-Adresse prüfen und **QR-Code speichern** wählen. Die SVG-Datei lässt sich beliebig groß drucken. Den gedruckten Code einmal mit dem Handy testen. Es ist kein QR-Dienst nötig; der Code wird lokal in deinem Browser erstellt.

Der Link bleibt gleich, wenn du neue Hörspiele ergänzt. Jeder mit diesem Link kann veröffentlichte Aufnahmen öffnen, genau wie bei einem weitergegebenen QR-Code.

## Wenn etwas nicht klappt

- **Leere Bibliothek:** Noch keine freigegebene Folge, Veröffentlichung liegt in der Zukunft oder Supabase-Projekt ist pausiert.
- **Keine Studio-Berechtigung:** Prüfen, ob die User UID korrekt in `studio_admins` steht.
- **Upload fehlgeschlagen:** Verbindung, Dateigröße, aktives Projekt und dessen Speicherlimit prüfen. Der Bucket `audio` muss privat bleiben.
- **Passwort vergessen:** Im Supabase-Dashboard den Zugang selbst zurücksetzen. Die Website speichert keine Passwörter.
- **Eine Folge soll verschwinden:** Im Studio bearbeiten und auf Entwurf setzen. Bereits ausgegebene Audio-Links bleiben bis zu vier Stunden gültig; bereits heruntergeladene Kopien bleiben beim Empfänger.
- **50 MB reichen nicht:** Die Obergrenze ist absichtlich auf Website und Bucket abgestimmt. Änderungen müssen an beiden Stellen und passend zum Supabase-Tarif vorgenommen werden.

## Prüfliste vor dem ersten Verschenken

- Anmeldung mit deinem Studio-Konto funktioniert.
- Eine echte MP3 lässt sich hochladen, abspielen und bearbeiten.
- Eine zwei Minuten in die Zukunft geplante Testfolge zeigt vorher im privaten Browserfenster nur den Countdown und lässt sich erst danach abspielen und herunterladen.
- Ein Entwurf bleibt für Besucher unsichtbar.
- Eine fremde oder nicht angemeldete Person kann keine Aufnahmen ändern.
- Der QR-Code öffnet die veröffentlichte Seite auf deinem Handy.

Die Kontoverbindung und diese Live-Prüfungen können erst nach der Einrichtung deines Supabase-Projekts abgeschlossen werden.

## Bestehendes Supabase-Projekt aktualisieren

Wenn das ursprüngliche setup.sql bereits ausgeführt wurde, nicht erneut ausführen. Stattdessen nur `countdown-update.sql` ausführen. Es ergänzt die öffentliche Folgenübersicht mit Serverzeit und Countdown, ohne zukünftige Audio-Dateien freizugeben. Entwürfe bleiben privat.
