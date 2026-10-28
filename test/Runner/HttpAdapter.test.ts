import {type AddressInfo, createServer, type Server} from 'node:http';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {AdapterKind, HttpAdapter} from '../../src/index';

let server: Server;
let base: string;
const adapter = new HttpAdapter();

beforeAll(async () => {
    server = createServer((req, res) => {
        if (req.url === '/hang') {
            return;
        }

        res.statusCode = 200;
        res.end('ok');
    });
    await new Promise<void>((resolve) => {
        server.listen(0, '127.0.0.1', () => {
            resolve();
        });
    });
    const port = (server.address() as AddressInfo).port;
    base = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => {
        server.close(() => {
            resolve();
        });
    });
});

describe('HttpAdapter', () => {
    it('captures the HTTP status of a completed request', async () => {
        const outcome = await adapter.execute({adapter: AdapterKind.Http, params: {url: `${base}/health`}});
        expect(outcome.executed).toBe(true);
        expect(outcome.httpStatus).toBe(200);
        expect(outcome.body).toBe('ok');
    });

    it('treats a timeout as not executable', async () => {
        const outcome = await adapter.execute({adapter: AdapterKind.Http, params: {url: `${base}/hang`, timeoutMs: 100}});
        expect(outcome.executed).toBe(false);
        expect(outcome.reason).toContain('http_error');
    });

    it('rejects invalid params', async () => {
        const outcome = await adapter.execute({adapter: AdapterKind.Http, params: {method: 'GET'}});
        expect(outcome.executed).toBe(false);
        expect(outcome.reason).toBe('invalid_params');
    });
});