/**
 * IncidentMatcher — deterministic similarity matching without AI.
 *
 * Matches on an exact signature (and optionally an exact classification), so a
 * recurring situation links to its prior incidents while unrelated incidents
 * never link. Results are ordered by id for a stable, reproducible output.
 */
import {Incident} from '../Domain/Incident.js';

/**
 * A similarity query.
 */
export interface IncidentQuery {

    /**
     * The exact signature to match.
     * @member {string}
     */
    signature: string;

    /**
     * Optional exact classification to also require.
     * @member {string|undefined}
     */
    classification?: string;
}

/**
 * Static matcher of incidents by signature.
 */
export class IncidentMatcher {

    /**
     * Return the candidates that match the query, ordered by id.
     * @param {Incident[]} candidates - The incidents to search.
     * @param {IncidentQuery} query - The similarity query.
     * @returns {Incident[]} The matching incidents, ordered by id.
     */
    public static match(candidates: Incident[], query: IncidentQuery): Incident[] {
        return candidates
        .filter((incident): boolean => IncidentMatcher._matches(incident, query))
        .sort((left, right): number => left.id.localeCompare(right.id));
    }

    /**
     * Whether a single incident matches the query.
     * @param {Incident} incident - The candidate incident.
     * @param {IncidentQuery} query - The similarity query.
     * @returns {boolean} True on an exact match.
     */
    protected static _matches(incident: Incident, query: IncidentQuery): boolean {
        if (incident.signature !== query.signature) {
            return false;
        }

        if (query.classification !== undefined && incident.classification !== query.classification) {
            return false;
        }

        return true;
    }

}