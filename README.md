# Herzfrequenz

Eine persönliche Hörspielbibliothek: MP3s hochladen, sofort oder zu einem festgelegten Zeitpunkt veröffentlichen und mit einem dauerhaften QR-Code öffnen.

- Startseite mit deinem Originalmotiv; Play öffnet die responsive Folgenübersicht ohne Anmeldung
- Kleiner Admin-Login unten; geschütztes Studio mit E-Mail/Passwort-Anmeldung
- MP3-Upload (max. 50 MB), Probehören, Titel und Beschreibung
- Sofort veröffentlichen, Termin wählen oder als Entwurf speichern
- Vorhandene Titel und Termine ändern, Aufnahmen löschen
- Audio-Player mit gerätebezogener Merkhilfe für die Hörposition
- Countdown bis zur nächsten Folge, freigegebene Folgen herunterladen, QR-Code als SVG speichern
- GitHub Pages für die Oberfläche, Supabase für Anmeldung, Daten und MP3-Speicher

## Start

Die Einrichtung steht in [START-HIER.md](./START-HIER.md).

Alle statischen Website-Dateien liegen im Hauptverzeichnis. Ohne konfigurierte Supabase-Verbindung zeigt die Website eine ehrliche leere Bibliothek und lässt lokale MP3s probehören; Speichern wird ausdrücklich nicht vorgetäuscht.

## Veröffentlichung

GitHub Pages veröffentlicht **main → /(root)**. Die öffentliche Website liegt unter https://reaveexx.github.io/herzfrequenz/ . Kein Build-Schritt ist nötig.

## Architektur und Zugriff

Die Website benötigt keinen Build-Schritt. Die Verwaltung nutzt Supabase Auth und die HTTPS-APIs. Tokens bleiben nur im Arbeitsspeicher des geöffneten Tabs. Ein Neuladen erfordert erneutes Anmelden.

Die Datenbank prüft Datum, Veröffentlichungsstatus und Studio-Berechtigung serverseitig. Der Audio-Bucket ist privat. Freigegebene Dateien werden mit vier Stunden gültigen signierten Links abgespielt. Bereits ausgegebene Links und heruntergeladene Dateien können beim Zurückziehen einer Veröffentlichung nicht zurückgerufen werden.

Die Hörseite ist wie gewünscht ohne Passwort erreichbar: Jeder mit dem Link kann veröffentlichte Hörspiele anhören. `noindex` bittet Suchmaschinen um Nicht-Indexierung, ist aber kein Zugriffsschutz. Geplante Titel und Beschreibung sind als Ankündigung sichtbar. Audio-Dateien vor dem Termin und sämtliche Entwürfe sind gesperrt, selbst wenn jemand die Uhr am eigenen Gerät verstellt. Offene Hörseiten fragen alle 30 Sekunden nach neuen Folgen; eine neu geöffnete Seite liest sofort den aktuellen Stand.

Nur ausdrücklich in `studio_admins` eingetragene Konten dürfen Aufnahmen verwalten. Neue Supabase-Benutzer sind nicht automatisch Administratoren. `service_role`-Schlüssel und Datenbankpasswörter gehören niemals in die Website oder ins Repository.

## Entwicklung

```sh
python3 -m http.server 4173
```

Dann `http://localhost:4173` öffnen. Zum Ändern des Erscheinungsbilds `style.css`, für Texte und Struktur `index.html` bearbeiten. JavaScript hat keine Build-Abhängigkeiten.

Die QR-Bibliothek `qrcode-generator` 1.4.4 von Kazuhiko Arase steht unter MIT; ihre Lizenz liegt in `LICENSE-qrcode.txt`. Schriftarten werden von Google Fonts geladen und haben lokale Ersatzschriften. Es werden keine Analyse- oder Werbedienste verwendet.

## Kopfnuss (Quiz-Spiel)

Im Ordner `quiz/` liegt ein eigenständiges Party-Quiz für 1 bis 4 Personen. Nach der Veröffentlichung ist es unter https://reaveexx.github.io/herzfrequenz/quiz/ erreichbar. Es berührt die Hörspiel-Seite nicht.

**Zwei Spielarten**
- **Ein Bildschirm:** Alle antworten am selben Gerät, per Tippen oder mit eigenen Tasten.
- **Handys als Controller:** Der große Bildschirm (Fernseher, Laptop) zeigt einen QR-Code. Bis zu vier Leute scannen ihn, öffnen `quiz/controller.html` und spielen geheim am eigenen Handy. Die Fallen (Frost, Nebel, Kleckse …) erscheinen dann auf dem Handy der getroffenen Person.

Die Handys sind über **Supabase Realtime** mit dem Bildschirm verbunden. Genutzt werden dieselbe Project-URL und derselbe anon-Schlüssel aus `config.js` wie bei der Hörspiel-Seite. Es wird nichts in der Datenbank gespeichert; die Nachrichten laufen nur live durch einen Kanal pro Raumcode. Ist das Supabase-Projekt pausiert, zeigt die Lobby „Keine Verbindung zum Server“. Dann im Supabase-Dashboard das Projekt wieder aktivieren.

**3D-Bühne mit Spielfiguren:** Am großen Bildschirm stehen die Figuren der Spieler auf einer Studio-Bühne vor vier Antwortfeldern. Wer sich eingeloggt hat, hüpft. Bei der Auflösung laufen alle auf das Feld ihrer Antwort, die Kamera fährt mit, das richtige Feld leuchtet grün. Im Finale klettern die Figuren eine Treppe hoch, am Ende gibt es ein Siegerpodest. Die Bühne nutzt three.js (r128, von cdnjs) und steckt in `quiz/stage.js`. Ohne WebGL zeigt das Spiel automatisch die 2D-Ansicht.

**Handy im Querformat:** Die Frage steht nur auf dem Fernseher, das Handy zeigt die vier Antworten als große Knöpfe nebeneinander. Hält jemand das Handy hochkant, erscheint ein Hinweis zum Drehen; auf Android kann „Vollbild quer“ die Drehung auch festhalten.

**Sprecherstimme:** Fragen, Rundenansagen und Ergebnisse werden mit der Sprachausgabe des Browsers vorgelesen (Web Speech API, ohne Server). Welche deutschen Stimmen es gibt, hängt vom Gerät ab; auf dem Startbildschirm lässt sich eine auswählen und probehören.

**Dateien**
- `quiz/questions.js`: Fragenkatalog. Neue Fragen als `["Frage?", "Richtig", "Falsch", "Falsch", "Falsch"]` eintragen.
- `quiz/game.js`: Spielablauf am großen Bildschirm. Oben in `SETTINGS` lassen sich Runden, Fragen pro Runde, Zeit und Gipfelhöhe ändern.
- `quiz/controller.html`, `quiz/controller.js`: Handy-Seite.
- `quiz/stage.js`: 3D-Bühne mit den Spielfiguren.
- `quiz/pad.js`: Antwortfeld mit allen Fallen (Bildschirm und Handy).
- `quiz/net.js`: Verbindung zwischen Bildschirm und Handys.
- `quiz/common.js`, `quiz/style.css`: gemeinsame Bausteine und Aussehen.

**Lokal testen:** Im Hauptordner `python3 -m http.server 4173` starten und `http://localhost:4173/quiz/` öffnen. Mit `http://localhost:4173/quiz/?lokal` läuft der Handy-Modus ohne Server: Dann den Link aus der Lobby in weiteren Tabs desselben Browsers öffnen, jeder Tab spielt ein Handy.
