/**
 * PlaybookCompiler — flattens a resolved root into the existing Check list.
 *
 * It walks the root (procedure/checklist/playbook) in step order and emits one
 * compiled Check list plus per-check provenance. Relations compose steps:
 * `append` adds, `override`/`specialize` replace a check of the same id from an
 * earlier (more general) step. A `sealed` source cannot be replaced — an attempt
 * is reported as a sealed_violation and the sealed check is kept. Compilation is
 * deterministic and produces no second execution engine: the output is a plain
 * Check[] the existing CycleEngine runs.
 */
import {Check} from '../Domain/Check.js';
import {Checklist} from '../Domain/Checklist.js';
import {DiagnosticKind, PlaybookScope, PlaybookStepKind, PlaybookStepRelation} from '../Domain/Common.js';
import {CheckProvenance, Diagnostic} from '../Domain/ExecutionPlan.js';
import {Playbook} from '../Domain/Playbook.js';
import {Procedure} from '../Domain/Procedure.js';
import {RootRef} from './PlaybookResolver.js';

/**
 * Loads the definitions a compilation needs.
 */
export interface DefinitionSource {

    /**
     * @param {string} id - Playbook id.
     * @param {string} version - Exact version.
     * @returns {Promise<Playbook|undefined>} The playbook, or undefined.
     */
    getPlaybook(id: string, version: string): Promise<Playbook|undefined>;

    /**
     * @param {string} id - Procedure id.
     * @param {string} version - Exact version.
     * @returns {Promise<Procedure|undefined>} The procedure, or undefined.
     */
    getProcedure(id: string, version: string): Promise<Procedure|undefined>;

    /**
     * @param {string} id - Checklist id.
     * @param {string} version - Exact version.
     * @returns {Promise<Checklist|undefined>} The checklist, or undefined.
     */
    getChecklist(id: string, version: string): Promise<Checklist|undefined>;
}

/**
 * The outcome of a compilation.
 */
export interface CompilationResult {
    ok: boolean;
    compiledChecks: Check[];
    checkProvenance: CheckProvenance[];
    diagnostics: Diagnostic[];
}

interface CompileContext {
    checks: Check[];
    provenance: CheckProvenance[];
    diagnostics: Diagnostic[];
    byId: Map<string, {sealed: boolean; index: number;}>;
    onPath: Set<string>;
}

interface ExpandRef {
    kind: PlaybookStepKind;
    id: string;
    version: string;
    sealed: boolean;
    level: PlaybookScope;
    relation: PlaybookStepRelation|undefined;
}

const ERROR_KINDS = new Set<DiagnosticKind>([DiagnosticKind.Conflict, DiagnosticKind.MissingPrerequisite, DiagnosticKind.SealedViolation, DiagnosticKind.CycleDetected]);

/**
 * Static compiler from a resolved root to a flat Check list.
 */
export class PlaybookCompiler {

    /**
     * Compile a root into a flat Check list with provenance.
     * @param {RootRef} root - The root reference.
     * @param {DefinitionSource} source - Where to load definitions from.
     * @returns {Promise<CompilationResult>} Compiled checks, provenance and diagnostics.
     */
    public static async compile(root: RootRef, source: DefinitionSource): Promise<CompilationResult> {
        const context: CompileContext = {checks: [], provenance: [], diagnostics: [], byId: new Map<string, {sealed: boolean; index: number;}>(), onPath: new Set<string>()};
        await PlaybookCompiler._expand({kind: root.kind, id: root.id, version: root.version, sealed: false, level: PlaybookScope.Project, relation: undefined}, source, context);
        const ok = !context.diagnostics.some((diagnostic): boolean => ERROR_KINDS.has(diagnostic.kind));
        return {ok: ok, compiledChecks: context.checks, checkProvenance: context.provenance, diagnostics: context.diagnostics};
    }

    /**
     * Expand one reference (playbook recurses; procedure/checklist emit checks).
     * @param {ExpandRef} ref - The reference to expand.
     * @param {DefinitionSource} source - Definition source.
     * @param {CompileContext} context - Mutable compile context.
     * @returns {Promise<void>}
     */
    protected static async _expand(ref: ExpandRef, source: DefinitionSource, context: CompileContext): Promise<void> {
        if (ref.kind === PlaybookStepKind.Playbook) {
            await PlaybookCompiler._expandPlaybook(ref, source, context);
            return;
        }

        if (ref.kind === PlaybookStepKind.Procedure) {
            await PlaybookCompiler._expandProcedure(ref, source, context);
            return;
        }

        await PlaybookCompiler._expandChecklist(ref, ref.id, ref.version, source, context);
    }

