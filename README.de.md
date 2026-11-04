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

Die deterministische Engine (M0–M7) und die Orchestrierungsschicht (N1–N9) sind
implementiert und automatisiert getestet (179 Vitest-Tests; `build`/`lint`/`typecheck`
grün). Der Kern läuft **ohne LLM**; ein LLM ist, falls vorhanden, nur beratend und
kann nie ein Ergebnis ändern.

Jede Fähigkeit ist danach beschriftet, wie weit sie tatsächlich reicht:

| Fähigkeit | Stand |
|---|---|
| Domänenmodell, versionierte Checklisten, deterministische Ausführung & Gatekeeping | **implementiert, automatisiert getestet** |
| Playbook-Modell & Auflösung (W1): versionierte, komponierbare Playbooks, die Procedures/Playbooks referenzieren, pro Zielsystem auflösen und zur bestehenden Checkliste kompilieren — Engine unverändert | **implementiert, automatisiert getestet** (Resolver, Compiler, Zyklus-Erkennung, sealed-Regel-Enforcement, ExecutionPlan-Provenienz) |
| Workflow-Engine (W2): Phasen über Cycles mit Abhängigkeiten, optionalen/Recovery-Phasen, Phase-Gate aus dem Cycle-Status, Rollback bei Fehlschlag und **Resume** über append-only PhaseRuns — jede Phase läuft über den unveränderten PlanExecutor/CycleEngine | **implementiert, automatisiert getestet** (WorkflowStateResolver, WorkflowEngine, ResumeManager; echte PlanExecutor-Integration) |
| Task- & Delegations-Modell (W3): Ausführungsmodi (automatic/llm-assisted/manual/delegated/approval), abgeleiteter Task-Lebenszyklus, fail-closed Zuweisung/Feedback und echte Approvals, die Freigaben decken — ein menschlicher Task wird nur über validiertes Feedback/Approval `completed` (nie per Flag) und mündet in eine Observation + `manually_confirmed`-Evidence | **implementiert, automatisiert getestet** (TaskStateResolver, TaskService, ApprovalService; ReleaseGate unverändert) |
| Geschichtetes Knowledge & Learning (W4): Wissen gescoped global/system/technology/project über komponierte FileStores (Präzedenz project→global), Cross-Scope-Widerspruchserkennung, Diagnosis-Entität, kontrollierte Promotion (validiert + secret-frei + autorisierte Approval) und secret-sicherer Export/Import | **implementiert, automatisiert getestet** (LayeredKnowledgeStore, LessonRepository, ContradictionDetector, KnowledgePromotion, KnowledgeSync; reuse LessonSanitizer/LessonTransfer/Approval) |
| Environments & Update-Wellen (W5): content-adressierte Artefakte (der Digest ist die Identität, sodass das getestete Digest als das deployte erzwungen werden kann), ein Environment-Register über Zielsysteme und Workflow-Rollouts über geordnete Wellen — eine Welle besteht nur, wenn jedes Environment bestanden hat, eine fehlgeschlagene Welle blockiert den Rest | **implementiert, automatisiert getestet** (ArtifactRegistry, ArtifactVerifier, EnvironmentRegistry, WaveController; jedes Environment läuft über die unveränderte WorkflowEngine) |
| Approvals & Rollen / RBAC (W6): eine versionierte Role (Capabilities + Tier-Obergrenze) und ein zentraler fail-closed Entscheidungspunkt, der die Capabilities eines Actors vereinigt — eine Produktionsfreigabe braucht eine eigene Capability, und der Freigeber darf nicht die Person sein, die die Arbeit ausgeführt hat (Funktionstrennung) | **implementiert, automatisiert getestet** (Role, Capability, RoleRegistry, AuthorizationService; fail-closed in ApprovalService/TaskService verdrahtet, ReleaseGate unverändert) |
| Resume, Notify & Report (W7): ein Rollout nimmt aus seinen append-only Records wieder auf (bereits bestandene Environments werden wiederverwendet, ein fehlgeschlagenes/blockiertes Environment erneut ausgeführt), ein beratender Notifier, der ein Ergebnis nie ändern kann (Dispatch abgesichert, Nachrichten redigiert), und ein deterministischer Rollout-Report über denselben Wave-State-Resolver | **implementiert, automatisiert getestet** (WaveResumeManager, WaveStateResolver, Notifier/NullNotifier/RecordingNotifier, RolloutReportBuilder; nutzt LessonSanitizer, spiegelt den W2-ResumeManager) |
| Autonome Planung (W8): ein LLM darf ein ganzes Playbook/Workflow vorschlagen, aber der Vorschlag ist nie bindend — er wird als Draft gespeichert (Herkunft `llm_assertion`), deterministisch validiert (muss Draft sein, secret-frei und strukturell korrekt über den unveränderten Compiler/Dependency-Graph) und wird erst lauffähig, wenn ein Actor mit der `PublishPlan`-Capability ihn published | **implementiert, automatisiert getestet** (LlmAdvisor.proposePlan, PlanValidator, PlanProposalService; nutzt PlaybookCompiler/DependencyGraph/LessonSanitizer/AuthorizationService, Engines unverändert) |
| Freigabe, Abweichungen/Vorfälle, Ähnlichkeitssuche, Verbesserungsvorschläge, Lesson-Transfer | **implementiert, automatisiert getestet** |
| Evidence-Provenance + `ToolExecution` durch den ganzen Zyklus (persistiert, im Report referenziert) | **implementiert, automatisiert getestet** (echter `node`-Prozess-Integrationstest) |
| CLI-Adapter + Discovery (package.json-Scripts) | **implementiert, automatisiert getestet**; ein echtes `npm run typecheck` wurde ausgeführt und erfasst |
| Permission-Policy (fail-closed, Tier aus vertrauenswürdiger Aktion) | **implementiert, automatisiert getestet** |
| Git-Adapter (nur lesend) | **implementiert, automatisiert getestet** (echtes `git`) |
| Browser-Adapter + `browserHealthy` (strikt) + URL-Schema-/Host-Schutz | **implementiert, automatisiert getestet**; ein echter Chromium-Lauf wurde via Browser-Automatisierung **manuell nachgewiesen**. Ein `PlaywrightDriver` ist **offene Integration** (Playwright nicht installiert) |
| Emulator-Adapter | **nur Interface + Verfügbarkeitsprüfung**; App/User-Flow ausführen ist **offene Integration**. Kein AVD in dieser Umgebung → hier **nicht ausführbar** |
| HTML-Zyklus-Report (escaped, Links Nachweis↔Analyse) | **implementiert, automatisiert getestet**. Reichere interaktive UI ist **geplant** |
| LLM-Berater | **nur Interface** (`NullLlmAdvisor`); ein echter Claude-API-Berater ist **geplant** |
| Makefile/CI-Discovery, Docker/Paketmanager/Backup-Adapter, Parallelität/Caching/Kosten | **geplant** |

