/**
 * EmulatorAdapter — runs a mobile/emulated check through a device driver.
 *
 * Capability-gated and honest: with no driver, or with no running device/AVD,
 * it reports not_executable with a concrete next step — it never claims an
 * emulator run that did not happen. Permission tier: external.
 */
import {Vts} from 'vts';
import {CheckAction} from '../Domain/Check.js';
import {AdapterKind, PermissionTier} from '../Domain/Common.js';
import {Adapter} from './Adapter.js';
import {AdapterOutcome} from './AdapterTypes.js';

/**
 * Drives an emulator/simulator or a connected device.
 */
export interface EmulatorDriver {

    /**
     * List the ids of currently available devices/emulators.
     * @returns {Promise<string[]>} Device ids (empty if none).
     */
    listDevices(): Promise<string[]>;
}

const EmulatorParamsSchema = Vts.object({
    deviceId: Vts.optional(Vts.string())
}, {objectSchema: {strict: true}});

/**
 * Adapter for emulator/simulator checks.
 */
export class EmulatorAdapter extends Adapter {

    /**
     * The adapter kind this executor handles.
     * @member {AdapterKind}
     */
    public readonly kind: AdapterKind = AdapterKind.Emulator;

    /**
     * The permission tier this adapter acts at.
     * @member {PermissionTier}
     */
    public readonly permissionTier: PermissionTier = PermissionTier.External;

    /**
     * The injected device driver, if any.
     * @member {EmulatorDriver|undefined}
     */
    protected readonly _driver: EmulatorDriver|undefined;

    /**
     * @param {EmulatorDriver} [driver] - A device driver; without it, checks are not executable.
     */
    public constructor(driver?: EmulatorDriver) {
        super();
        this._driver = driver;
    }

    /**
     * Check device availability for an emulator action.
     * @param {CheckAction} action - The emulator action.
     * @returns {Promise<AdapterOutcome>} executed only when a device is present.
     */
    public async execute(action: CheckAction): Promise<AdapterOutcome> {
        const params = action.params ?? {};

        if (!EmulatorParamsSchema.validate(params, [])) {
            return {executed: false, reason: 'invalid_params'};
        }

        if (this._driver === undefined) {
            return {executed: false, reason: 'no_emulator_driver: configure an Android(adb) or iOS driver'};
        }

        let devices: string[];

        try {
            devices = await this._driver.listDevices();
        } catch (error: unknown) {
            return {executed: false, reason: `emulator_error: ${EmulatorAdapter._message(error)}`};
        }

        if (devices.length === 0) {
            return {executed: false, reason: 'no_device_or_avd: start an emulator/AVD (none detected)'};
        }

        return {executed: true, body: JSON.stringify({devices: devices})};
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