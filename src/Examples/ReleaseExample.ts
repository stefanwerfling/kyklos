/**
 * ReleaseExample — a concrete, versioned software-release procedure.
 *
 * Builds the example Project, Procedure and the A–E release checklist from the
 * plan (preparation, backup & restore, upgrade, rollback, deployment). Group F
 * (release) is not a check: it is the ReleaseGate applied to the resulting
 * cycle. The checks carry realistic actions (shell bin/args, http urls, manual
 * prompts); a dry run swaps a DryRunAdapter under each adapter kind so the whole
 * checklist can run end to end without touching a real system.
 */
import {Check} from '../Domain/Check.js';
import {Checklist} from '../Domain/Checklist.js';
import {AdapterKind, Criticality, OnFailure} from '../Domain/Common.js';
import {Procedure} from '../Domain/Procedure.js';
import {Project} from '../Domain/Project.js';
import {AdapterRegistry} from '../Runner/AdapterRegistry.js';
import {DryRunAdapter, DryRunResolver} from '../Runner/DryRunAdapter.js';

/**
 * Builders for the example software-release procedure.
 */
export class ReleaseExample {

    /**
     * The example project.
     * @returns {Project} A sample project with a PostgreSQL stack.
     */
    public static project(): Project {
        return {
            id: 'proj-example',
            name: 'Example Service',
            repoUrl: 'https://github.com/stefanwerfling/example',
            stack: ['node', 'postgresql'],
            tags: ['backend'],
            policyRefs: []
        };
    }

    /**
     * The example procedure, pinned to the example checklist.
     * @returns {Procedure} The software-release procedure.
     */
    public static procedure(): Procedure {
        return {
            id: 'software-release',
            version: '1.0.0',
            name: 'Software release',
            kind: 'software-release',
            description: 'Safe software delivery: preparation, backup, upgrade, rollback, deployment.',
            checklistId: 'release.default',
            checklistVersion: '1.0.0'
        };
    }

    /**
     * The example A–E release checklist.
     * @returns {Checklist} A versioned checklist with 12 checks across groups A–E.
     */
    public static checklist(): Checklist {
        return {
            id: 'release.default',
            version: '1.0.0',
            ruleVersion: '1.0.0',
            checks: [
                ReleaseExample._shell('prep.target-version', 'preparation', 'Identify target version and source state', Criticality.Critical, 'git', ['describe', '--tags', '--always']),
                ReleaseExample._shell('prep.clean-worktree', 'preparation', 'Git working tree is clean', Criticality.Critical, 'git', ['status', '--porcelain']),
                ReleaseExample._shell('backup.create', 'backup', 'Create database backup', Criticality.Critical, 'pg_dump', ['--format=custom', 'app']),
                ReleaseExample._shell('backup.verify-integrity', 'backup', 'Verify backup integrity', Criticality.Critical, 'pg_restore', ['--list', 'app.dump'], ['backup.create==passed']),
                ReleaseExample._shell('backup.restore-test', 'backup', 'Restore into a test environment and verify consistency', Criticality.Critical, 'pg_restore', ['--clean', 'app.dump'], ['backup.verify-integrity==passed']),
                ReleaseExample._shell('upgrade.migrate', 'upgrade', 'Run and verify database migrations', Criticality.Critical, 'npm', ['run', 'migrate'], ['backup.restore-test==passed']),
                ReleaseExample._http('upgrade.smoke-business-flows', 'upgrade', 'Smoke-test core business flows after upgrade', Criticality.Critical, 'http://localhost/health'),
                ReleaseExample._manual('rollback.plan-defined', 'rollback', 'Rollback strategy defined before upgrade; irreversible steps named', Criticality.Critical),
                ReleaseExample._shell('rollback.deployment-test', 'rollback', 'Return to the previous application version and prove it works', Criticality.Critical, 'bash', ['rollback-test.sh']),
                ReleaseExample._shell('deploy.artifact-integrity', 'deployment', 'Verify artifact integrity and target version', Criticality.Critical, 'sha256sum', ['--check', 'artifact.sha256']),
                ReleaseExample._http('deploy.healthcheck', 'deployment', 'Health check after deployment', Criticality.Critical, 'http://localhost/health'),
                ReleaseExample._http('deploy.error-rate', 'deployment', 'Error rate below threshold after deployment', Criticality.Major, 'http://localhost/metrics/errors')
            ]
        };
    }

