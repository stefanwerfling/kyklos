/**
 * PermissionPolicy — enforces a maximum permission tier.
 *
 * Actions declare the tier they act at; the policy allows only tiers up to a
 * configured ceiling. A denied action is reported, never silently passed, and
 * never silently executed. Tiers are ordered from least to most powerful.
 */
import {PermissionTier} from '../Domain/Common.js';

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
     */
    public constructor(maxTier: PermissionTier) {
        this._maxTier = maxTier;
    }

    /**
     * Whether an action at a tier is allowed.
     * @param {PermissionTier} tier - The action's tier.
     * @returns {boolean} True if within the ceiling.
     */
    public allows(tier: PermissionTier): boolean {
        return PermissionPolicy._rank(tier) <= PermissionPolicy._rank(this._maxTier);
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