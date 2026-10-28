/**
 * PermissionPolicy — enforces a maximum permission tier.
 *
 * Actions declare the tier they act at; the policy allows only tiers up to a
 * configured ceiling. A denied action is reported, never silently passed, and
 * never silently executed. Tiers are ordered from least to most powerful.
 */
import {PermissionTier} from '../Domain/Common.js';
import {KyklosError, KyklosErrorCode} from '../KyklosError.js';

const TIER_ORDER: PermissionTier[] = [
    PermissionTier.Read,
    PermissionTier.TempTest,
    PermissionTier.LocalWrite,
    PermissionTier.Shared,
    PermissionTier.External,
    PermissionTier.Production
];

/**
 * A ceiling on the permission tier that actions may act at.
 */
export class PermissionPolicy {

    /**
     * The highest allowed tier.
     * @member {PermissionTier}
     */
    protected readonly _maxTier: PermissionTier;

    /**
     * @param {PermissionTier} maxTier - The highest tier this policy permits.
     * @throws {KyklosError} When maxTier is not a known permission tier.
     */
    public constructor(maxTier: PermissionTier) {
        if (!PermissionPolicy.isKnown(maxTier)) {
            throw new KyklosError(KyklosErrorCode.InvalidState, `Unknown permission tier: ${String(maxTier)}`);
        }

        this._maxTier = maxTier;
    }

    /**
     * Whether an action at a tier is allowed. Fail-closed: an unknown or
     * invalid tier is never allowed.
     * @param {PermissionTier} tier - The action's tier.
     * @returns {boolean} True only if the tier is known and within the ceiling.
     */
    public allows(tier: PermissionTier): boolean {
        const rank = PermissionPolicy._rank(tier);
        return rank >= 0 && rank <= PermissionPolicy._rank(this._maxTier);
    }

    /**
     * Whether a value is a known permission tier.
     * @param {PermissionTier} tier - The value to check.
     * @returns {boolean} True if it is one of the defined tiers.
     */
    public static isKnown(tier: PermissionTier): boolean {
        return PermissionPolicy._rank(tier) >= 0;
    }

    /**
     * The configured ceiling.
     * @returns {PermissionTier} The highest allowed tier.
     */
    public maxTier(): PermissionTier {
        return this._maxTier;
    }

    /**
     * Rank a tier by power (lower is weaker).
     * @param {PermissionTier} tier - The tier.
     * @returns {number} Its rank in the ordering.
     */
    protected static _rank(tier: PermissionTier): number {
        return TIER_ORDER.indexOf(tier);
    }

}