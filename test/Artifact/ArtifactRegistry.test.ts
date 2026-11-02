import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {ArtifactRegistry, FileStore} from '../../src/index';
import {makeArtifact} from '../fixtures';

const DIGEST_A = 'a'.repeat(64);
const DIGEST_B = 'b'.repeat(64);

describe('ArtifactRegistry', () => {
    let dir: string;
    let registry: ArtifactRegistry;

    beforeEach(async () => {
        dir = await mkdtemp(join(tmpdir(), 'kyklos-artifact-'));
        registry = new ArtifactRegistry(new FileStore(dir));
    });

    afterEach(async () => {
        await rm(dir, {recursive: true, force: true});
    });

    it('registers an artifact and reads it back by digest', async () => {
        await registry.register(makeArtifact());
        const read = await registry.get(DIGEST_A);
        expect(read?.id).toBe(DIGEST_A);
    });

    it('is idempotent on the same digest (same content, same artifact)', async () => {
        await registry.register({...makeArtifact(), name: 'first'});
        const second = await registry.register({...makeArtifact(), name: 'second'});
        // The digest already existed, so the stored (first) artifact wins — no throw, no overwrite.
        expect(second.name).toBe('first');
    });

    it('treats a different digest as a different artifact', async () => {
        await registry.register({...makeArtifact(), id: DIGEST_A});
        await registry.register({...makeArtifact(), id: DIGEST_B});
        expect((await registry.get(DIGEST_A))?.id).toBe(DIGEST_A);
        expect((await registry.get(DIGEST_B))?.id).toBe(DIGEST_B);
    });

    it('returns undefined for an unknown digest', async () => {
        expect(await registry.get(DIGEST_B)).toBeUndefined();
    });
});
