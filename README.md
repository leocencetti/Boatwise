# Boatwise

Un'applicazione web per esercitarsi con i quiz della patente nautica.

## Demo

[![Open Boatwise](https://img.shields.io/badge/Open-Boatwise-blue)](https://leocencetti.github.io/Boatwise/)

Click the button above to use the app now.


## Caratteristiche

- **Due tipologie di quiz:**
  - Quiz Base: domande a risposta multipla con 3 opzioni
  - Quiz Vela: domande vero/falso
  - Possibilità di esercitarsi con entrambe le categorie insieme

- **Modalità di visualizzazione:**
  - Sequenziale: i quiz vengono mostrati nell'ordine originale
  - Casuale: i quiz vengono mescolati per una pratica più varia

- **Funzionalità:**
  - Visualizzazione immagini associate ai quiz (quando presenti)
  - Evidenziazione della risposta corretta in caso di errore
  - Navigazione avanti/indietro tra i quiz
  - Contatore quiz completati

## Come Usare

1. Apri il file `app/index.html` in un browser web moderno

2. Nella schermata iniziale, seleziona:
   - **Tipo di Quiz**: Base, Vela, o Entrambi
   - **Ordine**: Sequenziale o Casuale

3. Clicca su "INIZIA QUIZ" per cominciare

4. Per ogni quiz:
   - Leggi la domanda (e l'immagine se presente)
   - Seleziona la risposta che ritieni corretta
   - Riceverai un feedback immediato
   - Usa i pulsanti "Precedente" e "Successivo" per navigare

5. Puoi tornare alla schermata di selezione in qualsiasi momento cliccando su "TORNA ALLA SELEZIONE"

## Struttura dei File

```
Boatwise/
├── app/
│   ├── data/
│   │   ├── quiz_base.csv                 # Quiz base
│   │   ├── quiz_vela.csv                 # Quiz vela
│   │   ├── quiz_base.rimossi_2024.csv    # Quiz base rimossi
│   │   └── figures/                      # Figure dei quiz
│   │       ├── 001.jpg
│   │       ├── 002.jpg
│   │       └── ...
│   ├── index.html                    # Struttura HTML dell'applicazione
│   ├── styles.css                    # Stili e layout
│   └── app.js                        # Logica dell'applicazione
└── README.md                         # Questa documentazione
```

## Browser Compatibilità

Testato e funzionante su:
- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+
