/**
 * PlaybookResolver — resolves a playbook/procedure root against a target system.
 *
 * It loads the referenced playbook graph at the exact pinned versions, proves it
 * is acyclic (via DependencyGraph), checks target-system and technology
 * compatibility, and records where every definition was resolved from. It does
 * not flatten to checks — that is the compiler's job. Resolution is
 * deterministic: the same request against the same repository always yields the
 * same result. It never loads the newest version of a reference; only the pinned
 * one. Diagnostics are explicit; a conflicted resolution is never ok.
 */
import {DiagnosticKind, PlaybookScope, PlaybookStatus, PlaybookStepKind} from '../Domain/Common.js';
import {Diagnostic, ResolvedEntry} from '../Domain/ExecutionPlan.js';
import {Playbook} from '../Domain/Playbook.js';
import {TargetSystem} from '../Domain/TargetSystem.js';
import {DependencyGraph} from './DependencyGraph.js';

/**
 * Loads playbook definitions at exact versions (a snapshot of the registry).
 */
export interface PlaybookRepository {

    /**
     * Load a playbook at an exact version.
     * @param {string} id - Playbook id.
     * @param {string} version - Exact version.
     * @returns {Promise<Playbook|undefined>} The playbook, or undefined if absent.
     */
    getPlaybook(id: string, version: string): Promise<Playbook|undefined>;
}

/**
 * A reference to the run's root definition.
 */
export interface RootRef {
    kind: PlaybookStepKind;
    id: string;
    version: string;
}

/**
 * A resolution request.
 */
export interface ResolutionRequest {
    projectId: string;
    target: TargetSystem;
    root: RootRef;
}

/**
 * The outcome of a resolution.
 */
export interface ResolutionResult {
    ok: boolean;
    root: RootRef;
    resolved: ResolvedEntry[];
    diagnostics: Diagnostic[];
}

const ERROR_KINDS = new Set<DiagnosticKind>([
    DiagnosticKind.Conflict,
    DiagnosticKind.Incompatible,
    DiagnosticKind.MissingPrerequisite,
    DiagnosticKind.SealedViolation,
    DiagnosticKind.CycleDetected
]);

/**
 * Static resolver of playbook/procedure roots.
 */
export class PlaybookResolver {

    /**
     * Resolve a root against a target system.
     * @param {ResolutionRequest} request - Project, target and root reference.
     * @param {PlaybookRepository} repository - Snapshot to load playbooks from.
     * @returns {Promise<ResolutionResult>} Resolved entries and diagnostics.
     */
    public static async resolve(request: ResolutionRequest, repository: PlaybookRepository): Promise<ResolutionResult> {
        const diagnostics: Diagnostic[] = [];
        const resolved: ResolvedEntry[] = [];

        // A bare procedure/checklist root has no playbook graph; it is a project-level leaf.
        if (request.root.kind !== PlaybookStepKind.Playbook) {
            resolved.push({kind: request.root.kind, id: request.root.id, version: request.root.version, level: PlaybookScope.Project});
            return {ok: true, root: request.root, resolved: resolved, diagnostics: diagnostics};
        }

        const loaded = new Map<string, Playbook>();
        await PlaybookResolver._load(request.root.id, request.root.version, repository, loaded, diagnostics);

        const rootKey = PlaybookResolver._key(request.root.id, request.root.version);
        const cycle = DependencyGraph.detectCycle(rootKey, (key): string[] => PlaybookResolver._playbookChildren(key, loaded));

        if (cycle !== undefined) {
            diagnostics.push({kind: DiagnosticKind.CycleDetected, message: `playbook reference cycle: ${cycle.join(' -> ')}`, ref: rootKey});
            return {ok: false, root: request.root, resolved: resolved, diagnostics: diagnostics};
        }

        PlaybookResolver._walk(rootKey, request.target, loaded, resolved, diagnostics, new Set<string>());

        const ok = !diagnostics.some((diagnostic): boolean => ERROR_KINDS.has(diagnostic.kind));
        return {ok: ok, root: request.root, resolved: resolved, diagnostics: diagnostics};
    }

