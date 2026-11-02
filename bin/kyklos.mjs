#!/usr/bin/env node
/**
 * kyklos — the Kyklos command-line entry point.
 *
 * Install once (`npm link` in the kyklos repo), then run `kyklos <command>`
 * from inside a project that has a .kyklos store. Paths default to the current
 * working directory, so from a project folder you just run `kyklos guide`.
 *
 * Commands:
 *   kyklos dry-run [--store <dir>] [--manifest <file>]
 *       Simulate every adapter; prove the whole order/gating without side effects.
 *   kyklos run     [--store <dir>] [--manifest <file>] [--env <file>] [--confirm <file>]
 *       Real run with allow-listed adapters and ${VAR} resolved from the .env.
 *   kyklos guide   [--store <dir>] [--manifest <file>] [--env <file>]
 *       Guided, resumable: show progress + the next step to do by hand.
 *   kyklos confirm <checkId> --by <who> [--note "<text>"] [--store <dir>]
 *       Record an attributed confirmation for a manual step.
 *
 * Defaults: --store ./.kyklos ; --manifest the single *.run.json in the store ;
 * --env <store>/.env when present.
 */
import {existsSync, readFileSync, readdirSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {createInterface} from 'node:readline';
import {fileURLToPath} from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const lib = await import(join(here, '..', 'dist', 'index.js'));
const {DryRunner, FileStore, ManualConfirmationSchema, RandomIdGenerator, RealRunner, ReleaseGate, SystemClock} = lib;

const argv = process.argv.slice(2);
const command = argv[0];

const flag = (name, fallback) => {
    const at = argv.indexOf(name);
    return at >= 0 && argv[at + 1] !== undefined ? argv[at + 1] : fallback;
};

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

const ICON = {passed: '✓', failed: '✗', unknown: '→', not_applicable: '⧸', skipped: '·', not_executable: '✗'};

const gate = (cycle) => ReleaseGate.decide({cycle: cycle, ruleVersion: '1.0.0', decidedBy: 'kyklos-cli', idGenerator: new RandomIdGenerator(), clock: new SystemClock()});

const readConfirmationsFromStore = async (store) => {
    const records = await store.listRecords('manualConfirmation', ManualConfirmationSchema);
    return Object.fromEntries(records.map((record) => [record.checkId, true]));
};

if (command === 'dry-run') {
    const storeDir = resolveStore();
    const manifest = JSON.parse(readFileSync(resolveManifest(storeDir), 'utf8'));
    const runner = new DryRunner({store: new FileStore(storeDir), idGenerator: new RandomIdGenerator(), clock: new SystemClock()});
    const result = await runner.run({project: manifest.project, target: manifest.target, root: manifest.root});
    console.log(`checks: ${result.plan.compiledChecks.length} compiled`);
    if (result.cycle === undefined) {
        die('not runnable — resolution/compilation failed');
    }
    console.log(`cycle: ${result.cycle.cycle.state}   gate: ${gate(result.cycle.cycle).outcome}`);
    process.exit(0);
}

const printResult = (result) => {
    console.log('progress:');
    for (const observation of result.cycle.observations) {
        console.log(`  ${ICON[observation.status] ?? '?'} ${observation.status.padEnd(16)} ${observation.checkId}`);
    }
    const decision = gate(result.cycle.cycle);
    console.log(`\ncycle: ${result.cycle.cycle.state}   gate: ${decision.outcome} — ${decision.rationale}`);
};

if (command === 'play') {
    if (process.stdin.isTTY !== true) {
        die('play is interactive and needs a terminal. For non-interactive / CI use: kyklos run --confirm <file>');
    }
    const storeDir = resolveStore();
    const manifest = JSON.parse(readFileSync(resolveManifest(storeDir), 'utf8'));
    const env = loadEnv(resolveEnvFile(storeDir));
    Object.assign(process.env, env);

    const store = new FileStore(storeDir);
    const idGenerator = new RandomIdGenerator();
    const clock = new SystemClock();
    const by = flag('--by', 'operator');

    // Already-confirmed steps (from a prior, interrupted run) pass without asking.
    const confirmations = await readConfirmationsFromStore(store);
    const rl = createInterface({input: process.stdin, output: process.stdout});
    const ask = (question) => new Promise((done) => rl.question(question, done));

    // Interactive confirmation for each ready, not-yet-confirmed manual step.
    const confirm = async (check) => {
        const prompt = check.action?.params?.prompt;
        console.log(`\n→ manual step [${check.id}]: ${typeof prompt === 'string' && prompt.length > 0 ? prompt : check.description}`);
        const answer = (await ask('  done? [y/N] ')).trim().toLowerCase();
        if (answer !== 'y' && answer !== 'j') {
            return false;
        }
        const note = (await ask('  note (what you did): ')).trim();
        await store.appendRecord('manualConfirmation', ManualConfirmationSchema, {id: idGenerator.next('mconf'), checkId: check.id, confirmedBy: by, note: note.length > 0 ? note : undefined, confirmedAt: clock.now()});
        return true;
    };

    const runner = new RealRunner({store: store, idGenerator: idGenerator, clock: clock, env: env, allowlist: manifest.allowlist ?? []});
    const result = await runner.run({project: manifest.project, target: manifest.target, root: manifest.root, confirmations: confirmations, confirm: confirm});
    rl.close();

    if (result.cycle === undefined) {
        die('not runnable — resolution/compilation failed');
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
        die('not runnable — resolution/compilation failed');
    }
    printResult(result);
    process.exit(0);
}

console.log('kyklos <play|run|dry-run> [--store <dir>] [--manifest <file>] [--env <file>]');
console.log('  play     run interactively — auto-runs checks, asks you at each manual step, resumes if interrupted');
console.log('  run      non-interactive (CI); confirmations via --confirm <file>');
console.log('  dry-run  simulate every adapter; no side effects');
process.exit(command === 'help' || command === undefined ? 0 : 2);
