/**
 * AdbEmulatorDriver — lists Android devices/emulators via `adb devices`.
 *
 * Uses the allow-listed shell adapter (bin pinned to adb). When adb reports no
 * attached device, it returns an empty list, which the EmulatorAdapter turns
 * into a documented not_executable.
 */
import {AdapterKind} from '../Domain/Common.js';
import {EmulatorDriver} from './EmulatorAdapter.js';
import {ShellAdapter} from './ShellAdapter.js';

const WHITESPACE = /\s+/u;

/**
 * Android device driver backed by adb.
 */
export class AdbEmulatorDriver implements EmulatorDriver {

    /**
     * Shell adapter with adb as the only allow-listed binary.
     * @member {ShellAdapter}
     */
    protected readonly _shell: ShellAdapter;

    /**
     * @param {number} [timeoutMs] - Default timeout passed to the shell adapter.
     */
    public constructor(timeoutMs?: number) {
        this._shell = new ShellAdapter({allowlist: ['adb'], defaultTimeoutMs: timeoutMs});
    }

    /**
     * List attached Android device/emulator ids.
     * @returns {Promise<string[]>} Device ids (empty if none, or if adb is unavailable).
     */
    public async listDevices(): Promise<string[]> {
        const outcome = await this._shell.execute({adapter: AdapterKind.Shell, params: {bin: 'adb', args: ['devices']}});

        if (!outcome.executed) {
            return [];
        }

        return AdbEmulatorDriver._parse(outcome.stdout ?? '');
    }

    /**
     * Parse the device ids out of `adb devices` output.
     * @param {string} stdout - The adb output.
     * @returns {string[]} Device ids.
     */
    protected static _parse(stdout: string): string[] {
        return stdout
        .split('\n')
        .map((line): string => line.trim())
        .filter((line): boolean => line.length > 0 && !line.startsWith('List of devices') && !line.startsWith('*'))
        .map((line): string => line.split(WHITESPACE)[0] ?? '')
        .filter((id): boolean => id.length > 0);
    }

}