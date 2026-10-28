/**
 * CommandDiscovery — derives an ordered list of CLI checks from a project's
 * package.json scripts.
 *
 * Only known, recognized scripts are turned into checks, ordered cheap-first
 * (lint, typecheck) before expensive ones (test, build). Nothing is invented:
 * a script that is not present simply yields no check.
 */
import {Check} from '../Domain/Check.js';
import {AdapterKind, Criticality, OnFailure} from '../Domain/Common.js';

/**
 * The subset of package.json that discovery reads.
 */
export interface PackageManifest {

    /**
     * npm scripts by name.
     * @member {Record<string, string>|undefined}
     */
    scripts?: Record<string, string>;
}

interface KnownScript {
    name: string;
    group: string;
    criticality: Criticality;
    order: number;
}

const KNOWN_SCRIPTS: KnownScript[] = [
    {name: 'lint', group: 'static', criticality: Criticality.Major, order: 1},
    {name: 'typecheck', group: 'static', criticality: Criticality.Critical, order: 2},
    {name: 'test', group: 'test', criticality: Criticality.Critical, order: 3},
    {name: 'build', group: 'build', criticality: Criticality.Critical, order: 4},
    {name: 'compile', group: 'build', criticality: Criticality.Critical, order: 5}
];

/**
 * Static discovery of CLI checks from a package manifest.
 */
export class CommandDiscovery {

    /**
     * Derive ordered CLI checks from a package.json manifest.
     * @param {PackageManifest} manifest - The parsed package.json.
     * @returns {Check[]} Recognized checks, ordered cheap-first.
     */
    public static fromPackageJson(manifest: PackageManifest): Check[] {
        const scripts = manifest.scripts ?? {};

        return KNOWN_SCRIPTS
        .filter((known): boolean => Object.hasOwn(scripts, known.name))
        .sort((left, right): number => left.order - right.order)
        .map((known): Check => CommandDiscovery._toCheck(known));
    }

    /**
     * Build a CLI check for a known script.
     * @param {KnownScript} known - The recognized script.
     * @returns {Check} The corresponding shell check.
     */
    protected static _toCheck(known: KnownScript): Check {
        return {
            id: `cli.${known.name}`,
            version: '1.0.0',
            group: known.group,
            description: `npm run ${known.name}`,
            criticality: known.criticality,
            preconditions: [],
            action: {adapter: AdapterKind.Shell, params: {bin: 'npm', args: ['run', known.name]}},
            successCriterion: {kind: 'exitZero'},
            expectedEvidence: ['stdout'],
            onFailure: known.criticality === Criticality.Critical ? OnFailure.Block : OnFailure.Warn
        };
    }

}