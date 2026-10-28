# Kyklos

> 🇬🇧 English version of this file: [README.md](README.md) *(primary/standard language)*

**Kyklos** (griech. *κύκλος*, „Zyklus") ist eine deterministische Prüf-,
Erfahrungs- und Verbesserungsengine für wiederkehrende technische Abläufe.
Sie führt definierte Prüflisten aus, dokumentiert Abweichungen, lernt aus
früheren Fehlern und schlägt kontrollierte Verbesserungen für zukünftige
Prüfzyklen vor.

Das erste Anwendungsgebiet ist die **sichere Softwareauslieferung**
(Vorbereitung, Backup & Wiederherstellung, Upgrade, Rollback, Deployment,
Freigabe-Gate). Die Architektur ist so angelegt, dass sie später auch
Serverwartung, Backup-Prüfungen, Datenmigrationen und andere wiederkehrende
technische Abläufe abdecken kann.

## Grundprinzip

Jeder Prüfzyklus erzeugt einen reproduzierbaren, auditierbaren Datensatz aus
ausgeführten Prüfungen, deren Ergebnissen, erwartetem vs. tatsächlichem
Zustand, Abweichungen, überprüfbaren Nachweisen (Logs, Testergebnisse,
Prüfsummen) und den getroffenen Entscheidungen.

Kyklos darf aus Erfahrungen Verbesserungen **vorschlagen**. Neue Regeln werden
niemals automatisch zu verbindlichen Freigabekriterien — sie erfordern zuerst
eine Validierung.

## Status

Frühe Entwicklung, vor dem MVP. Meilenstein **M0 (Projektgerüst)** ist umgesetzt:

- TypeScript (ESM, `NodeNext`, ES2022, strict)
- ESLint 9 + `@typescript-eslint` + `@stylistic` + `prefer-arrow` + `import`
- Vitest

Das Domänenmodell und die deterministische Zyklus-Engine folgen in M1–M4
(siehe Plan unten).

## Sprachregelung

**Englisch ist die primäre (Standard-)Sprache** für Code, Bezeichner und
Dokumentation. **Deutsch wird als Übersetzung bereitgestellt** (Dateien mit
Endung `.de`, z. B. [`README.de.md`](README.de.md)).

## Erste Schritte

```bash
npm install
npm run build       # TypeScript nach dist/ kompilieren
npm run typecheck   # Typprüfung ohne Ausgabe
npm run lint        # ESLint
npm test            # Vitest
```

## Beispiel: ein Release-Durchlauf

Das mitgelieferte `ReleaseExample` baut eine versionierte A–E-Release-Checkliste
(Vorbereitung, Backup & Wiederherstellung, Upgrade, Rollback, Deployment). Ausgeführt
mit der Dry-Run-Registry werden alle Adapter simuliert — die gesamte Checkliste läuft
end-to-end **ohne ein reales System zu berühren** und erzeugt einen auditierbaren,
append-only Zyklus-Datensatz. Gruppe F (Freigabe) ist das `ReleaseGate` auf den
entstandenen Zyklus.

```ts
import {
    CheckRunner, CycleEngine, FileStore, RandomIdGenerator,
    ReleaseExample, ReleaseGate, SystemClock
} from 'kyklos';

// Dry-Run: jeder Adapter wird simuliert — nichts wird wirklich ausgeführt.
const runner = new CheckRunner(ReleaseExample.dryRunRegistry());
const engine = new CycleEngine({
    runner: runner,
    idGenerator: new RandomIdGenerator(),
    clock: new SystemClock(),
    store: new FileStore('./.kyklos')
});

const result = await engine.run({
    project: ReleaseExample.project(),
    procedure: ReleaseExample.procedure(),
    checklist: ReleaseExample.checklist()
});

const decision = ReleaseGate.decide({
    cycle: result.cycle,
    ruleVersion: '1.0.0',
    decidedBy: 'release-gate',
    idGenerator: new RandomIdGenerator(),
    clock: new SystemClock()
});

console.log(result.cycle.state, decision.outcome); // z. B. "passed" "approve"
```

Für einen echten Durchlauf `ReleaseExample.dryRunRegistry()` durch eine `AdapterRegistry`
mit echten Adaptern ersetzen — `ShellAdapter` (mit Allowlist + Timeout), `HttpAdapter`,
`ManualAdapter`. Ein kritischer Check, der übersprungen, nicht ausführbar oder unbekannt
ist, wird nie automatisch `passed`: er erzwingt `manual_release_required`, das das Gate
nur mit autorisiertem, begründetem Override auflöst.

## Dokumentation

- Analyse & Plan — Repository-Status, MVP-Abgrenzung, Domänenmodell,
  Ablaufdiagramm, Beispiel-Release-Checkliste, projektübergreifende
  Erfahrungswiederverwendung, Risiken und priorisierter Implementierungsplan:
  [`docs/kyklos-analysis-and-plan.de.md`](docs/kyklos-analysis-and-plan.de.md)
  (englisches Original: [`docs/kyklos-analysis-and-plan.md`](docs/kyklos-analysis-and-plan.md))

## Lizenz

MIT © Stefan Werfling
