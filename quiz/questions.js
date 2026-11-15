/*
  Fragenkatalog für Kopfnuss.

  So fügst du eigene Fragen hinzu:
    ["Fragetext?", "Richtige Antwort", "Falsch 1", "Falsch 2", "Falsch 3"]
  Die richtige Antwort steht immer an erster Stelle. Das Spiel mischt die
  Reihenfolge selbst. Eine neue Kategorie ist einfach ein neuer Eintrag
  "Name": [ ...Fragen... ].
*/
window.KOPFNUSS_FRAGEN = {
  "Geografie": [
    ["Welcher Fluss hat die längste Fließstrecke in Deutschland?", "Rhein", "Donau", "Elbe", "Main"],
    ["Wie heißt die Hauptstadt von Australien?", "Canberra", "Sydney", "Melbourne", "Perth"],
    ["Wie viele Bundesländer hat Deutschland?", "16", "14", "15", "18"],
    ["Welcher ist der höchste Berg Afrikas?", "Kilimandscharo", "Mount Kenia", "Toubkal", "Ruwenzori"],
    ["In welchem Land liegt Timbuktu?", "Mali", "Niger", "Marokko", "Tschad"],
    ["Welches Land hatte 2024 die meisten Einwohner?", "Indien", "China", "USA", "Indonesien"],
    ["Welche Meerenge trennt Europa und Afrika?", "Straße von Gibraltar", "Bosporus", "Ärmelkanal", "Straße von Messina"],
    ["Wie heißt die Hauptstadt von Kanada?", "Ottawa", "Toronto", "Montreal", "Vancouver"],
    ["Welcher ist der größte See, der vollständig in Deutschland liegt?", "Müritz", "Chiemsee", "Starnberger See", "Steinhuder Meer"],
    ["Durch wie viele Länder fließt die Donau?", "10", "6", "8", "12"],
    ["In welcher Stadt steht die Hagia Sophia?", "Istanbul", "Athen", "Rom", "Kairo"],
    ["Welcher Ozean ist der größte?", "Pazifik", "Atlantik", "Indischer Ozean", "Arktischer Ozean"]
  ],
  "Geschichte": [
    ["In welchem Jahr fiel die Berliner Mauer?", "1989", "1990", "1987", "1991"],
    ["Wer war der erste Bundeskanzler der Bundesrepublik?", "Konrad Adenauer", "Ludwig Erhard", "Willy Brandt", "Theodor Heuss"],
    ["In welchem Jahr betraten Menschen zum ersten Mal den Mond?", "1969", "1965", "1972", "1961"],
    ["Welche Stadt wurde 79 n. Chr. beim Ausbruch des Vesuvs verschüttet?", "Pompeji", "Ostia", "Neapel", "Syrakus"],
    ["Wer entwickelte in Europa den Buchdruck mit beweglichen Lettern?", "Johannes Gutenberg", "Martin Luther", "Albrecht Dürer", "Leonardo da Vinci"],
    ["In welchem Jahr begann der Erste Weltkrieg?", "1914", "1912", "1916", "1918"],
    ["Wessen Grab entdeckte Howard Carter 1922?", "Tutanchamun", "Ramses II.", "Cheops", "Echnaton"],
    ["In welchem Jahr wurde Deutschland wiedervereinigt?", "1990", "1989", "1991", "1992"],
    ["Wer segelte 1492 im Auftrag Spaniens nach Amerika?", "Christoph Kolumbus", "Vasco da Gama", "Ferdinand Magellan", "Amerigo Vespucci"],
    ["Welche Königin regierte das Vereinigte Königreich 70 Jahre lang?", "Elisabeth II.", "Victoria", "Anne", "Maria I."],
    ["Nach welcher Stadt ist die deutsche Republik von 1919 bis 1933 benannt?", "Weimar", "Berlin", "Bonn", "Frankfurt"],
    ["Welches Volk erbaute Machu Picchu?", "Inka", "Azteken", "Maya", "Olmeken"]
  ],
  "Natur & Tiere": [
    ["Wie viele Herzen hat ein Oktopus?", "3", "1", "2", "4"],
    ["Welches ist das größte Tier der Erde?", "Blauwal", "Afrikanischer Elefant", "Pottwal", "Walhai"],
    ["Welcher Vogel kann rückwärts fliegen?", "Kolibri", "Schwalbe", "Specht", "Eisvogel"],
    ["Wie heißt ein männliches Reh?", "Bock", "Hirsch", "Keiler", "Rüde"],
    ["Welches dieser Tiere kann aktiv fliegen?", "Fledermaus", "Flughörnchen", "Flugdrache", "Gleitbeutler"],
    ["Wie viele Beine hat eine Spinne?", "8", "6", "10", "12"],
    ["Welche Farbe hat das Blut eines Hummers?", "Blau", "Rot", "Grün", "Gelb"],
    ["Aus welcher Pflanzenfamilie stammt die Vanille?", "Orchideen", "Palmen", "Lilien", "Rosen"],
    ["Wie lange ist eine Elefantenkuh ungefähr trächtig?", "22 Monate", "9 Monate", "12 Monate", "36 Monate"],
    ["Welches ist das schnellste Landtier?", "Gepard", "Löwe", "Gabelbock", "Windhund"],
    ["Wovon ernähren sich Große Pandas hauptsächlich?", "Bambus", "Fisch", "Insekten", "Beeren"],
    ["Wie heißt der Vorgang, bei dem Pflanzen aus Licht Zucker herstellen?", "Photosynthese", "Osmose", "Fermentation", "Mitose"]
  ],
  "Wissenschaft": [
    ["Welches chemische Symbol hat Gold?", "Au", "Ag", "Go", "Gd"],
    ["Wie viele Planeten hat unser Sonnensystem?", "8", "7", "9", "10"],
    ["Welcher Planet ist der Sonne am nächsten?", "Merkur", "Venus", "Mars", "Erde"],
    ["Bei wie viel Grad Celsius siedet Wasser auf Meereshöhe?", "100", "90", "110", "80"],
    ["Welches Gas nehmen Pflanzen für die Photosynthese auf?", "Kohlendioxid", "Sauerstoff", "Stickstoff", "Helium"],
    ["Wie viele Knochen hat ein erwachsener Mensch ungefähr?", "206", "106", "306", "156"],
    ["Wie schnell ist Licht im Vakuum ungefähr?", "300.000 km/s", "30.000 km/s", "3.000 km/s", "3 Mio. km/s"],
    ["Was misst man in Hertz?", "Frequenz", "Spannung", "Druck", "Leistung"],
    ["Welches Organ produziert Insulin?", "Bauchspeicheldrüse", "Leber", "Niere", "Milz"],
    ["Wer stellte die Relativitätstheorie auf?", "Albert Einstein", "Isaac Newton", "Max Planck", "Niels Bohr"],
    ["Welches Element hat die Ordnungszahl 1?", "Wasserstoff", "Helium", "Sauerstoff", "Kohlenstoff"],
    ["Welcher ist der größte Planet im Sonnensystem?", "Jupiter", "Saturn", "Neptun", "Uranus"]
  ],
  "Sport": [
    ["Wie viele Spieler einer Fußballmannschaft stehen gleichzeitig auf dem Feld?", "11", "10", "9", "12"],
    ["Wo fanden die Olympischen Sommerspiele 2024 statt?", "Paris", "Los Angeles", "Tokio", "London"],
    ["Wie oft wurde die deutsche Männer-Nationalmannschaft Fußball-Weltmeister?", "4", "3", "5", "2"],
    ["Wie lang ist ein Marathon?", "42,195 km", "40 km", "45,5 km", "38,2 km"],
    ["In welcher Sportart gibt es einen „Albatros“?", "Golf", "Tennis", "Segeln", "Cricket"],
    ["Wie viele Ringe zeigt die olympische Flagge?", "5", "4", "6", "7"],
    ["Welche Kugel ist beim Snooker am meisten wert?", "Schwarz", "Pink", "Blau", "Grün"],
    ["Wie viele Punkte bringt ein Touchdown im American Football?", "6", "7", "3", "5"],
    ["Welches Grand-Slam-Turnier wird auf Rasen gespielt?", "Wimbledon", "French Open", "US Open", "Australian Open"],
    ["Wie viele Felder hat ein Schachbrett?", "64", "49", "81", "100"],
    ["Wie viele Spieler pro Team stehen beim Basketball auf dem Feld?", "5", "6", "7", "4"],
    ["Aus welchem Land stammt Judo?", "Japan", "China", "Korea", "Thailand"]
  ],
  "Film & Musik": [
    ["Wie viele Saiten hat eine normale Gitarre?", "6", "4", "5", "8"],
    ["Welcher Komponist wurde in Bonn geboren?", "Ludwig van Beethoven", "Wolfgang Amadeus Mozart", "Johann Sebastian Bach", "Johannes Brahms"],
    ["Welche Band veröffentlichte „Bohemian Rhapsody“?", "Queen", "The Beatles", "ABBA", "Pink Floyd"],
    ["Wie viele Tasten hat ein normales Klavier?", "88", "76", "92", "100"],
    ["In welcher Stadt steht das Opernhaus mit dem segelförmigen Dach?", "Sydney", "Oslo", "Kopenhagen", "Hamburg"],
    ["Wer komponierte „Die Zauberflöte“?", "Wolfgang Amadeus Mozart", "Richard Wagner", "Giuseppe Verdi", "Joseph Haydn"],
    ["Welcher Film gewann 1998 elf Oscars?", "Titanic", "Forrest Gump", "Gladiator", "Braveheart"],
    ["Welcher Preis wird bei der Berlinale vergeben?", "Goldener Bär", "Goldene Palme", "Goldener Löwe", "Goldene Kamera"],
    ["Aus welchem Land kommt die Band ABBA?", "Schweden", "Norwegen", "Dänemark", "Finnland"],
    ["Welcher Notenschlüssel heißt auch G-Schlüssel?", "Violinschlüssel", "Bassschlüssel", "Altschlüssel", "Tenorschlüssel"],
    ["Wie viele Musiker spielen in einem Quartett?", "4", "3", "5", "6"],
    ["Wie heißt die Zauberschule in den Harry-Potter-Büchern?", "Hogwarts", "Durmstrang", "Beauxbatons", "Ilvermorny"]
  ],
  "Essen & Trinken": [
    ["Aus welchem Land stammt die Pizza Margherita?", "Italien", "Frankreich", "Spanien", "Griechenland"],
    ["Was ist die Hauptzutat von Guacamole?", "Avocado", "Tomate", "Paprika", "Erbse"],
    ["Welches Gewürz gilt nach Gewicht als das teuerste?", "Safran", "Vanille", "Zimt", "Kardamom"],
    ["Aus welcher Frucht wird Cidre gemacht?", "Apfel", "Birne", "Traube", "Pflaume"],
    ["Woraus wird Tofu hergestellt?", "Sojabohnen", "Kichererbsen", "Reis", "Weizen"],
    ["Aus welchem Getreide wird schottischer Malt Whisky gebrannt?", "Gerste", "Mais", "Roggen", "Hafer"],
    ["Aus welchem Gemüse wird Sauerkraut gemacht?", "Weißkohl", "Rotkohl", "Wirsing", "Blumenkohl"],
    ["Was wird geschlagen, um Butter herzustellen?", "Sahne", "Milch", "Joghurt", "Quark"],
    ["Von welchem Kontinent stammt die Kartoffel?", "Südamerika", "Europa", "Asien", "Afrika"],
    ["Welche Nuss ist der Hauptbestandteil von Marzipan?", "Mandel", "Haselnuss", "Walnuss", "Erdnuss"],
    ["Aus welcher Bohne wird Schokolade gemacht?", "Kakaobohne", "Kaffeebohne", "Vanilleschote", "Sojabohne"],
    ["Aus welchem Land stammt Sushi?", "Japan", "China", "Korea", "Vietnam"]
  ],
  "Sprache & Wörter": [
    ["Wie viele Buchstaben hat das deutsche Alphabet ohne Umlaute und ß?", "26", "24", "28", "30"],
    ["Welches Wort liest sich vorwärts und rückwärts gleich?", "Reliefpfeiler", "Bananenbrot", "Regenbogen", "Kuckuck"],
    ["Was bedeutet „carpe diem“?", "Nutze den Tag", "Ruhe in Frieden", "Ich kam, sah, siegte", "Im Wein liegt Wahrheit"],
    ["Welches Wort ist ein Anagramm von „Lampe“?", "Palme", "Pumpe", "Lampion", "Tempel"],
    ["Wie nennt man ein Wort mit gegenteiliger Bedeutung?", "Antonym", "Synonym", "Homonym", "Akronym"],
    ["Welche Sprache hat die meisten Muttersprachler?", "Chinesisch", "Englisch", "Spanisch", "Hindi"],
    ["Wie viele Fälle hat die deutsche Grammatik?", "4", "3", "5", "6"],
    ["Welches Satzzeichen nennt man auch „Gänsefüßchen“?", "Anführungszeichen", "Bindestrich", "Semikolon", "Klammer"],
    ["In welcher Schrift wird Russisch geschrieben?", "Kyrillisch", "Lateinisch", "Griechisch", "Arabisch"],
    ["Wie lautet eine korrekte Mehrzahl von „Atlas“?", "Atlanten", "Atlase", "Atlässe", "Atlae"],
    ["Aus welcher Sprache hat das Englische „Kindergarten“ übernommen?", "Deutsch", "Niederländisch", "Dänisch", "Französisch"],
    ["Was ist ein „Akronym“?", "Ein Kurzwort aus Anfangsbuchstaben", "Ein Wort mit zwei Bedeutungen", "Ein Reimwort", "Ein Fremdwort"]
  ],
  "Technik & Erfindungen": [
    ["Wer meldete 1886 das erste Automobil mit Benzinmotor zum Patent an?", "Carl Benz", "Gottlieb Daimler", "Henry Ford", "Rudolf Diesel"],
    ["Wofür steht „WWW“?", "World Wide Web", "Wide World Web", "Web World Wide", "World Web Wire"],
    ["Wie viele Bit hat ein Byte?", "8", "4", "16", "10"],
    ["Wer baute 1941 den Z3, einen der ersten programmierbaren Rechner?", "Konrad Zuse", "Alan Turing", "Charles Babbage", "John von Neumann"],
    ["Wofür steht „GPS“?", "Global Positioning System", "General Path Service", "Global Pilot Signal", "Grid Position Scan"],
    ["Wer erhielt 1876 das Patent auf das Telefon?", "Alexander Graham Bell", "Thomas Edison", "Nikola Tesla", "Philipp Reis"],
    ["Wer flog 1903 das erste gesteuerte Motorflugzeug?", "Die Brüder Wright", "Otto Lilienthal", "Graf Zeppelin", "Louis Blériot"],
    ["Was entdeckte Wilhelm Conrad Röntgen 1895?", "X-Strahlen", "Radioaktivität", "Das Elektron", "Penicillin"],
    ["Aus welchem Element bestehen Computerchips hauptsächlich?", "Silizium", "Kupfer", "Gold", "Aluminium"],
    ["Wer entdeckte das Penicillin?", "Alexander Fleming", "Robert Koch", "Louis Pasteur", "Marie Curie"],
    ["Wofür steht „USB“?", "Universal Serial Bus", "Unified System Board", "Universal Signal Box", "User Serial Base"],
    ["Welche Firma brachte 2007 das erste iPhone heraus?", "Apple", "Samsung", "Nokia", "Microsoft"]
  ]
};