Legende: *implementiert* = Code vorhanden; *automatisiert getestet* = per Vitest abgedeckt;
*manuell nachgewiesen* = einmal von Mensch/Agent ausgeführt, nicht in CI; *nur Interface*
= Kontrakt ohne Produktiv-Treiber; *hier nicht ausführbar* = fehlende Infrastruktur;
*geplant* = nicht gebaut. Details im Orchestrierungsplan.

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

### Lokalisierte manuelle Schritte

Ein manueller Schritt zeigt dem Bediener einen Anweisungstext. `prompt` ist der
Standard (Englisch, gemäß Sprachregelung); `prompts` ergänzt Übersetzungen je
Sprachcode. `kyklos play --lang de` zeigt `prompts.de`, falls vorhanden, sonst
`prompt`, sonst die Check-Beschreibung. Definitionen nur mit `prompt` funktionieren
unverändert.

```json
"action": {"adapter": "manual", "params": {
  "prompt": "Load the add-on via about:debugging.",
  "prompts": {"de": "Add-on über about:debugging laden."}
}}
```

Die Sprache betrifft nur die Anzeige: Check-IDs, Evidence, Zyklus-Zustand und
Gate-Ergebnis sind für jedes `--lang` identisch. `${VAR}`-Platzhalter werden in
jedem `prompts`-Wert genauso aufgelöst wie in `prompt`. Die Auflösung ist über alle
Sprachen fail-closed: Ein unaufgelöster Platzhalter in irgendeiner Übersetzung macht
den Schritt unabhängig von `--lang` `not_executable` (`unresolved_var`).

## Dokumentation

- Analyse & Plan — Repository-Status, MVP-Abgrenzung, Domänenmodell,
  Ablaufdiagramm, Beispiel-Release-Checkliste, projektübergreifende
  Erfahrungswiederverwendung, Risiken und priorisierter Implementierungsplan:
  [`docs/kyklos-analysis-and-plan.de.md`](docs/kyklos-analysis-and-plan.de.md)
  (englisches Original: [`docs/kyklos-analysis-and-plan.md`](docs/kyklos-analysis-and-plan.md))

## Lizenz

MIT © Stefan Werfling
