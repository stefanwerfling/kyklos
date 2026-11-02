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

if (command === 'confirm') {
    const checkId = argv[1];
    const by = flag('--by', undefined);
    if (checkId === undefined || checkId.startsWith('--') || by === undefined) {
        die('usage: kyklos confirm <checkId> --by <who> [--note "<text>"] [--store <dir>]');
    }
    const store = new FileStore(resolveStore());
    await store.appendRecord('manualConfirmation', ManualConfirmationSchema, {
        id: new RandomIdGenerator().next('mconf'),
        checkId: checkId,
        confirmedBy: by,
        note: flag('--note', undefined),
        confirmedAt: new SystemClock().now()
    });
    console.log(`✓ confirmed '${checkId}' by ${by}. Run 'kyklos guide' to continue.`);
    process.exit(0);
}

if (command === 'run' || command === 'guide') {
    const storeDir = resolveStore();
    const manifest = JSON.parse(readFileSync(resolveManifest(storeDir), 'utf8'));
    const envFile = resolveEnvFile(storeDir);
    const env = loadEnv(envFile);
    Object.assign(process.env, env);

    const store = new FileStore(storeDir);
    const idGenerator = new RandomIdGenerator();
    const clock = new SystemClock();

    const confirmations = command === 'guide' ? await readConfirmationsFromStore(store) : {};
    if (command === 'run') {
        const confirmFile = flag('--confirm', undefined);
        if (confirmFile !== undefined) {
            const entries = JSON.parse(readFileSync(resolve(confirmFile), 'utf8'));
            for (const [checkId, entry] of Object.entries(entries)) {
                await store.appendRecord('manualConfirmation', ManualConfirmationSchema, {id: idGenerator.next('mconf'), checkId: checkId, confirmedBy: entry.confirmedBy, note: entry.note, confirmedAt: clock.now()});
                confirmations[checkId] = true;
            }
        }
    }

    const runner = new RealRunner({store: store, idGenerator: idGenerator, clock: clock, env: env, allowlist: manifest.allowlist ?? []});
    const result = await runner.run({project: manifest.project, target: manifest.target, root: manifest.root, confirmations: confirmations});

    if (result.cycle === undefined) {
        die('not runnable — resolution/compilation failed');
    }

    console.log('progress:');
    for (const observation of result.cycle.observations) {
        console.log(`  ${ICON[observation.status] ?? '?'} ${observation.status.padEnd(16)} ${observation.checkId}`);
    }

    if (command === 'guide') {
        const describe = {};
        for (const check of result.plan.compiledChecks) {
            const prompt = check.action?.params?.prompt;
            describe[check.id] = typeof prompt === 'string' && prompt.length > 0 ? prompt : check.description;
        }
        const next = result.cycle.observations.filter((observation) => observation.status === 'unknown');
        if (next.length > 0) {
            console.log('\nNEXT — do by hand, then confirm each:');
            for (const observation of next) {
                console.log(`\n  [${observation.checkId}] ${describe[observation.checkId] ?? ''}`);
                console.log(`    kyklos confirm ${observation.checkId} --by <you> --note "<what you did>"`);
            }
        }
    }

    const decision = gate(result.cycle.cycle);
    console.log(`\ncycle: ${result.cycle.cycle.state}   gate: ${decision.outcome} — ${decision.rationale}`);
    process.exit(0);
}

console.log('kyklos <dry-run|run|guide|confirm> [options]  (run from a folder with a .kyklos store)');
process.exit(command === 'help' || command === undefined ? 0 : 2);
