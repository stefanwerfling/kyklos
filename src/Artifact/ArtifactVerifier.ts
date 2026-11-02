/**
 * ArtifactVerifier — enforces that the tested digest is the deployed digest.
 *
 * Given the digest an earlier phase pinned (e.g. the tested build) and the
 * digest observed now (e.g. about to be deployed), it reports a match or an
 * explicit conflict diagnostic. A mismatch is never treated as identical — a
 * rebuild that changed the bits is surfaced, not silently accepted. Pure and
 * deterministic.
 */
import {DiagnosticKind} from '../Domain/Common.js';
import {Diagnostic} from '../Domain/ExecutionPlan.js';

/**
 * Outcome of comparing an expected digest with an observed one.
 */
export interface DigestVerification {

    /**
     * True when the observed digest equals the expected one.
     * @member {boolean}
     */
    match: boolean;

    /**
     * The conflict diagnostic, present only on a mismatch.
     * @member {Diagnostic|undefined}
     */
    diagnostic?: Diagnostic;
}

/**
 * Static verifier of artifact digest identity across phases.
 */
export class ArtifactVerifier {

    /**
     * Verify that an observed digest matches the expected (pinned) digest.
     * @param {string} expectedDigest - The digest pinned by an earlier phase.
     * @param {string} observedDigest - The digest observed now.
     * @returns {DigestVerification} Match, or a conflict diagnostic on divergence.
     */
    public static verify(expectedDigest: string, observedDigest: string): DigestVerification {
        if (expectedDigest === observedDigest) {
            return {match: true};
        }

        return {
            match: false,
            diagnostic: {
                kind: DiagnosticKind.Conflict,
                message: `artifact digest mismatch: tested '${expectedDigest}' but observed '${observedDigest}'`,
                ref: expectedDigest
            }
        };
    }

}