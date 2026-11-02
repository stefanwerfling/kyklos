#!/usr/bin/env node
/**
 * Kyklos real-run CLI — runs a playbook from a store against the real system.
 *
 * Loads a project .env, exposes it both to child processes (so shell wrappers
 * inherit non-secret vars) and to the EnvResolvingAdapter (so ${VAR} in check
 * params is substituted), then runs with real, allow-listed adapters. Manual
 * checks without confirmation halt the run — so the automatable checks run for
 * real and the run stops at the first step that needs a human.
 *
 * Usage:
 *   node scripts/kyklos-run.mjs <storeDir> <manifest.json> [envFile] [confirmationsFile]
 * Example:
 *   node scripts/kyklos-run.mjs ../mwpa/.kyklos ../mwpa/.kyklos/mwpa.run.json ../mwpa/.kyklos/.env ../mwpa/.kyklos/confirmations.json
 *
 * confirmationsFile is a JSON map of checkId -> {confirmedBy, note}. Each entry
 * is written as an attributed, append-only ManualConfirmation record and lets
 * that manual check pass — so the run can proceed past a human boundary.
 */
import {readFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const {ManualConfirmationSchema, RealRunner, FileStore, RandomIdGenerator, ReleaseGate, SystemClock} = await import(join(here, '..', 'dist', 'index.js'));

const [storeDir, manifestPath, envPath, confirmationsPath] = process.argv.slice(2);

if (storeDir === undefined || manifestPath === undefined) {
    console.error('usage: node scripts/kyklos-run.mjs <storeDir> <manifest.json> [envFile]');
    process.exit(2);
}

const loadEnv = (path) => {
    const env = {};
    for (const line of readFileSync(path, 'utf8').split('\n')) {
        const trimmed = line.trim();
        if (trimmed === '' || trimmed.startsWith('#')) {
            continue;
        }
        const eq = trimmed.indexOf('=');
        if (eq < 0) {
            continue;
        }
        env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
    }
    return env;
};

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const env = envPath === undefined ? {} : loadEnv(envPath);
Object.assign(process.env, env); // so shell wrappers inherit non-secret vars

const store = new FileStore(storeDir);
const idGenerator = new RandomIdGenerator();
const clock = new SystemClock();

// Record attributed confirmations (append-only) and build the boolean map.
const confirmations = {};
if (confirmationsPath !== undefined) {
    const entries = JSON.parse(readFileSync(confirmationsPath, 'utf8'));
    for (const [checkId, entry] of Object.entries(entries)) {
        await store.appendRecord('manualConfirmation', ManualConfirmationSchema, {
            id: idGenerator.next('mconf'),
            checkId: checkId,
            confirmedBy: entry.confirmedBy,
            note: entry.note,
            confirmedAt: clock.now()
        });
        confirmations[checkId] = true;
    }
    console.log(`confirmations: ${Object.keys(confirmations).length} recorded`);
}

const runner = new RealRunner({
    store: store,
    idGenerator: idGenerator,
    clock: clock,
    env: env,
    allowlist: manifest.allowlist ?? []
});

const result = await runner.run({project: manifest.project, target: manifest.target, root: manifest.root, confirmations: confirmations});

console.log(`root:     ${manifest.root.kind} ${manifest.root.id}@${manifest.root.version}`);
console.log(`checks:   ${result.plan.compiledChecks.length} compiled`);

if (result.cycle === undefined) {
    console.error('not runnable — resolution/compilation failed');
    for (const diagnostic of result.plan.diagnostics.filter((d) => d.kind !== 'addition')) {
        console.error(`  - [${diagnostic.kind}] ${diagnostic.message}${diagnostic.ref ? ` (${diagnostic.ref})` : ''}`);
    }
    process.exit(1);
}

console.log('per check:');
for (const observation of result.cycle.observations) {
    const reason = observation.actual && typeof observation.actual === 'object' && 'reason' in observation.actual ? ` (${observation.actual.reason})` : '';
    console.log(`  ${observation.status.padEnd(16)} ${observation.checkId}${reason}`);
}

console.log(`cycle:    ${result.cycle.cycle.state}`);

const decision = ReleaseGate.decide({
    cycle: result.cycle.cycle,
    ruleVersion: '1.0.0',
    decidedBy: 'kyklos-run',
    idGenerator: new RandomIdGenerator(),
    clock: new SystemClock()
});

console.log(`gate:     ${decision.outcome} — ${decision.rationale}`);
