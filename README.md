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

**Comic-Bühne aus Papier:** Das ganze Spiel sieht aus wie ein handgemachter Comic: Tuschekonturen, flache Farben, Rasterpunkte, ausgeschnittene Zettel mit weißem Papierrand. Am großen Bildschirm steht ein Papier-Diorama in 2,5D: Die vier Spielfiguren (eigene Entwürfe mit Partyhut, Antenne, Ohren und Kappe), Publikum, Vorhänge, Wimpel und Schilder sind flache Pappausschnitte, die hintereinander im Raum stehen und sich beim Kameraschwenk gegeneinander verschieben. Die Figuren drehen sich wie eine Spielkarte um, hüpfen beim Laufen und zeigen je nach Lage ein anderes Gesicht (überlegen, jubeln, traurig). Bei der Auflösung laufen alle auf das Feld ihrer Antwort, falsche Schilder kippen nach hinten. Im Finale steigen die Figuren eine Papptreppe vor einem Pappberg hoch, am Ende gibt es ein Siegerpodest mit Konfetti.

Sobald Figuren zu sehen sind (Lobby, Frage, Auflösung, Finale, Sieger), füllt die Bühne das ganze Fenster. Frage, Runde, Zündschnur-Timer, Spielerleisten und Knöpfe liegen als Erzählkasten, Aufkleber und Sprechblasen darüber. In sehr schmalen Fenstern steht die Bühne als Streifen über dem Rest. Alles wird im Code auf Canvas-Flächen gezeichnet, es gibt keine Bilddateien. Die Bühne nutzt three.js (r128, von cdnjs) und steckt in `quiz/stage.js`. Ohne WebGL zeigt das Spiel automatisch die 2D-Ansicht im selben Comic-Stil.

**Abstimmung über die Kategorie:** Vor jeder Frage stehen vier Türen mit vier Kategorien auf der Bühne. Jede Person stimmt ab (am Handy antippen oder mit den eigenen Tasten), ihre Figur stellt sich vor die gewählte Tür. Die Mehrheit gewinnt. Bei Gleichstand springt ein Zufallsstern mit Klickgeräusch zwischen den Türen mit den meisten Stimmen hin und her, wird langsamer und bleibt auf einer stehen (hat niemand abgestimmt, sind alle Türen dabei). Dann schwingt die Tür auf, alle Figuren laufen hindurch und die Frage erscheint. Die Abstimmzeit steht in `SETTINGS.voteTime`.

**Handy im Querformat:** Die Frage steht nur auf dem Fernseher, das Handy zeigt die vier Antworten als große Knöpfe nebeneinander. Hält jemand das Handy hochkant, erscheint ein Hinweis zum Drehen; auf Android kann „Vollbild quer“ die Drehung auch festhalten.

**Sprecherstimme:** Fragen, Rundenansagen und Ergebnisse werden mit frechen Sprüchen vorgelesen. Auf dem Startbildschirm gibt es drei Arten zum Probehören: die *Comic-Stimme* (Sprachausgabe des Browsers, hoch und flott gestellt, mit kleinen Ausrufen aus dem Synthesizer davor), die *Brabbelsprache* (reine Fantasiestimme aus dem Synthesizer, klingt auf jedem Gerät gleich; die Frage steht dabei nur auf dem Bildschirm) und die *normale Vorlesestimme*. Wie die Comic-Stimme genau klingt, hängt von den deutschen Stimmen des Geräts ab. Alles läuft im Browser, ohne Server.

**Dateien**
- `quiz/questions.js`: Fragenkatalog. Neue Fragen als `["Frage?", "Richtig", "Falsch", "Falsch", "Falsch"]` eintragen.
- `quiz/game.js`: Spielablauf am großen Bildschirm. Oben in `SETTINGS` lassen sich Runden, Fragen pro Runde, Zeit und Gipfelhöhe ändern.
- `quiz/controller.html`, `quiz/controller.js`: Handy-Seite.
- `quiz/stage.js`: Papier-Bühne mit den Spielfiguren (alle Zeichnungen entstehen dort im Code).
- `quiz/pad.js`: Antwortfeld mit allen Fallen (Bildschirm und Handy).
- `quiz/net.js`: Verbindung zwischen Bildschirm und Handys.
- `quiz/common.js`, `quiz/style.css`: gemeinsame Bausteine und Aussehen.

**Lokal testen:** Im Hauptordner `python3 -m http.server 4173` starten und `http://localhost:4173/quiz/` öffnen. Mit `http://localhost:4173/quiz/?lokal` läuft der Handy-Modus ohne Server: Dann den Link aus der Lobby in weiteren Tabs desselben Browsers öffnen, jeder Tab spielt ein Handy.
