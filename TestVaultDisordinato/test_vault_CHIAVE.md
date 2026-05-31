# CHIAVE DI CORREZIONE — non guardare prima di far girare il Hunter

> Questo è l'elenco delle contraddizioni seminate nel vault di test, con tipo e difficoltà. Confronta l'output del Hunter contro questa lista DOPO averlo lanciato. Misura: quante ne trova (recall), se le ordina bene per confidence, e se genera falsi positivi sul rumore.

---

## Contraddizioni REALI seminate (cosa il Hunter DOVREBBE trovare)

### CN1 — NETTA, diretta (facile). Decisioni di pancia vs ponderate
- Elemento 1 ("decisioni di pancia, l'istinto raramente sbaglia") ↔ Elemento 3 ("decisioni d'impulso, errore 3x superiore a quelle ponderate")
- Contraddizione frontale, quasi esplicita. Se il Hunter NON trova questa, c'è un problema serio. Confidence attesa: alta.

### CN2 — NETTA. Talento vs disciplina
- Elemento 5 ("la disciplina conta più del talento, l'impegno supera il predestinato pigro") ↔ Elemento 7 ("il talento è tutto, senza dono naturale resti mediocre")
- Opposizione diretta su quale fattore conta. Confidence attesa: alta.

### CN3 — MEDIA. Fai da solo vs delega
- Elemento 12 substrate ("delegare è la chiave, chi fa tutto da solo non scala") ↔ Elemento 13 ("se vuoi una cosa fatta bene falla da solo")
- Contraddizione chiara ma espressa con registri diversi (uno teorico/aforisma, uno pratico). Una è substrate, l'altra è nota ambigua. Confidence attesa: medio-alta.

### CN4 — MEDIA, substrate↔substrate (IL TEST CHIAVE). Risparmio
- Elemento 16 substrate ("risparmiare ossessivamente è falsa economia, il tempo vale più dello sconto") ↔ Elemento 17 ("compro sempre il più economico, ogni centesimo risparmiato è guadagnato")
- ⚠️ QUESTA è la verifica del dubbio aperto: il Hunter scansiona i substrate TRA LORO o solo contro le tensioni? Se trova CN1/CN2 ma NON questa, conferma l'ipotesi che il confronto substrate-substrate manca. Confidence attesa: media.

### CN5 — SOTTILE (difficile). Tempo: Seneca vs carpe diem
- Elemento 10 substrate (Seneca: "la vita è abbastanza lunga se sai usarla, pianifica bene il tempo") ↔ Elemento 11 ("la vita è troppo breve per pianificare, godi l'attimo")
- Contraddizione vera ma più filosofica e meno lessicalmente evidente — richiede di capire che "usare bene il tempo pianificando" si oppone a "non pianificare, vivi l'attimo". È il test per il ragionamento sottile. Con un LLM debole, plausibile che la salti o le dia confidence bassa. Confidence attesa: bassa-media. Se la trova, il modello ragiona bene.

---

## RUMORE — elementi che NON devono generare contraddizioni (test falsi positivi)

- Elemento 4 (latte, pane, idraulico) — nota operativa innocua
- Elemento 9 (caffè, colore blu) — preferenze neutre
- Elemento 14 (dormito male, riunione) — nota operativa
- Elemento 18 (AI cambierà tutto) — opinione isolata, nessun opposto nel vault

Se il Hunter accoppia uno di questi con qualcosa come "contraddizione", è un FALSO POSITIVO. Un buon Hunter li ignora.

---

## Tensioni già marcate come tali (NON sono il lavoro del Hunter trovarle, sono già aperte)
- Elemento 2 (remoto vs ufficio), Elemento 8 (esperienze vs beni), Elemento 15 (social perdita di tempo vs investimento)
- NB: l'elemento 6 (substrate sulla produttività) tocca lo stesso tema dell'elemento 2 (remoto/ufficio/produttività). Il Hunter POTREBBE collegarli — non è un errore, è una connessione legittima debole. Valuta se la trova e con che confidence: è un bonus, non un obbligo.

---

## Come misurare il risultato
- **Recall su contraddizioni nette (CN1, CN2):** se ne manca anche una, problema serio.
- **CN4 (substrate↔substrate):** la trova? → scansione completa. Non la trova ma trova le altre? → conferma il buco substrate-substrate.
- **CN5 (sottile):** la trova? → il modello locale ragiona bene anche debole. La salta? → probabile limite del modello, non del design.
- **Falsi positivi sul rumore:** zero è l'ideale. Qualcuno è tollerabile se a bassa confidence.
- **Ordinamento confidence:** le nette (CN1, CN2) dovrebbero stare sopra la sottile (CN5).
