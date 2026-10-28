# Kyklos — LLM-Orchestrierung & automatisierte Verifikation: Analyse & Plan

> 🇬🇧 Englisches Original (primär/Standard): [kyklos-orchestration-plan.md](kyklos-orchestration-plan.md).
> Diese deutsche Fassung ist eine Übersetzung; bei Abweichungen gilt die englische. Stand: 2026-10-28.

Erweitert die Kyklos-Engine (M0–M7, bereits gebaut) um eine kontrollierte,
auditierbare Orchestrierungsschicht, die echte Werkzeuge ausführt, echte Nachweise
erfasst und das LLM strikt beratend hält. **Der deterministische Kern muss ohne LLM
weiter funktionieren.**

---

## 1. Was bereits existiert (wiederverwenden, nicht neu bauen)

| Fähigkeit | Ort | Deckt §|
|---|---|---|
| Adapter-Abstraktion (manual/shell/http/dry-run) mit Timeout + strukturiertem Outcome | `src/Runner` | §3 |
| Deterministische Zyklus-Ausführung + 6-Status-Mapping | `CycleEngine`, `CheckRunner` | §4 |
| Gatekeeping (kritisches Gate nie Auto-Pass) | `CycleStateResolver` | §4, §9 |
| Deterministische Freigabe aus Ergebnissen + Override | `ReleaseGate` | §9 |
| Evidence (sha256), Observation, Deviation, append-only + immutable Store | `src/Domain`, `FileStore` | §9, §11 |
| Incident-Signaturen + Ähnlichkeitssuche (ohne KI) | `src/Learning` | §7, §8 |
| Validierungs-gated Verbesserungsvorschläge | `ProposalService`, `ChecklistAmender` | §7, §8 |
| Projektübergreifende Lesson-Übertragung + Secret/PII-Block | `LessonTransfer`, `LessonSanitizer` | §8, §11 |
| Kern läuft bereits ohne LLM | gesamte Engine | §10 |

Der Spec ist überwiegend eine **Erweiterung**, kein Rewrite: neue Tool-Adapter,
CLI-Test-Erkennung, Browser-/Emulator-Adapter, eine Evidence-Provenance-Stufe,
Tool-Ausführungsdatensätze, ein Fix-Zyklus, eine optionale LLM-Berater-Grenze und eine UI.

## 2. Laufzeit-Bestandsaufnahme (geprüft 2026-10-28)

| Tool | Verfügbar | Verwendung in Kyklos |
|---|---|---|
| node / npm / npx / git / make / docker / python3 / java / rustc | ja | CLI- + Git-Adapter (echt, jetzt) |
| chromium / google-chrome / firefox (Binaries) | ja | echte Browser vorhanden |
| Playwright (npm) | **nein** | Browser-Adapter braucht `npm i -D playwright`; bis dahin → not_executable |
| adb | ja | Android-Steuerung möglich |
| `emulator`-Binary / AVD | **nein** | **kein Emulatorlauf möglich → not_executable melden, nie einen Lauf behaupten** |
| flutter | ja (kein AVD) | Flutter-Pfad erst mit Gerät/AVD |
| claude-in-chrome MCP | ja (Agent-Session) | Live-Browser-Demonstration in einer Session, als Nachweis erfasst |

**Regel eingehalten:** ein fehlendes Tool ergibt einen `not_executable`-Check mit
konkreter Alternative; nie stillschweigend bestanden.

## 3. Neue Domänenkonzepte (klein, additiv)

- `EvidenceSource` — Provenance-Stufe eines Nachweises, damit eine LLM-Behauptung nie als
  verifiziertes Ergebnis auftreten kann (§9):
  `llm_assertion` · `tool_execution` · `machine_verified` · `manually_confirmed` · `not_executable`.
- `PermissionTier` — benötigte Autorität einer Tool-Aktion (§11):
  `read` · `temp_test` · `local_write` · `shared` · `external` · `production`.
- `ToolExecution` — der konkrete Ausführungsdatensatz, auf den jedes Ergebnis zurückführbar ist (§9):
  Adapter, Kommando, exitCode, status, startedAt/endedAt, durationMs, gekürztes stdout/stderr +
  deren sha256, permissionTier, cycleId, checkId.
- `ResultKind` erweitert die sechs Status um `partial`, wo ein Runner es meldet (§4).

## 4. Meilensteine (verankert in der tatsächlichen Umgebung)

> Jeder Meilenstein: klein, überprüfbar, grün `lint`/`typecheck`/`test`/`build`.
> Zuerst der echte End-to-End-Pfad; Adapter nur dort ergänzen, wo die Umgebung sie trägt.

### N1 — Evidence-Provenance, Permission-Stufen, Tool-Ausführungsdatensatz  ✅ erledigt
- `EvidenceSource`-, `PermissionTier`-Enums; `source` auf `Evidence`; `ToolExecution`-Schema
  (`src/Domain`); `ToolExecutionRecorder` (gekürzte Anzeige, sha256 über volle Ausgabe),
  `EvidenceFactory` (`fromToolExecution` / `llmAssertion` / `notExecutable`) — `src/Execution`.
- **Akzeptanz (erfüllt, verifiziert 2026-10-28):** ausgeführte Aktionen erzeugen ein `ToolExecution` +
  `Evidence{source: tool_execution}`; eine LLM-Aussage kann nur `Evidence{source: llm_assertion}` sein;
  nicht ausführbare Checks behalten einen `not_executable`-Nachweis; 134 Tests grün.

