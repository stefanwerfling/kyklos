/**
 * HttpAdapter — performs a single HTTP request with a timeout.
 *
 * A non-2xx response is still an executed outcome (the status is captured and
 * judged by the success criterion). A network error or timeout yields not
 * executable.
 */
import {Vts} from 'vts';
import {CheckAction} from '../Domain/Check.js';
import {AdapterKind} from '../Domain/Common.js';
import {Adapter} from './Adapter.js';
import {AdapterOutcome} from './AdapterTypes.js';

const DEFAULT_TIMEOUT_MS = 15000;

const HttpParamsSchema = Vts.object({
    method: Vts.optional(Vts.string()),
    url: Vts.string(),
    timeoutMs: Vts.optional(Vts.number())
}, {objectSchema: {strict: true}});

/**
 * Options for the http adapter.
 */
export interface HttpAdapterOptions {

    /**
     * Default timeout in milliseconds when a check does not specify one.
     * @member {number|undefined}
     */
    defaultTimeoutMs?: number;
}

/**
 * Adapter for HTTP health and endpoint checks.
 */
export class HttpAdapter extends Adapter {

    /**
     * The adapter kind this executor handles.
     * @member {AdapterKind}
     */
    public readonly kind: AdapterKind = AdapterKind.Http;

    /**
     * Default timeout in milliseconds.
     * @member {number}
     */
    protected readonly _defaultTimeoutMs: number;

    /**
     * @param {HttpAdapterOptions} [options] - Optional default timeout.
     */
    public constructor(options?: HttpAdapterOptions) {
        super();
        this._defaultTimeoutMs = options?.defaultTimeoutMs ?? DEFAULT_TIMEOUT_MS;
    }

    /**
     * Execute an HTTP request.
     * @param {CheckAction} action - The http action with method/url/timeoutMs params.
     * @returns {Promise<AdapterOutcome>} The raw outcome.
     */
    public async execute(action: CheckAction): Promise<AdapterOutcome> {
        if (!HttpParamsSchema.validate(action.params, [])) {
            return {executed: false, reason: 'invalid_params'};
        }

        const method = action.params.method ?? 'GET';
        const timeoutMs = action.params.timeoutMs ?? this._defaultTimeoutMs;

        try {
            const response = await fetch(action.params.url, {method: method, signal: AbortSignal.timeout(timeoutMs)});
            const body = await response.text();
            return {executed: true, httpStatus: response.status, body: body};
        } catch (error: unknown) {
            return {executed: false, reason: `http_error: ${HttpAdapter._message(error)}`};
        }
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