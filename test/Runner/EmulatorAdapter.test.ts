import {describe, expect, it} from 'vitest';
import {AdapterKind, AdbEmulatorDriver, type EmulatorDriver, EmulatorAdapter} from '../../src/index';

const action = {adapter: AdapterKind.Emulator, params: {}};

const driverOf = (devices: string[]): EmulatorDriver => {
    return {listDevices: async (): Promise<string[]> => devices};
};

describe('EmulatorAdapter (capability-gated)', () => {
    it('is not executable without a driver', async () => {
        const outcome = await new EmulatorAdapter().execute(action);
        expect(outcome.executed).toBe(false);
        expect(outcome.reason).toContain('no_emulator_driver');
    });

    it('is not executable when no device/AVD is detected', async () => {
        const outcome = await new EmulatorAdapter(driverOf([])).execute(action);
        expect(outcome.executed).toBe(false);
        expect(outcome.reason).toContain('no_device_or_avd');
    });

    it('executes when a device is available', async () => {
        const outcome = await new EmulatorAdapter(driverOf(['emulator-5554'])).execute(action);
        expect(outcome.executed).toBe(true);
        expect(outcome.body).toContain('emulator-5554');
    });

    it('with the real adb driver, honestly reports no device/AVD in this environment', async () => {
        const outcome = await new EmulatorAdapter(new AdbEmulatorDriver()).execute(action);
        expect(outcome.executed).toBe(false);
        expect(outcome.reason).toContain('no_device_or_avd');
    });
});