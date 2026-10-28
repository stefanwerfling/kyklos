/**
 * BrowserAdapter — drives a real browser through a pluggable driver.
 *
 * The library ships the contract, not a hard Playwright dependency: inject a
 * BrowserDriver (e.g. a Playwright driver, or a bridge to an already-running
 * browser automation). With no driver the adapter is honest — it reports
 * not_executable with a concrete alternative, never a passed UI. The inspection
 * is placed in the outcome body for the browserHealthy criterion to judge; a
 * reachable page is not by itself a pass. Permission tier: external.
 */
import {Vts} from 'vts';
import {CheckAction} from '../Domain/Check.js';
import {AdapterKind, PermissionTier} from '../Domain/Common.js';
import {Adapter} from './Adapter.js';
import {AdapterOutcome} from './AdapterTypes.js';

/**
 * What a browser inspection reports about a page.
 */
export interface BrowserInspection {

    /**
     * Whether the page was reachable at all.
     * @member {boolean}
     */
    reachable: boolean;

    /**
     * HTTP status of the navigation, if known.
     * @member {number|undefined}
     */
    httpStatus?: number;

    /**
     * Document title, if read.
     * @member {string|undefined}
     */
    title?: string;

    /**
     * Console error messages observed.
     * @member {string[]}
     */
    consoleErrors: string[];

    /**
     * Failed network requests observed.
     * @member {string[]}
     */
    failedRequests: string[];
}

/**
 * Drives a real browser and returns an inspection.
 */
export interface BrowserDriver {

    /**
     * Open a URL in a real browser and inspect it.
     * @param {string} url - The URL to open.
     * @returns {Promise<BrowserInspection>} The observed page state.
     */
    inspect(url: string): Promise<BrowserInspection>;
}

const BrowserParamsSchema = Vts.object({
    url: Vts.string()
}, {objectSchema: {strict: true}});

/**
 * Adapter that runs a browser inspection via an injected driver.
 */
export class BrowserAdapter extends Adapter {

    /**
     * The adapter kind this executor handles.
     * @member {AdapterKind}
     */
    public readonly kind: AdapterKind = AdapterKind.Browser;

    /**
     * The permission tier this adapter acts at.
     * @member {PermissionTier}
     */
    public readonly permissionTier: PermissionTier = PermissionTier.External;

    /**
     * The injected browser driver, if any.
     * @member {BrowserDriver|undefined}
     */
    protected readonly _driver: BrowserDriver|undefined;

    /**
     * @param {BrowserDriver} [driver] - A real browser driver; without it, checks are not executable.
     */
    public constructor(driver?: BrowserDriver) {
        super();
        this._driver = driver;
    }

    /**
     * Run a browser inspection.
     * @param {CheckAction} action - The browser action; params carry the url.
     * @returns {Promise<AdapterOutcome>} The outcome with the inspection in its body.
     */
    public async execute(action: CheckAction): Promise<AdapterOutcome> {
        if (!BrowserParamsSchema.validate(action.params, [])) {
            return {executed: false, reason: 'invalid_params'};
        }

        if (this._driver === undefined) {
            return {executed: false, reason: 'no_browser_driver: inject a BrowserDriver (e.g. npm i -D playwright)'};
        }

        let inspection: BrowserInspection;

        try {
            inspection = await this._driver.inspect(action.params.url);
        } catch (error: unknown) {
            return {executed: false, reason: `browser_error: ${BrowserAdapter._message(error)}`};
        }

        if (!inspection.reachable) {
            return {executed: false, reason: 'unreachable'};
        }

        return {executed: true, httpStatus: inspection.httpStatus, body: JSON.stringify(inspection)};
    }

    /**
     * Extract a message from an unknown thrown value.
     * @param {unknown} error - The caught value.
     * @returns {string} A message string.
     */
    protected static _message(error: unknown): string {
        if (error instanceof Error) {
            return error.message;
        }

        return String(error);
    }

}