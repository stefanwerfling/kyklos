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

### N3 — Git-Adapter (nur lesend)  ✅ erledigt
- `GitAdapter` (`src/Runner`): komponiert den Shell-Adapter (bin fix auf `git`), erlaubt nur lesende
  Subkommandos (status/describe/log/diff/rev-parse/branch/show/remote/config/ls-files), verweigert
  Schreibzugriffe; `permissionTier: read`.
- **Akzeptanz (erfüllt, verifiziert 2026-10-28):** echtes `git rev-parse --abbrev-ref HEAD` läuft und
  wird erfasst; ein Schreib-Subkommando (`commit`) ergibt `not_executable`.

### N4 — Browser-Adapter  ✅ erledigt (Library + echter Browser-Nachweis)
- `BrowserAdapter` + `BrowserDriver`-Kontrakt + `BrowserInspection` (`src/Runner`); keine harte
  Playwright-Abhängigkeit — Treiber injizieren, sonst `not_executable` mit "`npm i -D playwright`". Neues
  `browserHealthy`-Kriterium: eine Seite besteht nur, wenn erreichbar, konsolenfehlerfrei, requestfehlerfrei
  und Titel passt — ein 200 allein ist nie ein Pass.
- **Echter Browser-Nachweis (diese Session):** lokale Seite ausgeliefert und **echtes Chromium** via
  claude-in-chrome-MCP gesteuert — Titel/DOM/Konsole (0 Fehler) gelesen, Klick-Benutzerablauf ausgeführt
  (`idle`→`clicked`, Konsole loggte den Klick), Screenshot erfasst. Diese echten Beobachtungen dann durch
  `BrowserAdapter` + `browserHealthy` → passed; eine Konsolenfehler-Variante → failed.
- **Akzeptanz (erfüllt):** ein Browser-Test lief in einem echten Browser; die healthy/broken-Unterscheidung
  hält. Playwright ist nicht installiert → ein `PlaywrightDriver` ist die dokumentierte Produktiv-Integration.

### N5 — Emulator-Adapter (capability-gated)  ✅ erledigt
- `EmulatorAdapter` + `EmulatorDriver`-Kontrakt + `AdbEmulatorDriver` (echtes `adb devices` über den
  allow-gelisteten Shell-Adapter) — `src/Runner`. Kein Treiber / kein Gerät → `not_executable` mit
  konkretem nächsten Schritt.
- **Akzeptanz (erfüllt, verifiziert 2026-10-28):** mit dem echten adb-Treiber meldet er ehrlich
  `no_device_or_avd` (kein AVD in dieser Umgebung); ein Fake-Treiber mit Gerät führt aus. Kein
  Emulator-Ergebnis ohne Gerät.

### N6 — Fix-Zyklus (strukturierte Fehleranalyse + Re-Verifikation)  ✅ erledigt
- `FixCycle` (`src/Learning`): ursprünglichen Fehler reproduzieren → ähnliche frühere Incidents suchen
  (`IncidentRepository`) → minimale externe Korrektur anwenden (Callback, im genehmigten Umfang) → erneut
  ausführen → neu bewerten, ob die Abweichung weg ist → Restrisiko dokumentieren. Eine Korrektur, die nie
  reproduzierte, wird nie als verifiziert behauptet.
- **Akzeptanz (erfüllt, verifiziert 2026-10-28):** ein reproduzierbarer Fehler wird reproduziert, korrigiert
  und re-verifiziert (resolved); eine No-op-Korrektur bleibt `unresolved`; ein nicht-reproduzierender Fall
  ist `not_reproducible`; frühere Incidents erscheinen per Signatur.

### N7 — Orchestrator + LLM-Grenze (optional, nur beratend)  ✅ erledigt
- `Orchestrator` (`src/Orchestration`) führt den Check-Plan deterministisch aus und leitet den Zyklus-Status
  NUR aus Runner-Ergebnissen über den Gatekeeping-Resolver ab; erfasst Zyklus-Metriken (checkCount,
  durationMs, llmCalls). `LlmAdvisor`-Interface + `NullLlmAdvisor` liefern nur Vorschläge/Diagnosen — nie
  eine `Observation`, nie einen Status.
- **Akzeptanz (erfüllt, verifiziert 2026-10-28):** voller Zyklus läuft ohne Advisor (llmCalls 0); ein
  bösartiger Advisor mit „alles bestanden" lässt einen failed-Status Failed — das LLM kann kein Ergebnis
  kippen. Ergebnis-Wiederverwendung / Parallelität unabhängiger Checks sind spätere Verfeinerungen.

### N8 — Report/UI  ✅ erledigt (deterministischer Report, reichere UI später)
- `ReportBuilder` (maschinenlesbarer `CycleReport`: Checks mit ihren Deviations verlinkt, offene Risiken) +
  `HtmlReportRenderer` (self-contained HTML; aller dynamische Text HTML-escaped — nicht vertrauenswürdige
  Inhalte sind Daten, nie Markup; fehlschlagende Checks verlinken auf ihre Deviation-Anker) — `src/Report`.
- **Akzeptanz (erfüllt, verifiziert 2026-10-28):** baut Report, verlinkt Checks↔Deviations, rendert HTML,
  das ein `<script>`-Payload escaped, deterministisch; belegt an echtem Zyklus (12 Checks, 1 Deviation →
  passed_with_deviations → approve, offenes Risiko gelistet). Reichere interaktive UI ist späterer Meilenstein.

### N9 — Sicherheits-/Audit-Härtung + E2E  ✅ erledigt (erster Durchgang)
- `PermissionPolicy` (Tier-Obergrenze; `src/Security`) im `ProcessRunner` erzwungen: eine Aktion über der
  Grenze wird `not_executable` protokolliert, ohne zu laufen — nie stiller Pass, nie stille Ausführung.
  Untrusted-Content wird als Daten behandelt (HTML-Escaping N8; Adapter-Allowlists; nur-beratendes LLM N7).
  Ein E2E-Test fährt discovery → engine → gatekeeping → report → render → release.
- **Akzeptanz (erfüllt, verifiziert 2026-10-28):** Permission-Denial blockt ein zu hohes Tier; die volle
  E2E-Kette besteht für sauberen Lauf (approve) und fehlschlagenden Lauf (reject mit offenen Risiken); 166 Tests grün.
- Folgeschritte: destruktive/produktive Aktionen mit explizitem Freigabe- + Wiederherstellungs-Workflow und
  breitere Tier-Deklaration auf Adapter-Ebene bleiben zur weiteren Härtung.

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
