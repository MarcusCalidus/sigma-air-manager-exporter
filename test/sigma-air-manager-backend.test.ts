import {SigmaAirManagerBackend} from '../src/sigma-air-manager-backend';

// sendWebSocketInit starts three keepalive intervals and the backend offers no
// way to stop them, so every instance a test makes is tracked and cleared here.
const created: SigmaAirManagerBackend[] = [];

const backend = () => {
    const instance = new SigmaAirManagerBackend();
    created.push(instance);
    return instance;
};

afterEach(() => {
    created.forEach(instance => ['heartbeat', 'alive', 'send2'].forEach(
        timer => clearInterval((instance as any)[timer])
    ));
    created.length = 0;
});

describe('websocket message framing', () => {
    const b = backend();

    it('encodes a bare prefix', () => {
        expect(b.encodeWebSocketMessage(5)).toBe('5');
    });

    it('encodes a string payload verbatim and an object as JSON', () => {
        expect(b.encodeWebSocketMessage(42, '2')).toBe('422');
        expect(b.encodeWebSocketMessage(42, ['alive'])).toBe('42["alive"]');
    });

    it('decodes a prefix with a JSON body', () => {
        expect(b.decodeWebSocketMessage('42["alive"]'))
            .toEqual({returnCode: 42, object: ['alive']});
    });

    it('decodes a prefix with a plain-text body', () => {
        expect(b.decodeWebSocketMessage('42abc'))
            .toEqual({returnCode: 42, object: 'abc'});
    });

    it('decodes a bare prefix to an undefined body', () => {
        expect(b.decodeWebSocketMessage('3'))
            .toEqual({returnCode: 3, object: undefined});
    });

    it('parses a frommedi body out of its JSON string', () => {
        const message = '42' + JSON.stringify(['frommedi', {
            data: {header: {from: 'sysmon/hasIotNetConflict'}, body: JSON.stringify({value: true})}
        }]);

        expect(b.decodeWebSocketMessage(message).parsed)
            .toEqual({metric: 'sysmon/hasIotNetConflict', data: {value: true}});
    });

    it('qualifies a ledstate metric with the led name', () => {
        const message = '42' + JSON.stringify(['frommedi', {
            data: {header: {from: 'leds/ledstate'}, body: JSON.stringify({name: 'power', on: 1})}
        }]);

        expect(b.decodeWebSocketMessage(message).parsed!.metric).toBe('leds/ledstate:power');
    });

    it.each(['algo/debugImage', 'anybus/inputImage', 'hull/controlVector'])(
        'skips parsing the high-volume %s payload', from => {
            const message = '42' + JSON.stringify(['frommedi', {
                data: {header: {from}, body: 'not even json'}
            }]);

            expect(b.decodeWebSocketMessage(message).parsed).toBeUndefined();
        });
});

describe('outbound message builders', () => {
    it('builds the fixed control messages', () => {
        expect(SigmaAirManagerBackend.initReady()).toEqual(['initReady']);
        expect(SigmaAirManagerBackend.alive()).toEqual(['alive']);
        expect(SigmaAirManagerBackend.joinRoom('HMI')).toEqual(['joinroom', 'HMI']);
    });

    it('builds a tomedi envelope', () => {
        expect(SigmaAirManagerBackend.toMedi('', 'si/getConfiguration', null as any, 3)).toEqual([
            'tomedi',
            {endpoint: '', target: 'si/getConfiguration', parameters: null, msgId: 3}
        ]);
    });

    it('stamps the heartbeat with a timestamp', () => {
        const before = Date.now();
        const [name, timestamp] = SigmaAirManagerBackend.heartbeat() as [string, number];

        expect(name).toBe('hmiHeartbeat');
        expect(timestamp).toBeGreaterThanOrEqual(before);
    });
});

describe('sendWebSocketInit', () => {
    it('sends the handshake sequence and starts the keepalive timers', () => {
        // fake timers for the whole test: calling sendWebSocketInit twice would
        // overwrite the interval handles and orphan the first set
        jest.useFakeTimers();
        try {
            const b = backend();
            const sent: string[] = [];
            const ws: any = {send: (m: string) => sent.push(m)};

            b.sendWebSocketInit(ws);

            expect(sent[0]).toBe('5');
            expect(sent[1]).toBe('42["initReady"]');
            expect(sent[2]).toBe('42["joinroom","HMI"]');
            expect(sent[3]).toBe('42["joinroom","remoteHMI"]');
            expect(sent[4]).toBe('42["joinroom","si/currentProcessImage"]');
            expect(sent[5]).toContain('sysmon/hasIotNetConflict');
            expect(sent[6]).toContain('importer/getsdcardstate');
            expect(sent[7]).toContain('si/getConfiguration');

            // the heartbeat keepalive fires once a second
            const countBefore = sent.length;
            jest.advanceTimersByTime(1000);
            expect(sent.length).toBeGreaterThan(countBefore);
        } finally {
            jest.useRealTimers();
        }
    });
});