### N2 — Kommando-Erkennung + CLI-Testlauf (der echte durchgängige Pfad)  ✅ erledigt
- `CommandDiscovery` (liest `package.json`-Scripts; ordnet günstig→teuer: lint → typecheck →
  test → build/compile; erfindet nichts), `ProcessRunner` (läuft über den allow-gelisteten
  Shell-Adapter, misst Dauer, baut `ToolExecution`, mappt nicht-ausgeführt → `not_executable`) — `src/Execution`.
- **Akzeptanz (erfüllt, verifiziert 2026-10-28):** belegt durch einen ECHTEN Lauf gegen Kyklos' eigenes
  package.json — 5 CLI-Checks erkannt und `npm run typecheck` ausgeführt (exit 0, status passed,
  durationMs 1347, `source: tool_execution`). Makefile-Erkennung ist Folgeschritt. Volle CycleEngine-
  Integration der ToolExecution-Persistenz folgt später (N7).

### N3 — Git-Adapter (nur lesend)
- `GitAdapter` (status/describe/log/diff --stat), `permissionTier: read`.
- **Akzeptanz:** echte Git-Fakten als `tool_execution`-Evidence erfasst.

### N4 — Browser-Adapter
- `BrowserAdapter`-Kontrakt + `PlaywrightDriver` hinter optionaler `playwright`-Abhängigkeit; fehlt sie
  → `not_executable` mit "`npm i -D playwright`" als konkreter Alternative. Checks: zentraler
  Benutzerablauf, DOM/sichtbarer Zustand, Konsolenfehler, fehlgeschlagene Requests, Screenshot-Nachweis.
- Ein echter Browserlauf wird in dieser Session via claude-in-chrome-MCP gegen eine lokal
  ausgelieferte Seite demonstriert und als Nachweis erfasst. **Nie einen nicht erfolgten Browserlauf behaupten.**
- **Akzeptanz:** ein Browser-Test läuft tatsächlich in einem echten Browser, wo die Umgebung es trägt;
  ein 200-Status allein gilt nie als Nachweis einer funktionierenden UI.

### N5 — Emulator-Adapter (capability-gated)
- `EmulatorAdapter`-Kontrakt + Android(adb)-Treiber; erkennt kein laufendes Gerät/AVD → `not_executable`,
  dokumentiert. **Kein Emulator-Ergebnis ohne nachweisbaren Emulatorlauf.**

### N6 — Fix-Zyklus (strukturierte Fehleranalyse + Re-Verifikation)
- `FixCycle`: Fehler erfassen → reproduzieren → kleinster Repro → frühere Incidents suchen → priorisierte
  Hypothesen mit Unsicherheit → minimale Korrektur (Vorschlag; Implementierung im genehmigten Umfang) →
  betroffene Checks erneut → Regression → ursprüngliche Abweichung neu bewerten → Restrisiko dokumentieren.
- **Akzeptanz:** ein reproduzierbarer Fehler wird erkannt, eine Korrektur re-verifiziert und die
  ursprüngliche Abweichung nach der Korrektur neu bewertet; nicht ausgeführte Checks bleiben sichtbar.

### N7 — Orchestrator + LLM-Grenze (optional, nur beratend)
- `Orchestrator` führt deterministische Checks ohne LLM aus, erfasst Kosten/Laufzeit pro Zyklus, nutzt
  gültige frühere Ergebnisse, fährt betroffene-dann-Regression, parallelisiert unabhängige sichere Checks.
  `LlmAdvisor`-Interface liefert nur Vorschläge/Pläne — nie eine `Observation`, nie eine Statusänderung.
- **Akzeptanz:** voller Zyklus läuft mit deaktiviertem LLM; das LLM kann nie ein Ergebnis kippen.

### N8 — Report/UI
- Start mit einem deterministischen maschinenlesbaren + HTML-Report eines Zyklus (Status, Checks,
  Nachweise, Abweichungen, Entscheidung, ähnliche frühere Fälle, offene Risiken) mit funktionierenden
  Links Nachweis↔Analyse. Eine reichere interaktive UI folgt.

### N9 — Sicherheits-/Audit-Härtung + E2E
- `PermissionTier` auf jedem Adapter erzwingen; Repo-/Web-/Log-Inhalte als nicht vertrauenswürdige Daten
  (nie Anweisungen); destruktive/produktive Aktionen brauchen explizite Freigabe + Wiederherstellungspfad; E2E-Tests.

## 5. Sicherheit & Schutz vor Falscherfolg (querschnittlich, ab Tag 1)

- Die Trennung der `EvidenceSource`-Stufen ist das Rückgrat: das LLM ändert nie per Behauptung einen
  Status; die Freigabe wird deterministisch von `ReleaseGate` aus Ergebnissen + Checklisten-Version +
  Kritikalität abgeleitet.
- Nicht vertrauenswürdige Inhalte (Repos, Seiten, Logs, Testausgaben) sind Daten, keine Anweisungen; sie
  dürfen Berechtigung oder Umfang des Agenten nicht erweitern.
- Fehlendes Tool → `not_executable` + konkrete Alternative, nie stiller Pass.

## 6. Diese Session

Liefert N1 + N2 (der echte End-to-End-CLI-Pfad mit Provenance und Ausführungsdatensätzen), getestet und
grün, plus einen aufgezeichneten echten Lauf von Kyklos' eigenen Scripts. N3+ folgen in kleinen Schritten.
UI (N8) und die echte LLM-Anbindung (N7) sind spätere, größere Meilensteine.
