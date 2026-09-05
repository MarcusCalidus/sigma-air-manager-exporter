import * as http from 'http';
import * as crypto from 'crypto';
import {AddressInfo} from 'net';
import {SigmaAirManagerBackend} from '../src/sigma-air-manager-backend';
import {pointAt, sigmaAirManagerPassword, sigmaAirManagerUser} from './stubs/config';

/**
 * Drives login() against a throwaway HTTP server. This is the only test that
 * exercises crypto-js for real - the password hash it posts is the one thing
 * the Sigma Air Manager authenticates on, so a regression there locks the
 * exporter out silently.
 */
describe('login', () => {
    let server: http.Server;
    let lastBody: string;
    let respond: (res: http.ServerResponse) => void;

    beforeAll(done => {
        server = http.createServer((req, res) => {
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', () => {
                lastBody = body;
                respond(res);
            });
        });
        server.listen(0, '127.0.0.1', () => {
            pointAt('127.0.0.1', (server.address() as AddressInfo).port);
            done();
        });
    });

    afterAll(done => {
        server.close(() => done());
    });

    beforeEach(() => {
        respond = res => {
            res.writeHead(302, {Location: '/HMI', 'Set-Cookie': ['session=abc']});
            res.end();
        };
    });

    it('posts the user and a SHA-256 hash of the password', done => {
        new SigmaAirManagerBackend().login().subscribe({
            next: () => {
                const params = new URLSearchParams(lastBody);
                const expected = crypto.createHash('sha256').update(sigmaAirManagerPassword).digest('hex');

                expect(params.get('inputUser')).toBe(sigmaAirManagerUser);
                expect(params.get('inputPassword')).toBe('');
                expect(params.get('inputPassHash')).toBe(expected);
                done();
            },
            error: done
        });
    });

    it('keeps the session cookie from a successful login', done => {
        const backend = new SigmaAirManagerBackend();
        backend.login().subscribe({
            next: () => {
                expect((backend as any).cookies).toEqual(['session=abc']);
                done();
            },
            error: done
        });
    });

    it('rejects a response that is not a redirect', done => {
        respond = res => {
            res.writeHead(200);
            res.end();
        };

        new SigmaAirManagerBackend().login().subscribe({
            next: () => done(new Error('login should not have succeeded')),
            error: err => {
                expect(err).toBe('received unexpected statusCode 200');
                done();
            }
        });
    });

    it('rejects a redirect to anywhere other than /HMI as bad credentials', done => {
        respond = res => {
            res.writeHead(302, {Location: '/login.html'});
            res.end();
        };

        new SigmaAirManagerBackend().login().subscribe({
            next: () => done(new Error('login should not have succeeded')),
            error: err => {
                expect(err).toContain('invalid redirect to /login.html expected /HMI. Check credentials');
                done();
            }
        });
    });
});