describe('handleWebSocketMessage', () => {
    it('replies to a code 3 open frame with the handshake', () => {
        const b = backend();
        const sent: string[] = [];
        const ws: any = {send: (m: string) => sent.push(m)};

        b.handleWebSocketMessage(ws, '3');

        expect(sent[0]).toBe('5');
    });

    it('stores a parsed metric under its name', () => {
        const b = backend();
        const message = '42' + JSON.stringify(['frommedi', {
            data: {header: {from: 'sysmon/hasIotNetConflict'}, body: JSON.stringify({value: true})}
        }]);

        b.handleWebSocketMessage({send: (): void => undefined} as any, message);

        expect(b.currentValues['sysmon/hasIotNetConflict']).toEqual({value: true});
    });

    it('records a timestamp for every message received', () => {
        const b = backend();
        const before = Date.now();

        b.handleWebSocketMessage({send: (): void => undefined} as any, '42[]');

        expect(b.currentValues['internal/last_timestamp']).toBeGreaterThanOrEqual(before);
    });

    it('replaces the whole process image when fullImg is set', () => {
        const b = backend();
        const image = {fullImg: true, compressors: [{id: 1, pressure: 7}]};
        const message = '42' + JSON.stringify(['frommedi', {
            data: {header: {from: 'si/currentProcessImage'}, body: JSON.stringify(image)}
        }]);

        b.handleWebSocketMessage({send: (): void => undefined} as any, message);

        expect(b.currentValues['si/currentProcessImage']).toEqual(image);
    });

    it('applies a replace patch into the existing process image', () => {
        const b = backend();
        const full = '42' + JSON.stringify(['frommedi', {
            data: {
                header: {from: 'si/currentProcessImage'},
                body: JSON.stringify({fullImg: true, net: {pressure: 7}})
            }
        }]);
        const patch = '42' + JSON.stringify(['frommedi', {
            data: {
                header: {from: 'si/currentProcessImage'},
                body: JSON.stringify([{op: 'replace', path: '/net/pressure', value: 8}])
            }
        }]);
        const ws: any = {send: (): void => undefined};

        b.handleWebSocketMessage(ws, full);
        b.handleWebSocketMessage(ws, patch);

        expect(b.currentValues['si/currentProcessImage'].net.pressure).toBe(8);
        expect(b.currentValues['si/currentProcessImage'].fullImg).toBe(false);
    });

    it('creates missing intermediate objects along a patch path', () => {
        const b = backend();
        const full = '42' + JSON.stringify(['frommedi', {
            data: {header: {from: 'si/currentProcessImage'}, body: JSON.stringify({fullImg: true})}
        }]);
        const patch = '42' + JSON.stringify(['frommedi', {
            data: {
                header: {from: 'si/currentProcessImage'},
                body: JSON.stringify([{op: 'replace', path: '/a/b/c', value: 42}])
            }
        }]);
        const ws: any = {send: (): void => undefined};

        b.handleWebSocketMessage(ws, full);
        b.handleWebSocketMessage(ws, patch);

        expect(b.currentValues['si/currentProcessImage'].a.b.c).toBe(42);
    });
});

describe('renderAsPrometheusGauge', () => {
    const withValues = (values: any) => {
        const b = backend();
        b.currentValues = values;
        return b;
    };

    it('renders help, type and sample lines', () => {
        const b = withValues({'sysmon/temp': 21});

        expect(b.renderAsPrometheusGauge('sam_temp', 'Terminal temperature', ['sysmon/temp'])).toEqual([
            '# HELP sam_temp Terminal temperature',
            '# TYPE sam_temp gauge',
            'sam_temp 21'
        ]);
    });

    it('omits help and type lines when no help text is given', () => {
        const b = withValues({'sysmon/temp': 21});

        expect(b.renderAsPrometheusGauge('sam_temp', '', ['sysmon/temp'])).toEqual(['sam_temp 21']);
    });

    it('returns nothing when the path does not resolve', () => {
        const b = withValues({'sysmon/temp': 21});

        expect(b.renderAsPrometheusGauge('x', 'h', ['nope', 'deeper'])).toEqual([]);
    });

    it('walks into an array by attribute match', () => {
        const b = withValues({compressors: [{id: 'c1', pressure: 6}, {id: 'c2', pressure: 8}]});

        const out = b.renderAsPrometheusGauge('p', '', ['compressors', {attribute: 'id', value: 'c2'}, 'pressure']);

        expect(out).toEqual(['p 8']);
    });

    it('applies a value transformer', () => {
        const b = withValues({t: 300});

        expect(b.renderAsPrometheusGauge('c', '', ['t'], v => (v - 273.15).toFixed(2))).toEqual(['c 26.85']);
    });

    it('drops the sample when the validity check fails', () => {
        const b = withValues({t: {value: 1, valid: false}});

        expect(b.renderAsPrometheusGauge('c', '', ['t'], v => String(v.value), v => v.valid)).toEqual([]);
    });

    it('renders labels', () => {
        const b = withValues({t: 5});

        expect(b.renderAsPrometheusGauge('c', '', ['t'], undefined, undefined, {unit: 'bar'}))
            .toEqual(['c{unit="bar"} 5']);
    });
});
