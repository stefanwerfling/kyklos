#!/usr/bin/env node
/**
 * Generic Kyklos dry-run CLI — a thin wrapper over the DryRunner module.
 *
 * Resolves, compiles and runs a playbook from a FileStore with every adapter
 * simulated, then prints the compiled-check count, the cycle state and the
 * ReleaseGate decision. Not project-specific: the store directory and a run
 * manifest (project + target + root) are arguments, so no paths are baked in.
 *
 * Usage:
 *   node scripts/kyklos-dry-run.mjs <storeDir> <manifest.json>
 * Example:
 *   node scripts/kyklos-dry-run.mjs ../mwpa/.kyklos ../mwpa/.kyklos/mwpa.run.json
 */
import {readFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const {DryRunner, FileStore, RandomIdGenerator, ReleaseGate, SystemClock} = await import(join(here, '..', 'dist', 'index.js'));

const [storeDir, manifestPath] = process.argv.slice(2);

if (storeDir === undefined || manifestPath === undefined) {
    console.error('usage: node scripts/kyklos-dry-run.mjs <storeDir> <manifest.json>');
    process.exit(2);
}

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const runner = new DryRunner({store: new FileStore(storeDir), idGenerator: new RandomIdGenerator(), clock: new SystemClock()});
const result = await runner.run({project: manifest.project, target: manifest.target, root: manifest.root});

console.log(`root:     ${manifest.root.kind} ${manifest.root.id}@${manifest.root.version}`);
console.log(`checks:   ${result.plan.compiledChecks.length} compiled`);

const blocking = result.plan.diagnostics.filter((diagnostic) => diagnostic.kind !== 'addition');

if (blocking.length > 0) {
    console.log('diagnostics:');
    for (const diagnostic of blocking) {
        console.log(`  - [${diagnostic.kind}] ${diagnostic.message}${diagnostic.ref ? ` (${diagnostic.ref})` : ''}`);
    }
}

if (result.cycle === undefined) {
    console.error('not runnable — resolution/compilation failed (see diagnostics above)');
    process.exit(1);
}

console.log(`cycle:    ${result.cycle.cycle.state}`);

const decision = ReleaseGate.decide({
    cycle: result.cycle.cycle,
    ruleVersion: '1.0.0',
    decidedBy: 'kyklos-dry-run',
    idGenerator: new RandomIdGenerator(),
    clock: new SystemClock()
});

console.log(`gate:     ${decision.outcome} — ${decision.rationale}`);
