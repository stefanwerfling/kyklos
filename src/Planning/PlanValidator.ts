/**
 * PlanValidator — deterministic validation of an LLM-proposed plan candidate.
 *
 * It never trusts the proposal: a candidate must be a draft, must be free of
 * secrets/PII/internal hosts (LessonSanitizer), and must be structurally sound.
 * For a playbook that means it compiles through the unchanged PlaybookCompiler
 * (so reference cycles, missing definitions and sealed-rule violations surface);
 * for a workflow it means the phase graph has no cycle and every phase root
 * resolves. The result is Passed only when no blocking diagnostic remains —
 * exactly the gate a human needs cleared before publishing.
 */
import {DiagnosticKind, PlanKind, PlaybookStatus, PlaybookStepKind, ValidationResult, WorkflowStatus} from '../Domain/Common.js';
import {Diagnostic} from '../Domain/ExecutionPlan.js';
import {PhaseRoot, Workflow, WorkflowPhase} from '../Domain/Workflow.js';
import {Playbook} from '../Domain/Playbook.js';
import {DependencyGraph} from '../Playbook/DependencyGraph.js';
import {DefinitionSource, PlaybookCompiler} from '../Playbook/PlaybookCompiler.js';
import {LessonSanitizer} from '../Learning/LessonSanitizer.js';
import {PlanCandidate} from './PlanCandidate.js';

const BLOCKING = new Set<DiagnosticKind>([
    DiagnosticKind.Conflict,
    DiagnosticKind.MissingPrerequisite,
    DiagnosticKind.SealedViolation,
    DiagnosticKind.CycleDetected,
    DiagnosticKind.Incompatible
]);

/**
 * The outcome of validating a plan candidate.
 */
export interface PlanValidationOutcome {

    /**
     * Passed only when no blocking diagnostic remains.
     * @member {ValidationResult}
     */
    result: ValidationResult;

    /**
     * The diagnostics found (empty on a clean pass).
     * @member {Diagnostic[]}
     */
    diagnostics: Diagnostic[];
}

/**
 * Static, deterministic validator of plan candidates.
 */
export class PlanValidator {

    /**
     * Validate a candidate by its kind.
     * @param {PlanCandidate} candidate - The proposed plan.
     * @param {DefinitionSource} source - Where referenced definitions are loaded from.
     * @returns {Promise<PlanValidationOutcome>} The validation result and diagnostics.
     */
    public static async validate(candidate: PlanCandidate, source: DefinitionSource): Promise<PlanValidationOutcome> {
        if (candidate.kind === PlanKind.Playbook && candidate.playbook !== undefined) {
            return PlanValidator._validatePlaybook(candidate.playbook, source);
        }

        if (candidate.kind === PlanKind.Workflow && candidate.workflow !== undefined) {
            return PlanValidator._validateWorkflow(candidate.workflow, source);
        }

        return {result: ValidationResult.Failed, diagnostics: [{kind: DiagnosticKind.Conflict, message: 'candidate has no definition matching its kind', ref: candidate.kind}]};
    }

    /**
     * Validate a playbook candidate.
     * @param {Playbook} playbook - The draft playbook.
     * @param {DefinitionSource} source - Definition source for compilation.
     * @returns {Promise<PlanValidationOutcome>} The validation result and diagnostics.
     */
    protected static async _validatePlaybook(playbook: Playbook, source: DefinitionSource): Promise<PlanValidationOutcome> {
        const diagnostics: Diagnostic[] = [];

        if (playbook.status !== PlaybookStatus.Draft) {
            diagnostics.push({kind: DiagnosticKind.Conflict, message: 'candidate must be a draft (never a published definition)', ref: playbook.id});
        }

        PlanValidator._checkSecrets(PlanValidator._playbookTexts(playbook), playbook.id, diagnostics);

        const compilation = await PlaybookCompiler.compile({kind: PlaybookStepKind.Playbook, id: playbook.id, version: playbook.version}, source);

        for (const diagnostic of compilation.diagnostics) {
            if (BLOCKING.has(diagnostic.kind)) {
                diagnostics.push(diagnostic);
            }
        }

        return PlanValidator._outcome(diagnostics);
    }

    /**
     * Validate a workflow candidate.
     * @param {Workflow} workflow - The draft workflow.
     * @param {DefinitionSource} source - Definition source for root resolution.
     * @returns {Promise<PlanValidationOutcome>} The validation result and diagnostics.
     */
    protected static async _validateWorkflow(workflow: Workflow, source: DefinitionSource): Promise<PlanValidationOutcome> {
        const diagnostics: Diagnostic[] = [];

        if (workflow.status !== WorkflowStatus.Draft) {
            diagnostics.push({kind: DiagnosticKind.Conflict, message: 'candidate must be a draft (never a published definition)', ref: workflow.id});
        }

        PlanValidator._checkSecrets(PlanValidator._workflowTexts(workflow), workflow.id, diagnostics);

        const cycle = PlanValidator._firstPhaseCycle(workflow);

        if (cycle !== undefined) {
            diagnostics.push({kind: DiagnosticKind.CycleDetected, message: `phase dependency cycle: ${cycle.join(' -> ')}`, ref: workflow.id});
        }

        for (const phase of workflow.phases) {
            // sequential by design — deterministic ordered reference checks
            // eslint-disable-next-line no-await-in-loop
            await PlanValidator._checkPhaseRoots(phase, source, diagnostics);
        }

        return PlanValidator._outcome(diagnostics);
    }