    /**
     * A registry that simulates every adapter kind for a dry run.
     * @param {DryRunResolver} [resolver] - Optional outcome resolver; defaults to success.
     * @returns {AdapterRegistry} A registry with dry-run adapters for all kinds.
     */
    public static dryRunRegistry(resolver?: DryRunResolver): AdapterRegistry {
        return new AdapterRegistry()
        .register(new DryRunAdapter(AdapterKind.Shell, resolver))
        .register(new DryRunAdapter(AdapterKind.Http, resolver))
        .register(new DryRunAdapter(AdapterKind.Manual, resolver))
        .register(new DryRunAdapter(AdapterKind.Decision, resolver));
    }

    /**
     * Build a shell check.
     * @param {string} id - Check id.
     * @param {string} group - Group name.
     * @param {string} description - Human-readable description.
     * @param {Criticality} criticality - Check criticality.
     * @param {string} bin - Binary to run.
     * @param {string[]} args - Arguments.
     * @param {string[]} [preconditions] - Optional preconditions.
     * @returns {Check} The shell check.
     */
    protected static _shell(id: string, group: string, description: string, criticality: Criticality, bin: string, args: string[], preconditions?: string[]): Check {
        return {
            id: id,
            version: '1.0.0',
            group: group,
            description: description,
            criticality: criticality,
            preconditions: preconditions ?? [],
            action: {adapter: AdapterKind.Shell, params: {bin: bin, args: args}},
            successCriterion: {kind: 'exitZero'},
            expectedEvidence: ['stdout'],
            onFailure: ReleaseExample._onFailure(criticality)
        };
    }

    /**
     * Build an http check.
     * @param {string} id - Check id.
     * @param {string} group - Group name.
     * @param {string} description - Human-readable description.
     * @param {Criticality} criticality - Check criticality.
     * @param {string} url - URL to request.
     * @returns {Check} The http check.
     */
    protected static _http(id: string, group: string, description: string, criticality: Criticality, url: string): Check {
        return {
            id: id,
            version: '1.0.0',
            group: group,
            description: description,
            criticality: criticality,
            preconditions: [],
            action: {adapter: AdapterKind.Http, params: {method: 'GET', url: url}},
            successCriterion: {kind: 'httpStatus', params: {equals: 200}},
            expectedEvidence: ['body'],
            onFailure: ReleaseExample._onFailure(criticality)
        };
    }

    /**
     * Build a manual check.
     * @param {string} id - Check id.
     * @param {string} group - Group name.
     * @param {string} description - Human-readable description.
     * @param {Criticality} criticality - Check criticality.
     * @returns {Check} The manual check.
     */
    protected static _manual(id: string, group: string, description: string, criticality: Criticality): Check {
        return {
            id: id,
            version: '1.0.0',
            group: group,
            description: description,
            criticality: criticality,
            preconditions: [],
            action: {adapter: AdapterKind.Manual, params: {prompt: description}},
            successCriterion: {kind: 'manualConfirm'},
            expectedEvidence: [],
            onFailure: ReleaseExample._onFailure(criticality)
        };
    }

    /**
     * Pick the failure behaviour from a criticality.
     * @param {Criticality} criticality - The check criticality.
     * @returns {OnFailure} Block for critical, warn otherwise.
     */
    protected static _onFailure(criticality: Criticality): OnFailure {
        return criticality === Criticality.Critical ? OnFailure.Block : OnFailure.Warn;
    }

}