    /**
     * Expand a playbook into its steps.
     * @param {ExpandRef} ref - The playbook reference.
     * @param {DefinitionSource} source - Definition source.
     * @param {CompileContext} context - Mutable compile context.
     * @returns {Promise<void>}
     */
    protected static async _expandPlaybook(ref: ExpandRef, source: DefinitionSource, context: CompileContext): Promise<void> {
        const key = `${ref.id}@${ref.version}`;

        if (context.onPath.has(key)) {
            context.diagnostics.push({kind: DiagnosticKind.CycleDetected, message: 'playbook reference cycle at compile', ref: key});
            return;
        }

        const playbook = await source.getPlaybook(ref.id, ref.version);

        if (playbook === undefined) {
            context.diagnostics.push({kind: DiagnosticKind.MissingPrerequisite, message: 'playbook not found', ref: key});
            return;
        }

        context.onPath.add(key);
        const sealedHere = ref.sealed || playbook.sealed;

        for (const step of playbook.steps) {
            // sequential by design — compiled check order follows step order
            // eslint-disable-next-line no-await-in-loop
            await PlaybookCompiler._expand({kind: step.kind, id: step.id, version: step.version, sealed: sealedHere || step.sealed === true, level: playbook.scope, relation: step.relation}, source, context);
        }

        context.onPath.delete(key);
    }

    /**
     * Expand a procedure into its checklist's checks.
     * @param {ExpandRef} ref - The procedure reference.
     * @param {DefinitionSource} source - Definition source.
     * @param {CompileContext} context - Mutable compile context.
     * @returns {Promise<void>}
     */
    protected static async _expandProcedure(ref: ExpandRef, source: DefinitionSource, context: CompileContext): Promise<void> {
        const procedure = await source.getProcedure(ref.id, ref.version);

        if (procedure === undefined) {
            context.diagnostics.push({kind: DiagnosticKind.MissingPrerequisite, message: 'procedure not found', ref: `${ref.id}@${ref.version}`});
            return;
        }

        await PlaybookCompiler._expandChecklist({...ref, id: procedure.id, version: procedure.version}, procedure.checklistId, procedure.checklistVersion, source, context);
    }

    /**
     * Load a checklist and insert its checks.
     * @param {ExpandRef} ref - The reference whose source metadata/relation applies.
     * @param {string} checklistId - Checklist id to load.
     * @param {string} checklistVersion - Checklist version to load.
     * @param {DefinitionSource} source - Definition source.
     * @param {CompileContext} context - Mutable compile context.
     * @returns {Promise<void>}
     */
    protected static async _expandChecklist(ref: ExpandRef, checklistId: string, checklistVersion: string, source: DefinitionSource, context: CompileContext): Promise<void> {
        const checklist = await source.getChecklist(checklistId, checklistVersion);

        if (checklist === undefined) {
            context.diagnostics.push({kind: DiagnosticKind.MissingPrerequisite, message: 'checklist not found', ref: `${checklistId}@${checklistVersion}`});
            return;
        }

        for (const check of checklist.checks) {
            PlaybookCompiler._insert(check, ref, context);
        }
    }

    /**
     * Insert one check, honouring relation and sealed rules.
     * @param {Check} check - The check to insert.
     * @param {ExpandRef} ref - The source reference (kind/id/version/relation/sealed/level).
     * @param {CompileContext} context - Mutable compile context.
     * @returns {void}
     */
    protected static _insert(check: Check, ref: ExpandRef, context: CompileContext): void {
        const provenance: CheckProvenance = {checkId: check.id, sourceKind: ref.kind, sourceId: ref.id, sourceVersion: ref.version, level: ref.level};
        const existing = context.byId.get(check.id);

        if (existing === undefined) {
            context.checks.push(check);
            context.provenance.push(provenance);
            context.byId.set(check.id, {sealed: ref.sealed, index: context.checks.length - 1});
            context.diagnostics.push({kind: DiagnosticKind.Addition, message: 'added check', ref: check.id});
            return;
        }

        if (existing.sealed) {
            context.diagnostics.push({kind: DiagnosticKind.SealedViolation, message: 'cannot override sealed check', ref: check.id});
            return;
        }

        const overrides = ref.relation === PlaybookStepRelation.Override || ref.relation === PlaybookStepRelation.Specialize;

        if (!overrides) {
            context.diagnostics.push({kind: DiagnosticKind.Conflict, message: 'duplicate check id without override', ref: check.id});
            return;
        }

        context.checks[existing.index] = check;
        context.provenance[existing.index] = provenance;
        context.byId.set(check.id, {sealed: ref.sealed, index: existing.index});
        const kind = ref.relation === PlaybookStepRelation.Override ? DiagnosticKind.Override : DiagnosticKind.Specialization;
        context.diagnostics.push({kind: kind, message: 'replaced check', ref: check.id});
    }

}