    /**
     * Append a Conflict diagnostic when any text trips the secret scanner.
     * @param {string[]} texts - The texts to scan.
     * @param {string} ref - The candidate id to reference.
     * @param {Diagnostic[]} diagnostics - The diagnostics list to append to.
     * @returns {void}
     */
    protected static _checkSecrets(texts: string[], ref: string, diagnostics: Diagnostic[]): void {
        const sensitive = LessonSanitizer.findSensitive(texts);

        if (sensitive.length > 0) {
            // The hits themselves are not echoed, so the diagnostic never leaks a secret.
            diagnostics.push({kind: DiagnosticKind.Conflict, message: 'candidate contains secrets/PII/internal hosts and cannot be proposed', ref: ref});
        }
    }

    /**
     * Check that a phase's root (and rollback root) resolve.
     * @param {WorkflowPhase} phase - The phase.
     * @param {DefinitionSource} source - The definition source.
     * @param {Diagnostic[]} diagnostics - The diagnostics list to append to.
     * @returns {Promise<void>}
     */
    protected static async _checkPhaseRoots(phase: WorkflowPhase, source: DefinitionSource, diagnostics: Diagnostic[]): Promise<void> {
        if (!await PlanValidator._rootResolves(phase.root, source)) {
            diagnostics.push({kind: DiagnosticKind.MissingPrerequisite, message: `phase '${phase.id}' root does not resolve`, ref: `${phase.root.id}@${phase.root.version}`});
        }

        if (phase.rollback !== undefined && !await PlanValidator._rootResolves(phase.rollback, source)) {
            diagnostics.push({kind: DiagnosticKind.MissingPrerequisite, message: `phase '${phase.id}' rollback root does not resolve`, ref: `${phase.rollback.id}@${phase.rollback.version}`});
        }
    }

    /**
     * Whether a phase root resolves to a known definition.
     * @param {PhaseRoot} root - The root reference.
     * @param {DefinitionSource} source - The definition source.
     * @returns {Promise<boolean>} True when the referenced definition exists.
     */
    protected static async _rootResolves(root: PhaseRoot, source: DefinitionSource): Promise<boolean> {
        if (root.kind === PlaybookStepKind.Playbook) {
            return await source.getPlaybook(root.id, root.version) !== undefined;
        }

        if (root.kind === PlaybookStepKind.Procedure) {
            return await source.getProcedure(root.id, root.version) !== undefined;
        }

        return await source.getChecklist(root.id, root.version) !== undefined;
    }

    /**
     * Find the first phase dependency cycle, if any.
     * @param {Workflow} workflow - The workflow.
     * @returns {string[]|undefined} The cycle path, or undefined when acyclic.
     */
    protected static _firstPhaseCycle(workflow: Workflow): string[]|undefined {
        const childrenOf = (id: string): string[] => workflow.phases.find((phase): boolean => phase.id === id)?.dependsOn ?? [];

        for (const phase of workflow.phases) {
            const cycle = DependencyGraph.detectCycle(phase.id, childrenOf);

            if (cycle !== undefined) {
                return cycle;
            }
        }

        return undefined;
    }

    /**
     * The scannable text of a playbook.
     * @param {Playbook} playbook - The playbook.
     * @returns {string[]} The free-text fields.
     */
    protected static _playbookTexts(playbook: Playbook): string[] {
        return [
            playbook.name,
            playbook.description ?? '',
            ...playbook.prerequisites,
            ...playbook.successCriteria ?? [],
            ...playbook.targetSystems,
            ...playbook.technologies,
            ...playbook.evidenceRequirements ?? []
        ];
    }

    /**
     * The scannable text of a workflow.
     * @param {Workflow} workflow - The workflow.
     * @returns {string[]} The free-text fields.
     */
    protected static _workflowTexts(workflow: Workflow): string[] {
        return [workflow.name, workflow.description ?? '', ...workflow.phases.map((phase): string => phase.name)];
    }

    /**
     * Derive the outcome from the collected diagnostics.
     * @param {Diagnostic[]} diagnostics - The diagnostics.
     * @returns {PlanValidationOutcome} Passed when empty, else Failed.
     */
    protected static _outcome(diagnostics: Diagnostic[]): PlanValidationOutcome {
        return {result: diagnostics.length === 0 ? ValidationResult.Passed : ValidationResult.Failed, diagnostics: diagnostics};
    }

}