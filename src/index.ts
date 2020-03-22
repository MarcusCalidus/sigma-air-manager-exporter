import express from 'express';
import {serverPort} from './config';
import {SigmaAirManagerBackend} from "./sigma-air-manager-backend";
import moment from 'moment';

const app = express();
const sigmaAirManagerBackend = new SigmaAirManagerBackend();

app.get('/valuesJson', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(sigmaAirManagerBackend.currentValues));
});

app.get('/values', (req, res) => {
    const valuePrefix = 'sigma_airman_';
    let result: string[] = [];
    res.setHeader('Content-Type', 'text/plain');

    result.push(...sigmaAirManagerBackend.renderAsPrometheusGauge(
        valuePrefix + 'is_alive',
        'Checks the timestamp of the last websocket communication. Will render 0 if last message is older than 1 minute.',
        ['internal/last_timestamp'],
        (value) => {
            const diffValue = moment(value)
                .diff(moment(), "minute", true);

            if (diffValue < -1) {
               return '0';
            } else {
                return '1'
            }
        }
    ));

    result.push(...sigmaAirManagerBackend.renderAsPrometheusGauge(
        valuePrefix + 'is_sync',
        'Checks the timestamp of the last sysmon message. Will render 0 if timestamp is older or newer than 1 minute.',
        ['sysmon/timestamp'],
        (value) => {
            const diffValue = moment(value.timestamp)
                .utcOffset(value.utcOffset)
                .diff(moment(), "minute", true);

            if (diffValue < -1) {
                console.warn('WARNING! Timestamp of Air Manager lies in the past by ' + Math.round(Math.abs(diffValue)) + ' minutes.');
                return '0';
            } else if (diffValue > 1) {
                console.warn('WARNING! Timestamp of Air Manager lies in the future by ' + Math.round(diffValue) + ' minutes.');
                return '0';
            } else {
                return '1'
            }
        }
    ));

    result.push(...sigmaAirManagerBackend.renderAsPrometheusGauge(
        valuePrefix + 'sysmon_has_iot_net_conflict',
        'Has Iot Network Conflict',
        ['sysmon/hasIotNetConflict'],
        (value) => !!value ? '1' : '0'
    ));

    result.push(...sigmaAirManagerBackend.renderAsPrometheusGauge(
        valuePrefix + 'sysmon_temp_cpu',
        'CPU temperature of SAM 4.0 terminal in Kelvin',
        ['sysmon/publish', 'measurementData', 'hwmon0_T', 'value']
    ));

    result.push(...sigmaAirManagerBackend.renderAsPrometheusGauge(
        valuePrefix + 'sysmon_temp_board',
        'Board temperature of SAM 4.0 terminal in Kelvin',
        ['sysmon/publish', 'measurementData', 'hwmon1_T', 'value']
    ));

    result.push(...sigmaAirManagerBackend.renderAsPrometheusGauge(
        valuePrefix + 'sysmon_temp_display',
        'Display temperature of SAM 4.0 terminal in Kelvin',
        ['sysmon/publish', 'measurementData', 'hwmon2_T', 'value']
    ));

    result.push(...sigmaAirManagerBackend.renderAsPrometheusGauge(
        valuePrefix + 'sysmon_voltage',
        'Supply voltage of SAM 4.0 terminal in Volt',
        ['sysmon/publish', 'measurementData', 'hwmon3_U', 'value']
    ));

    result.push(...sigmaAirManagerBackend.renderAsPrometheusGauge(
        valuePrefix + 'net_pressure',
        'Current network pressure in Pascal',
        ['si/Netzdruck', 'currentNetPressure', 'value']
    ));

    result.push(...sigmaAirManagerBackend.renderAsPrometheusGauge(
        valuePrefix + 'consumption',
        'Compressed air consumption in Cubic metre / Second',
        ['hull/algoImage', 'consumption', 'currentState', 'current'],
    ));

    result.push(...sigmaAirManagerBackend.renderAsPrometheusGauge(
        valuePrefix + 'fad',
        'Volumetric flow rate (FAD) in Cubic metre / Second',
        ['hull/algoImage', 'consumption', 'currentState', 'FAD'],
    ));

    res.end(result.join('\n'));
});

// start the Express server
app.listen(serverPort, () => {
    console.log(`server started at http://localhost:${serverPort}`);
    sigmaAirManagerBackend.initialize()
});
