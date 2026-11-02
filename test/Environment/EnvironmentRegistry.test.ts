import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {EnvironmentRegistry, FileStore} from '../../src/index';
import {makeEnvironment} from '../fixtures';

describe('EnvironmentRegistry', () => {
    let dir: string;
    let registry: EnvironmentRegistry;

    beforeEach(async () => {
        dir = await mkdtemp(join(tmpdir(), 'kyklos-env-'));
        registry = new EnvironmentRegistry(new FileStore(dir));
    });

    afterEach(async () => {
        await rm(dir, {recursive: true, force: true});
    });

    it('registers, reads and lists environments', async () => {
        await registry.put(makeEnvironment());
        await registry.put({...makeEnvironment(), id: 'env-test-1', name: 'test-1'});
        const read = await registry.get('env-prod-1');
        expect(read.targetSystemId).toBe('debian-12');
        expect((await registry.list()).map((environment) => environment.id)).toEqual(['env-prod-1', 'env-test-1']);
    });

    it('refuses to re-register the same id (append-only)', async () => {
        await registry.put(makeEnvironment());
        await expect(registry.put(makeEnvironment())).rejects.toThrow();
    });
});
