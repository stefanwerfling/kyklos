#!/usr/bin/env node
/**
 * kyklos — the Kyklos command-line entry point.
 *
 * Install once (`npm link` in the kyklos repo), then run `kyklos <command>`
 * from inside a project that has a .kyklos store. Paths default to the current
 * working directory, so from a project folder you just run `kyklos play`.
 *
 * Commands:
 *   kyklos play    [--store <dir>] [--manifest <file>] [--env <file>] [--lang en|de]
 *       Interactive: auto-run the checks, ask at each manual step, resume if
 *       interrupted. Needs a terminal.
 *   kyklos run     [--store <dir>] [--manifest <file>] [--env <file>] [--confirm <file>] [--lang en|de]
 *       Non-interactive (CI). Confirmations via --confirm <file>.
 *   kyklos dry-run [--store <dir>] [--manifest <file>] [--lang en|de]
 *       Simulate every adapter; no side effects.
 *
 * Defaults: --store ./.kyklos ; --manifest the single *.run.json in the store ;
 * --env <store>/.env when present ; --lang en. Output labels follow --lang. A
 * manual step shows `prompts[<lang>]` when its definition carries one, else the
 * default `prompt`, else the check description (ManualAdapter.selectPrompt).
 * The language is display-only: check IDs, evidence and the gate outcome are
 * identical for every --lang.
 */
import {existsSync, readFileSync, readdirSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {createInterface} from 'node:readline';
import {fileURLToPath} from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const lib = await import(join(here, '..', 'dist', 'index.js'));
const {DryRunner, FileStore, ManualAdapter, ManualConfirmationSchema, RandomIdGenerator, RealRunner, ReleaseGate, SystemClock} = lib;

const argv = process.argv.slice(2);
const command = argv[0];

const flag = (name, fallback) => {
    const at = argv.indexOf(name);
    return at >= 0 && argv[at + 1] !== undefined ? argv[at + 1] : fallback;
};

const lang = flag('--lang', 'en') === 'de' ? 'de' : 'en';

const MESSAGES = {
    en: {
        progress: 'progress:', manualStep: 'manual step', donePrompt: '  done? [y/N] ', notePrompt: '  note (what you did): ',
        cycle: 'cycle', gate: 'gate', checks: 'checks', compiled: 'compiled',
        notRunnable: 'not runnable — resolution/compilation failed',
        needsTty: 'play is interactive and needs a terminal. For non-interactive / CI use: kyklos run --confirm <file>',
        usage: 'kyklos <play|run|dry-run> [--store <dir>] [--manifest <file>] [--env <file>] [--lang en|de]',
        playHelp: '  play     interactive — auto-runs checks, asks at each manual step, resumes if interrupted',
        runHelp: '  run      non-interactive (CI); confirmations via --confirm <file>',
        dryHelp: '  dry-run  simulate every adapter; no side effects',
        status: {}, outcome: {}
    },
    de: {
        progress: 'Fortschritt:', manualStep: 'manueller Schritt', donePrompt: '  erledigt? [j/N] ', notePrompt: '  Notiz (was du getan hast): ',
        cycle: 'Zyklus', gate: 'Gate', checks: 'Checks', compiled: 'kompiliert',
        notRunnable: 'nicht ausführbar — Auflösung/Kompilierung fehlgeschlagen',
        needsTty: 'play ist interaktiv und braucht ein Terminal. Für nicht-interaktiv / CI: kyklos run --confirm <datei>',
        usage: 'kyklos <play|run|dry-run> [--store <dir>] [--manifest <file>] [--env <file>] [--lang en|de]',
        playHelp: '  play     interaktiv — führt Checks aus, fragt bei jedem manuellen Schritt, setzt nach Unterbrechung fort',
        runHelp: '  run      nicht-interaktiv (CI); Bestätigungen über --confirm <datei>',
        dryHelp: '  dry-run  simuliert jeden Adapter; keine Seiteneffekte',
        status: {
            // check status
            passed: 'bestanden', failed: 'fehlgeschlagen', unknown: 'offen', not_applicable: 'nicht zutreffend', skipped: 'übersprungen', not_executable: 'nicht ausführbar',
            // cycle state (passed / failed shared with the check status)
            prepared: 'vorbereitet', running: 'läuft', passed_with_deviations: 'bestanden mit Abweichungen', aborted: 'abgebrochen', manual_release_required: 'manuelle Freigabe nötig'
        },
        outcome: {approve: 'freigegeben', reject: 'abgelehnt', abort: 'abgebrochen', manual_release_required: 'manuelle Freigabe nötig'}
    }
};
const L = MESSAGES[lang];

const die = (message) => {
    console.error(message);
    process.exit(2);
};

const resolveStore = () => resolve(flag('--store', join(process.cwd(), '.kyklos')));

const resolveManifest = (storeDir) => {
    const explicit = flag('--manifest', undefined);
    if (explicit !== undefined) {
        return resolve(explicit);
    }
    const candidates = readdirSync(storeDir).filter((file) => file.endsWith('.run.json'));
    if (candidates.length === 1) {
        return join(storeDir, candidates[0]);
    }
    die(candidates.length === 0 ? `no *.run.json found in ${storeDir} (use --manifest)` : `multiple *.run.json in ${storeDir} (use --manifest): ${candidates.join(', ')}`);
    return undefined;
};

const resolveEnvFile = (storeDir) => {
    const explicit = flag('--env', undefined);
    if (explicit !== undefined) {
        return resolve(explicit);
    }
    const candidate = join(storeDir, '.env');
    return existsSync(candidate) ? candidate : undefined;
};

const loadEnv = (path) => {
    const env = {};
    if (path === undefined) {
        return env;
    }
    for (const line of readFileSync(path, 'utf8').split('\n')) {
        const trimmed = line.trim();
        if (trimmed !== '' && !trimmed.startsWith('#')) {
            const eq = trimmed.indexOf('=');
            if (eq > 0) {
                env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
            }
        }
    }
    return env;
};

const resolvePrompt = (text, env) => text.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/gu, (match, name) => env[name] ?? process.env[name] ?? match);