    /**
     * Load the root playbook and all transitively referenced playbooks.
     * @param {string} id - Playbook id.
     * @param {string} version - Exact version.
     * @param {PlaybookRepository} repository - Snapshot.
     * @param {Map<string, Playbook>} loaded - Accumulator of loaded playbooks.
     * @param {Diagnostic[]} diagnostics - Accumulator of diagnostics.
     * @returns {Promise<void>}
     */
    protected static async _load(id: string, version: string, repository: PlaybookRepository, loaded: Map<string, Playbook>, diagnostics: Diagnostic[]): Promise<void> {
        const key = PlaybookResolver._key(id, version);

        if (loaded.has(key)) {
            return;
        }

        const playbook = await repository.getPlaybook(id, version);

        if (playbook === undefined) {
            diagnostics.push({kind: DiagnosticKind.MissingPrerequisite, message: 'playbook not found at pinned version', ref: key});
            return;
        }

        loaded.set(key, playbook);

        for (const step of playbook.steps) {
            if (step.kind === PlaybookStepKind.Playbook) {
                // sequential by design — deterministic traversal order
                // eslint-disable-next-line no-await-in-loop
                await PlaybookResolver._load(step.id, step.version, repository, loaded, diagnostics);
            }
        }
    }

    /**
     * Child playbook keys of a node, in step order.
     * @param {string} key - The playbook key.
     * @param {Map<string, Playbook>} loaded - Loaded playbooks.
     * @returns {string[]} Child playbook keys.
     */
    protected static _playbookChildren(key: string, loaded: Map<string, Playbook>): string[] {
        const playbook = loaded.get(key);

        if (playbook === undefined) {
            return [];
        }

        return playbook.steps
        .filter((step): boolean => step.kind === PlaybookStepKind.Playbook)
        .map((step): string => PlaybookResolver._key(step.id, step.version));
    }

    /**
     * Walk the (acyclic) graph recording resolved entries and compatibility.
     * @param {string} key - The playbook key.
     * @param {TargetSystem} target - The target system.
     * @param {Map<string, Playbook>} loaded - Loaded playbooks.
     * @param {ResolvedEntry[]} resolved - Accumulator of resolved entries.
     * @param {Diagnostic[]} diagnostics - Accumulator of diagnostics.
     * @param {Set<string>} seen - Already-recorded keys.
     * @returns {void}
     */
    protected static _walk(key: string, target: TargetSystem, loaded: Map<string, Playbook>, resolved: ResolvedEntry[], diagnostics: Diagnostic[], seen: Set<string>): void {
        if (seen.has(key)) {
            return;
        }

        seen.add(key);
        const playbook = loaded.get(key);

        if (playbook === undefined) {
            return;
        }

        PlaybookResolver._checkCompatibility(playbook, target, diagnostics);
        resolved.push({kind: PlaybookStepKind.Playbook, id: playbook.id, version: playbook.version, level: playbook.scope});

        for (const step of playbook.steps) {
            if (step.kind === PlaybookStepKind.Playbook) {
                PlaybookResolver._walk(PlaybookResolver._key(step.id, step.version), target, loaded, resolved, diagnostics, seen);
            } else {
                resolved.push({kind: step.kind, id: step.id, version: step.version, level: playbook.scope});
            }
        }
    }

    /**
     * Record compatibility and publication diagnostics for a playbook.
     * @param {Playbook} playbook - The playbook.
     * @param {TargetSystem} target - The target system.
     * @param {Diagnostic[]} diagnostics - Accumulator of diagnostics.
     * @returns {void}
     */
    protected static _checkCompatibility(playbook: Playbook, target: TargetSystem, diagnostics: Diagnostic[]): void {
        const ref = PlaybookResolver._key(playbook.id, playbook.version);

        if (playbook.status !== PlaybookStatus.Published) {
            diagnostics.push({kind: DiagnosticKind.Conflict, message: 'playbook is not published', ref: ref});
        }

        const systemOk = playbook.targetSystems.length === 0
            || playbook.targetSystems.includes(target.os)
            || playbook.targetSystems.includes(target.id);

        if (!systemOk) {
            diagnostics.push({kind: DiagnosticKind.Incompatible, message: `target system '${target.os}' not in ${playbook.targetSystems.join(',')}`, ref: ref});
        }

        const missingTech = playbook.technologies.filter((tech): boolean => !target.technologies.includes(tech));

        if (missingTech.length > 0) {
            diagnostics.push({kind: DiagnosticKind.Incompatible, message: `missing technologies: ${missingTech.join(',')}`, ref: ref});
        }
    }

    /**
     * Build a node key.
     * @param {string} id - Id.
     * @param {string} version - Version.
     * @returns {string} The `id@version` key.
     */
    protected static _key(id: string, version: string): string {
        return `${id}@${version}`;
    }

}