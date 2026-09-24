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
