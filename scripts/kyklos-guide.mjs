#!/usr/bin/env node
/**
 * Kyklos guided, resumable operator runner.
 *
 * Walks a delivery playbook with a human in the loop. Confirmations are stored
 * as append-only ManualConfirmation records, so progress is durable: if you are
 * interrupted, just run `guide` again — already-confirmed steps stay done and
 * the next pending step is shown. Nothing here touches a secret (the scp /
 * server steps are yours to perform by hand); the guide only tells you what to
 * do next and records that you did it.
 *
 * Commands:
 *   guide  <storeDir> <manifest.json> [envFile]
 *       Run the pipeline with the confirmations recorded so far, print progress,
 *       and list the step(s) you must do next (with the exact confirm command).
 *   confirm <storeDir> <checkId> --by <who> [--note "<text>"]
 *       Record an attributed confirmation for a manual step, then you re-run guide.
 */
import {readFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const {FileStore, ManualConfirmationSchema, RandomIdGenerator, RealRunner, ReleaseGate, SystemClock} = await import(join(here, '..', 'dist', 'index.js'));

const argv = process.argv.slice(2);
const command = argv[0];

const loadEnv = (path) => {
    const env = {};
    for (const line of readFileSync(path, 'utf8').split('\n')) {
        const trimmed = line.trim();
        if (trimmed === '' || trimmed.startsWith('#')) {
            continue;
        }
        const eq = trimmed.indexOf('=');
        if (eq > 0) {
            env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
        }
    }
    return env;
};

const flag = (name) => {
    const at = argv.indexOf(name);
    return at >= 0 ? argv[at + 1] : undefined;
};

const readConfirmations = async (store) => {
    const records = await store.listRecords('manualConfirmation', ManualConfirmationSchema);
    const byId = {};
    for (const record of records) {
        byId[record.checkId] = record;
    }
    return byId;
};

const ICON = {passed: '✓', failed: '✗', unknown: '→', not_applicable: '⧸', skipped: '·', not_executable: '✗'};

if (command === 'confirm') {
    const [, storeDir, checkId] = argv;
    const by = flag('--by');
    if (storeDir === undefined || checkId === undefined || by === undefined) {
        console.error('usage: node scripts/kyklos-guide.mjs confirm <storeDir> <checkId> --by <who> [--note "<text>"]');
        process.exit(2);
    }
    const store = new FileStore(storeDir);
    await store.appendRecord('manualConfirmation', ManualConfirmationSchema, {
        id: new RandomIdGenerator().next('mconf'),
        checkId: checkId,
        confirmedBy: by,
        note: flag('--note'),
        confirmedAt: new SystemClock().now()
    });
    console.log(`✓ confirmed '${checkId}' by ${by}. Now run: node scripts/kyklos-guide.mjs guide ${storeDir} <manifest> [envFile]`);
    process.exit(0);
}

if (command !== 'guide') {
    console.error('usage: node scripts/kyklos-guide.mjs <guide|confirm> ...');
    process.exit(2);
}

const [, storeDir, manifestPath, envPath] = argv;
if (storeDir === undefined || manifestPath === undefined) {
    console.error('usage: node scripts/kyklos-guide.mjs guide <storeDir> <manifest.json> [envFile]');
    process.exit(2);
}

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const env = envPath === undefined ? {} : loadEnv(envPath);
Object.assign(process.env, env);

const store = new FileStore(storeDir);
const confirmed = await readConfirmations(store);
const confirmations = Object.fromEntries(Object.keys(confirmed).map((id) => [id, true]));

const runner = new RealRunner({store: store, idGenerator: new RandomIdGenerator(), clock: new SystemClock(), env: env, allowlist: manifest.allowlist ?? []});
const result = await runner.run({project: manifest.project, target: manifest.target, root: manifest.root, confirmations: confirmations});

if (result.cycle === undefined) {
    console.error('not runnable — resolution/compilation failed');
    process.exit(1);
}

const describe = {};
for (const check of result.plan.compiledChecks) {
    const prompt = check.action?.params?.prompt;
    describe[check.id] = typeof prompt === 'string' && prompt.length > 0 ? prompt : check.description;
}

console.log('progress:');
for (const observation of result.cycle.observations) {
    console.log(`  ${ICON[observation.status] ?? '?'} ${observation.status.padEnd(16)} ${observation.checkId}`);
}

const failed = result.cycle.observations.filter((o) => o.status === 'failed' || o.status === 'not_executable');
const next = result.cycle.observations.filter((o) => o.status === 'unknown');

if (failed.length > 0) {
    console.log('\nblocked by a failed check (fix it, then re-run guide):');
    for (const observation of failed) {
        console.log(`  ✗ ${observation.checkId}`);
    }
}

if (next.length > 0) {
    console.log('\nNEXT — do these by hand, then confirm each:');
    for (const observation of next) {
        console.log(`\n  [${observation.checkId}] ${describe[observation.checkId] ?? ''}`);
        console.log(`    node scripts/kyklos-guide.mjs confirm ${storeDir} ${observation.checkId} --by <you> --note "<what you did>"`);
    }
} else if (failed.length === 0) {
    console.log('\n✓ no manual step pending.');
}

const decision = ReleaseGate.decide({cycle: result.cycle.cycle, ruleVersion: '1.0.0', decidedBy: 'kyklos-guide', idGenerator: new RandomIdGenerator(), clock: new SystemClock()});
console.log(`\ncycle: ${result.cycle.cycle.state}   gate: ${decision.outcome} — ${decision.rationale}`);