const ICON = {passed: '✓', failed: '✗', unknown: '→', not_applicable: '⧸', skipped: '·', not_executable: '✗'};
const statusWord = (status) => L.status[status] ?? status;
const outcomeWord = (outcome) => L.outcome[outcome] ?? outcome;
const gate = (cycle) => ReleaseGate.decide({cycle: cycle, ruleVersion: '1.0.0', decidedBy: 'kyklos-cli', idGenerator: new RandomIdGenerator(), clock: new SystemClock()});

const readConfirmationsFromStore = async (store) => {
    const records = await store.listRecords('manualConfirmation', ManualConfirmationSchema);
    return Object.fromEntries(records.map((record) => [record.checkId, true]));
};

const printResult = (result) => {
    console.log(L.progress);
    for (const observation of result.cycle.observations) {
        console.log(`  ${ICON[observation.status] ?? '?'} ${statusWord(observation.status).padEnd(18)} ${observation.checkId}`);
    }
    const decision = gate(result.cycle.cycle);
    console.log(`\n${L.cycle}: ${statusWord(result.cycle.cycle.state)}   ${L.gate}: ${outcomeWord(decision.outcome)} — ${decision.rationale}`);
};

if (command === 'dry-run') {
    const storeDir = resolveStore();
    const manifest = JSON.parse(readFileSync(resolveManifest(storeDir), 'utf8'));
    const runner = new DryRunner({store: new FileStore(storeDir), idGenerator: new RandomIdGenerator(), clock: new SystemClock()});
    const result = await runner.run({project: manifest.project, target: manifest.target, root: manifest.root});
    console.log(`${L.checks}: ${result.plan.compiledChecks.length} ${L.compiled}`);
    if (result.cycle === undefined) {
        die(L.notRunnable);
    }
    console.log(`${L.cycle}: ${statusWord(result.cycle.cycle.state)}   ${L.gate}: ${outcomeWord(gate(result.cycle.cycle).outcome)}`);
    process.exit(0);
}

if (command === 'play') {
    if (process.stdin.isTTY !== true) {
        die(L.needsTty);
    }
    const storeDir = resolveStore();
    const manifest = JSON.parse(readFileSync(resolveManifest(storeDir), 'utf8'));
    const env = loadEnv(resolveEnvFile(storeDir));
    Object.assign(process.env, env);

    const store = new FileStore(storeDir);
    const idGenerator = new RandomIdGenerator();
    const clock = new SystemClock();
    const by = flag('--by', 'operator');

    const confirmations = await readConfirmationsFromStore(store);
    const rl = createInterface({input: process.stdin, output: process.stdout});
    const ask = (question) => new Promise((done) => rl.question(question, done));

    const confirm = async (check) => {
        const raw = ManualAdapter.selectPrompt(check.action?.params, check.description, lang);
        console.log(`\n→ ${L.manualStep} [${check.id}]: ${resolvePrompt(raw, env)}`);
        const answer = (await ask(L.donePrompt)).trim().toLowerCase();
        if (answer !== 'y' && answer !== 'j') {
            return false;
        }
        const note = (await ask(L.notePrompt)).trim();
        await store.appendRecord('manualConfirmation', ManualConfirmationSchema, {id: idGenerator.next('mconf'), checkId: check.id, confirmedBy: by, note: note.length > 0 ? note : undefined, confirmedAt: clock.now()});
        return true;
    };

    const runner = new RealRunner({store: store, idGenerator: idGenerator, clock: clock, env: env, allowlist: manifest.allowlist ?? []});
    const result = await runner.run({project: manifest.project, target: manifest.target, root: manifest.root, confirmations: confirmations, confirm: confirm});
    rl.close();

    if (result.cycle === undefined) {
        die(L.notRunnable);
    }
    console.log('');
    printResult(result);
    process.exit(0);
}

if (command === 'run') {
    const storeDir = resolveStore();
    const manifest = JSON.parse(readFileSync(resolveManifest(storeDir), 'utf8'));
    const env = loadEnv(resolveEnvFile(storeDir));
    Object.assign(process.env, env);

    const store = new FileStore(storeDir);
    const idGenerator = new RandomIdGenerator();
    const clock = new SystemClock();

    const confirmations = await readConfirmationsFromStore(store);
    const confirmFile = flag('--confirm', undefined);
    if (confirmFile !== undefined) {
        const entries = JSON.parse(readFileSync(resolve(confirmFile), 'utf8'));
        for (const [checkId, entry] of Object.entries(entries)) {
            await store.appendRecord('manualConfirmation', ManualConfirmationSchema, {id: idGenerator.next('mconf'), checkId: checkId, confirmedBy: entry.confirmedBy, note: entry.note, confirmedAt: clock.now()});
            confirmations[checkId] = true;
        }
    }

    const runner = new RealRunner({store: store, idGenerator: idGenerator, clock: clock, env: env, allowlist: manifest.allowlist ?? []});
    const result = await runner.run({project: manifest.project, target: manifest.target, root: manifest.root, confirmations: confirmations});
    if (result.cycle === undefined) {
        die(L.notRunnable);
    }
    printResult(result);
    process.exit(0);
}

console.log(L.usage);
console.log(L.playHelp);
console.log(L.runHelp);
console.log(L.dryHelp);
process.exit(command === 'help' || command === undefined ? 0 : 2);
