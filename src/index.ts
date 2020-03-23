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

function renderSysMonValues(result: string[], valuePrefix: string) {
    result.push(...sigmaAirManagerBackend.renderAsPrometheusGauge(
        valuePrefix + 'is_sync_info',
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
        valuePrefix + 'sysmon_has_iot_net_conflict_info',
        'Has Iot Network Conflict',
        ['sysmon/hasIotNetConflict'],
        (value) => !!value ? '1' : '0'
    ));

    result.push(...sigmaAirManagerBackend.renderAsPrometheusGauge(
        valuePrefix + 'sysmon_temp_cpu_celcius',
        'CPU temperature of SAM 4.0 terminal in Celcius',
        ['sysmon/publish', 'measurementData', 'hwmon0_T', 'value'],
        (value) => ((value || 0) - 273.15).toString(10)
    ));

    result.push(...sigmaAirManagerBackend.renderAsPrometheusGauge(
        valuePrefix + 'sysmon_temp_board_celcius',
        'Board temperature of SAM 4.0 terminal in Celcius',
        ['sysmon/publish', 'measurementData', 'hwmon1_T', 'value'],
        (value) => ((value || 0) - 273.15).toString(10)
    ));

    result.push(...sigmaAirManagerBackend.renderAsPrometheusGauge(
        valuePrefix + 'sysmon_temp_display_celcius',
        'Display temperature of SAM 4.0 terminal in Celcius',
        ['sysmon/publish', 'measurementData', 'hwmon2_T', 'value'],
        (value) => ((value || 0) - 273.15).toString(10)
    ));

    result.push(...sigmaAirManagerBackend.renderAsPrometheusGauge(
        valuePrefix + 'sysmon_terminal_power_volts',
        'Supply voltage of SAM 4.0 terminal in Volts',
        ['sysmon/publish', 'measurementData', 'hwmon3_U', 'value']
    ));
}

function renderGlobalPressureFlow(result: string[], valuePrefix: string) {
    result.push(...sigmaAirManagerBackend.renderAsPrometheusGauge(
        valuePrefix + 'net_pressure_pascal',
        'Current network pressure in Pascal',
        ['si/Netzdruck', 'currentNetPressure', 'value']
    ));

    result.push(...sigmaAirManagerBackend.renderAsPrometheusGauge(
        valuePrefix + 'consumption_cubicmetersperhour',
        'Compressed air consumption in Cubic metre / hour',
        ['hull/algoImage', 'consumption', 'currentState', 'current'],
        (value) => ((value || 0) * 60.0).toString(10)
    ));

    result.push(...sigmaAirManagerBackend.renderAsPrometheusGauge(
        valuePrefix + 'fad_cubicmetersperhour',
        'Volumetric flow rate (FAD) in Cubic metre / hour',
        ['hull/algoImage', 'consumption', 'currentState', 'FAD'],
        (value) => ((value || 0) * 60.0).toString(10)
    ));
}

function renderCompressorValues(result: string[], valuePrefix: string) {
    const rpmArray = [];
    const maintenanceTimerArray = [];
    const powerArray = [];

    if ((sigmaAirManagerBackend.currentValues['si/currentProcessImage'] || {}).image) {
        let firstRun = true;
        for (const key in sigmaAirManagerBackend.currentValues['si/currentProcessImage'].image['AIR_PRODUCER']) {
            if (sigmaAirManagerBackend.currentValues['si/currentProcessImage'].image['AIR_PRODUCER'].hasOwnProperty(key)) {
                try {
                    const compressorName = sigmaAirManagerBackend
                        .currentValues['si/getConfiguration']
                        .result.AIR_PRODUCER[key]
                        .parameters.modelShortName;

                    rpmArray.push(...sigmaAirManagerBackend.renderAsPrometheusGauge(
                        valuePrefix + 'compressor_rpm',
                        firstRun ? 'Compressor revolutions per minute' : null,
                        ['si/currentProcessImage', 'image', 'AIR_PRODUCER', parseInt(key, 10), 'inputs', 'SAM2_rpmCompressorMotor'],
                        (value) => value.value,
                        (value) => value.valid,
                        {compressor: compressorName}
                    ));

                    maintenanceTimerArray.push(...sigmaAirManagerBackend.renderAsPrometheusGauge(
                        valuePrefix + 'compressor_maintenance_timer_seconds',
                        firstRun ? 'Maintenance timer in seconds' : null,
                        ['si/currentProcessImage', 'image', 'AIR_PRODUCER', parseInt(key, 10), 'states', 'SAM2_remaingTimeNextMaintenance'],
                        (value) => value.value,
                        (value) => value.valid,
                        {compressor: compressorName}
                    ));

                    powerArray.push(...sigmaAirManagerBackend.renderAsPrometheusGauge(
                        valuePrefix + 'compressor_power_watts',
                        firstRun ? 'Power in Watt' : null,
                        ['si/currentProcessImage', 'image', 'AIR_PRODUCER', parseInt(key, 10), 'states', 'SAM2_powerConsumption'],
                        (value) => value.value,
                        (value) => value.valid,
                        {compressor: compressorName}
                    ));

                    firstRun = false;
                } catch (e) {
                    console.error(e);
                }
            }
        }

        result.push(...rpmArray, ...maintenanceTimerArray, ...powerArray);
    }
}

app.get('/values', (req, res) => {
    const valuePrefix = 'sigma_airman_';
    const result: string[] = [];
    res.setHeader('Content-Type', 'text/plain');

    result.push(...sigmaAirManagerBackend.renderAsPrometheusGauge(
        valuePrefix + 'is_alive_info',
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

    renderSysMonValues(result, valuePrefix);
    renderGlobalPressureFlow(result, valuePrefix);
    renderCompressorValues(result, valuePrefix);

    res.end(result.join('\n'));
});

// start the Express server
app.listen(serverPort, () => {
    console.log(`server started at http://localhost:${serverPort}`);
    sigmaAirManagerBackend.initialize()
});
