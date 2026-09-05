let instance: any;

jest.mock('../src/sigma-air-manager-backend', () => {
    const actual = jest.requireActual('../src/sigma-air-manager-backend');
    return {
        // keep the real rendering logic, but hold on to the instance the app builds
        SigmaAirManagerBackend: jest.fn().mockImplementation(() => {
            instance = new actual.SigmaAirManagerBackend();
            return instance;
        })
    };
});

import request from 'supertest';
import {app} from '../src/index';

afterEach(() => {
    ['heartbeat', 'alive', 'send2'].forEach(timer => clearInterval(instance[timer]));
});

describe('GET /valuesJson', () => {
    it('returns the raw current values as JSON', async () => {
        instance.currentValues = {'sysmon/hasIotNetConflict': false, 'internal/last_timestamp': 1234};

        const res = await request(app).get('/valuesJson');

        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toContain('application/json');
        expect(JSON.parse(res.text)).toEqual(instance.currentValues);
    });

    it('returns an empty object before anything has been received', async () => {
        instance.currentValues = {};

        const res = await request(app).get('/valuesJson');

        expect(JSON.parse(res.text)).toEqual({});
    });
});

describe('GET /values', () => {
    it('renders 1 for is_alive_info on a fresh timestamp', async () => {
        instance.currentValues = {'internal/last_timestamp': Date.now()};

        const res = await request(app).get('/values');

        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toContain('text/plain');
        expect(res.text).toContain('# TYPE sigma_airman_is_alive_info gauge');
        expect(res.text).toContain('\nsigma_airman_is_alive_info 1');
    });

    it('renders 0 for is_alive_info once the last message is over a minute old', async () => {
        instance.currentValues = {'internal/last_timestamp': Date.now() - 5 * 60 * 1000};

        const res = await request(app).get('/values');

        expect(res.text).toContain('\nsigma_airman_is_alive_info 0');
    });

    it('omits gauges whose values have not been received', async () => {
        instance.currentValues = {};

        const res = await request(app).get('/values');

        expect(res.text).not.toContain('sigma_airman_is_alive_info');
        expect(res.text).not.toContain('sigma_airman_sysmon_temp_cpu_celcius');
    });

    it('converts a Kelvin sysmon reading to Celsius, honouring the valid flag', async () => {
        instance.currentValues = {
            'sysmon/publish': {measurementData: {hwmon0_T: {value: 300, valid: true}}}
        };

        const res = await request(app).get('/values');

        expect(res.text).toContain('sigma_airman_sysmon_temp_cpu_celcius 26.850000000000023');
    });

    it('drops the sample of an invalid sysmon reading, but still declares the metric', async () => {
        instance.currentValues = {
            'sysmon/publish': {measurementData: {hwmon0_T: {value: 300, valid: false}}}
        };

        const res = await request(app).get('/values');

        // HELP and TYPE are pushed before the validity check, so an invalid
        // reading leaves the metric declared with no sample line
        expect(res.text).toContain('# TYPE sigma_airman_sysmon_temp_cpu_celcius gauge');
        expect(res.text).not.toMatch(/^sigma_airman_sysmon_temp_cpu_celcius /m);
    });
});
