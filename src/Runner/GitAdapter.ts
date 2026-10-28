/**
 * GitAdapter — read-only git facts.
 *
 * Only read subcommands (status, describe, log, ...) are permitted; a write
 * subcommand (commit, push, ...) yields not_executable. It composes the shell
 * adapter (bin pinned to git), so there is no second spawn implementation.
 * Permission tier: read.
 */
import {Vts} from 'vts';
import {CheckAction} from '../Domain/Check.js';
import {AdapterKind, PermissionTier} from '../Domain/Common.js';
import {Adapter} from './Adapter.js';
import {AdapterOutcome} from './AdapterTypes.js';
import {ShellAdapter} from './ShellAdapter.js';

const READ_SUBCOMMANDS = new Set<string>(['status', 'describe', 'log', 'diff', 'rev-parse', 'branch', 'show', 'remote', 'config', 'ls-files']);

const GitParamsSchema = Vts.object({
    args: Vts.array(Vts.string()),
    timeoutMs: Vts.optional(Vts.number())
}, {objectSchema: {strict: true}});

/**
 * Adapter for read-only git commands.
 */
export class GitAdapter extends Adapter {

    /**
     * The adapter kind this executor handles.
     * @member {AdapterKind}
     */
    public readonly kind: AdapterKind = AdapterKind.Git;

    /**
     * The permission tier this adapter acts at (read-only).
     * @member {PermissionTier}
     */
    public readonly permissionTier: PermissionTier = PermissionTier.Read;

    /**
     * Shell adapter with git as the only allow-listed binary.
     * @member {ShellAdapter}
     */
    protected readonly _shell: ShellAdapter;

    /**
     * @param {number} [defaultTimeoutMs] - Default timeout passed to the shell adapter.
     */
    public constructor(defaultTimeoutMs?: number) {
        super();
        this._shell = new ShellAdapter({allowlist: ['git'], defaultTimeoutMs: defaultTimeoutMs});
    }

    /**
     * Execute a read-only git command.
     * @param {CheckAction} action - The git action; params carry the git args.
     * @returns {Promise<AdapterOutcome>} The outcome, or not_executable for a non-read subcommand.
     */
    public async execute(action: CheckAction): Promise<AdapterOutcome> {
        if (!GitParamsSchema.validate(action.params, [])) {
            return {executed: false, reason: 'invalid_params'};
        }

        const subcommand = action.params.args[0];

        if (subcommand === undefined || !READ_SUBCOMMANDS.has(subcommand)) {
            return {executed: false, reason: `not_read_subcommand: ${subcommand ?? 'none'}`};
        }

        return this._shell.execute({adapter: AdapterKind.Shell, params: {bin: 'git', args: action.params.args, timeoutMs: action.params.timeoutMs}});
    }

}