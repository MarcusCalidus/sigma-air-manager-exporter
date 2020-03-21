import express from 'express';
import {serverPort} from './config';
import {SigmaAirManagerBackend} from "./sigma-air-manager-backend";

const app = express();
const sigmaAirManagerBackend = new SigmaAirManagerBackend();

app.get('/currentValues', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(sigmaAirManagerBackend.currentValues));
});

app.get('/values', (req, res) => {
    const valuePrefix = 'sigma_airman_';
    let result: string[] = [];
    res.setHeader('Content-Type', 'text/plain');

    result.push(...sigmaAirManagerBackend.renderAsPrometheusGauge(
        valuePrefix + 'terminal_temp_cpu',
        'CPU temperature of SAM 4.0 terminal in Kelvin',
        ['sysmon/publish', 'measurementData', 'hwmon0_T', 'value']
    ));

    result.push(...sigmaAirManagerBackend.renderAsPrometheusGauge(
        valuePrefix + 'terminal_temp_board',
        'Board temperature of SAM 4.0 terminal in Kelvin',
        ['sysmon/publish', 'measurementData', 'hwmon1_T', 'value']
    ));

    result.push(...sigmaAirManagerBackend.renderAsPrometheusGauge(
        valuePrefix + 'terminal_temp_display',
        'Display temperature of SAM 4.0 terminal in Kelvin',
        ['sysmon/publish', 'measurementData', 'hwmon2_T', 'value']
    ));

    result.push(...sigmaAirManagerBackend.renderAsPrometheusGauge(
        valuePrefix + 'terminal_voltage',
        'Supply voltage of SAM 4.0 terminal in Volt',
        ['sysmon/publish', 'measurementData', 'hwmon3_U', 'value']
    ));

    result.push(...sigmaAirManagerBackend.renderAsPrometheusGauge(
        valuePrefix + 'currentNetPressure',
        'Current pressure in Pascal',
        ['si/Netzdruck', 'currentNetPressure', 'value']
    ));

    res.end(result.join('\n'));
});

// start the Express server
app.listen(serverPort, () => {
    console.log(`server started at http://localhost:${serverPort}`);
    sigmaAirManagerBackend.initialize()
});
