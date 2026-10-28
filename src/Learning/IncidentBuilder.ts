/**
 * IncidentBuilder — builds an incident from one deviation.
 *
 * The incident inherits the deviation's signature (so it is searchable) and
 * starts open with a separated confidence level (default: plausible — a
 * hypothesis, not a confirmed cause). Id and timestamp are passed in so the
 * caller keeps control of the injected id/clock sources.
 */
import {Confidence, IncidentStatus} from '../Domain/Common.js';
import {Deviation} from '../Domain/Deviation.js';
import {Incident} from '../Domain/Incident.js';

/**
 * The classification and metadata for a new incident.
 */
export interface IncidentDraft {

    /**
     * Technical classification, e.g. 'backup' or 'deployment'.
     * @member {string}
     */
    classification: string;

    /**
     * Confidence of the (optional) root-cause note. Default: plausible.
     * @member {Confidence|undefined}
     */
    confidence?: Confidence;

    /**
     * Owning cycle id, if any.
     * @member {string|undefined}
     */
    cycleId?: string;

    /**
     * Free-text root cause (MVP).
     * @member {string|undefined}
     */
    rootCause?: string;
}

/**
 * Static builder of incidents from deviations.
 */
export class IncidentBuilder {

    /**
     * Build an incident from a single deviation.
     * @param {Deviation} deviation - The deviation to wrap.
     * @param {IncidentDraft} draft - Classification and metadata.
     * @param {string} id - The incident id (from the caller's id source).
     * @param {string} createdAt - The creation timestamp (from the caller's clock).
     * @returns {Incident} The incident.
     */
    public static fromDeviation(deviation: Deviation, draft: IncidentDraft, id: string, createdAt: string): Incident {
        return {
            id: id,
            cycleId: draft.cycleId,
            deviationIds: [deviation.id],
            classification: draft.classification,
            signature: deviation.signature,
            status: IncidentStatus.Open,
            confidence: draft.confidence ?? Confidence.Plausible,
            rootCause: draft.rootCause,
            createdAt: createdAt
        };
    }

}