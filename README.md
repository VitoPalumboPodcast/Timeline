# Timeline

Applicazione web a pagina singola che mostra una timeline interattiva della storia d'Italia dal 1848 al 1948.

## Struttura del progetto

- `index.html` inizializza il layout e carica gli asset esterni.
- `assets/css/timeline.css` contiene lo stile principale.
- `assets/js/timeline-data.js` espone i periodi e gli eventi della timeline.
- `assets/js/timeline.js` genera dinamicamente la timeline e gestisce zoom, trascinamento e minimappa.

Per aggiornare contenuti o aggiungere eventi futuri basta modificare `assets/js/timeline-data.js` senza toccare la logica o il layout.
