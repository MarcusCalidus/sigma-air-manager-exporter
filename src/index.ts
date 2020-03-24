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

function KelvinToCelciusGaugeValue(value: number) {
    return ((value || 0) - 273.15).toString(10);
}

function BoolToGaugeValue(value: any) {
    return !!value ? '1' : '0';
}

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
                return BoolToGaugeValue(false);
            } else if (diffValue > 1) {
                console.warn('WARNING! Timestamp of Air Manager lies in the future by ' + Math.round(diffValue) + ' minutes.');
                return BoolToGaugeValue(false);
            } else {
                return BoolToGaugeValue(true)
            }
        }
    ));

    result.push(...sigmaAirManagerBackend.renderAsPrometheusGauge(
        valuePrefix + 'sysmon_has_iot_net_conflict_info',
        'Has Iot Network Conflict',
        ['sysmon/hasIotNetConflict'],
        (value) => BoolToGaugeValue(value)
    ));

    result.push(...sigmaAirManagerBackend.renderAsPrometheusGauge(
        valuePrefix + 'sysmon_temp_cpu_celcius',
        'CPU temperature of SAM 4.0 terminal in Celcius',
        ['sysmon/publish', 'measurementData', 'hwmon0_T'],
        (value) => KelvinToCelciusGaugeValue(value.value),
        (value) => value.valid,
    ));

    result.push(...sigmaAirManagerBackend.renderAsPrometheusGauge(
        valuePrefix + 'sysmon_temp_board_celcius',
        'Board temperature of SAM 4.0 terminal in Celcius',
        ['sysmon/publish', 'measurementData', 'hwmon1_T'],
        (value) => KelvinToCelciusGaugeValue(value.value),
        (value) => value.valid,
    ));

    result.push(...sigmaAirManagerBackend.renderAsPrometheusGauge(
        valuePrefix + 'sysmon_temp_display_celcius',
        'Display temperature of SAM 4.0 terminal in Celcius',
        ['sysmon/publish', 'measurementData', 'hwmon2_T'],
        (value) => KelvinToCelciusGaugeValue(value.value),
        (value) => value.valid,
    ));

    result.push(...sigmaAirManagerBackend.renderAsPrometheusGauge(
        valuePrefix + 'sysmon_terminal_power_volts',
        'Supply voltage of SAM 4.0 terminal in Volts',
        ['sysmon/publish', 'measurementData', 'hwmon3_U'],
        (value) => value.value,
        (value) => value.valid,
    ));
}

function CubicMetrePerMinuteToCubicMetrePerHourGaugeValue(value: any) {
    return ((value || 0) * 60.0).toString(10);
}

function renderGlobalPressureFlow(result: string[], valuePrefix: string) {
    result.push(...sigmaAirManagerBackend.renderAsPrometheusGauge(
        valuePrefix + 'net_pressure_pascal',
        'Current network pressure in Pascal',
        ['si/Netzdruck', 'currentNetPressure'],
        (value) => value.value,
        (value) => value.valid,
    ));

    result.push(...sigmaAirManagerBackend.renderAsPrometheusGauge(
        valuePrefix + 'consumption_cubicmetersperhour',
        'Compressed air consumption in Cubic metre / hour',
        ['hull/algoImage', 'consumption', 'currentState', 'current'],
        (value) => CubicMetrePerMinuteToCubicMetrePerHourGaugeValue(value)
    ));

    result.push(...sigmaAirManagerBackend.renderAsPrometheusGauge(
        valuePrefix + 'free_air_delivery_cubicmetersperhour',
        'Volumetric flow rate (FAD) in Cubic metre / hour',
        ['hull/algoImage', 'consumption', 'currentState', 'FAD'],
        (value) => CubicMetrePerMinuteToCubicMetrePerHourGaugeValue(value)
    ));
}

function renderCompressorValues(result: string[], valuePrefix: string) {
    const arrays: any = {};

    if ((sigmaAirManagerBackend.currentValues['si/currentProcessImage'] || {}).image) {
        let firstRun = true;
        for (const key in sigmaAirManagerBackend.currentValues['si/currentProcessImage'].image['AIR_PRODUCER']) {
            if (sigmaAirManagerBackend.currentValues['si/currentProcessImage'].image['AIR_PRODUCER'].hasOwnProperty(key)) {
                try {
                    const compressorName = sigmaAirManagerBackend
                        .currentValues['si/getConfiguration']
                        .result.AIR_PRODUCER[key]
                        .parameters.modelShortName;

                    arrays.rpm = (arrays.rpm || []).concat(...sigmaAirManagerBackend.renderAsPrometheusGauge(
                        valuePrefix + 'compressor_rpm',
                        firstRun ? 'Compressor revolutions per minute' : null,
                        ['si/currentProcessImage', 'image', 'AIR_PRODUCER', parseInt(key, 10), 'inputs', 'SAM2_rpmCompressorMotor'],
                        (value) => value.value,
                        (value) => value.valid,
                        {compressor: compressorName}
                    ));

                    arrays.lnp = (arrays.lnp || []).concat(sigmaAirManagerBackend.renderAsPrometheusGauge(
                        valuePrefix + 'compressor_local_net_pressure_pascal',
                        firstRun ? 'Local network pressure in Pascal' : null,
                        ['si/currentProcessImage', 'image', 'AIR_PRODUCER', parseInt(key, 10), 'inputs', 'SAM2_localNetPressure'],
                        (value) => value.value,
                        (value) => value.valid,
                        {compressor: compressorName}
                    ));

                    arrays.ip = (arrays.ip || []).concat(sigmaAirManagerBackend.renderAsPrometheusGauge(
                        valuePrefix + 'compressor_internal_pressure_pascal',
                        firstRun ? 'internal pressure in Pascal' : null,
                        ['si/currentProcessImage', 'image', 'AIR_PRODUCER', parseInt(key, 10), 'inputs', 'SAM2_internalPressure'],
                        (value) => value.value,
                        (value) => value.valid,
                        {compressor: compressorName}
                    ));

                    arrays.adt = (arrays.adt || []).concat(sigmaAirManagerBackend.renderAsPrometheusGauge(
                        valuePrefix + 'compressor_airend_discharge_temperature_celcius',
                        firstRun ? 'Airend discharge temperature in Celcius' : null,
                        ['si/currentProcessImage', 'image', 'AIR_PRODUCER', parseInt(key, 10), 'inputs', 'SAM2_ADT'],
                        (value) => KelvinToCelciusGaugeValue(value.value),
                        (value) => value.valid,
                        {compressor: compressorName}
                    ));

                    arrays.mott = (arrays.mott || []).concat(sigmaAirManagerBackend.renderAsPrometheusGauge(
                        valuePrefix + 'compressor_motor_temperature_celcius',
                        firstRun ? 'Motor temperature in Celcius' : null,
                        ['si/currentProcessImage', 'image', 'AIR_PRODUCER', parseInt(key, 10), 'inputs', 'SAM2_motorTemperature'],
                        (value) => KelvinToCelciusGaugeValue(value.value),
                        (value) => value.valid,
                        {compressor: compressorName}
                    ));

                    arrays.itt = (arrays.itt || []).concat(sigmaAirManagerBackend.renderAsPrometheusGauge(
                        valuePrefix + 'compressor_intake_temperature_celcius',
                        firstRun ? 'Intake temperature in Celcius' : null,
                        ['si/currentProcessImage', 'image', 'AIR_PRODUCER', parseInt(key, 10), 'inputs', 'SAM2_intakeTemperature'],
                        (value) => KelvinToCelciusGaugeValue(value.value),
                        (value) => value.valid,
                        {compressor: compressorName}
                    ));

                    arrays.out = (arrays.out || []).concat(sigmaAirManagerBackend.renderAsPrometheusGauge(
                        valuePrefix + 'compressor_outlet_temperature_celcius',
                        firstRun ? 'Outlet temperature in Celcius' : null,
                        ['si/currentProcessImage', 'image', 'AIR_PRODUCER', parseInt(key, 10), 'inputs', 'SAM2_outletTemperature'],
                        (value) => KelvinToCelciusGaugeValue(value.value),
                        (value) => value.valid,
                        {compressor: compressorName}
                    ));

                    arrays.il = (arrays.il || []).concat(sigmaAirManagerBackend.renderAsPrometheusGauge(
                        valuePrefix + 'compressor_is_load_info',
                        firstRun ? 'Is load' : null,
                        ['si/currentProcessImage', 'image', 'AIR_PRODUCER', parseInt(key, 10), 'inputs', 'SAM2_isLoad'],
                        (value) => BoolToGaugeValue(value.value),
                        (value) => value.valid,
                        {compressor: compressorName}
                    ));

                    arrays.ii = (arrays.ii || []).concat(sigmaAirManagerBackend.renderAsPrometheusGauge(
                        valuePrefix + 'compressor_is_idle_info',
                        firstRun ? 'Is idle' : null,
                        ['si/currentProcessImage', 'image', 'AIR_PRODUCER', parseInt(key, 10), 'inputs', 'SAM2_isIdle'],
                        (value) => BoolToGaugeValue(value.value),
                        (value) => value.valid,
                        {compressor: compressorName}
                    ));

                    arrays.mir = (arrays.mir || []).concat(sigmaAirManagerBackend.renderAsPrometheusGauge(
                        valuePrefix + 'compressor_is_motor_running_info',
                        firstRun ? 'Is motor running' : null,
                        ['si/currentProcessImage', 'image', 'AIR_PRODUCER', parseInt(key, 10), 'inputs', 'SAM2_isMotorRunning'],
                        (value) => BoolToGaugeValue(value.value),
                        (value) => value.valid,
                        {compressor: compressorName}
                    ));

                    arrays.trt = (arrays.trt || []).concat(sigmaAirManagerBackend.renderAsPrometheusGauge(
                        valuePrefix + 'compressor_total_run_time_seconds',
                        firstRun ? 'Total run time in seconds' : null,
                        ['si/currentProcessImage', 'image', 'AIR_PRODUCER', parseInt(key, 10), 'inputs', 'SAM2_totalRunTime'],
                        (value) => value.value,
                        (value) => value.valid,
                        {compressor: compressorName}
                    ));

                    arrays.tlt = (arrays.tlt || []).concat(sigmaAirManagerBackend.renderAsPrometheusGauge(
                        valuePrefix + 'compressor_total_load_time_seconds',
                        firstRun ? 'Total load time in seconds' : null,
                        ['si/currentProcessImage', 'image', 'AIR_PRODUCER', parseInt(key, 10), 'inputs', 'SAM2_totalLoadTime'],
                        (value) => value.value,
                        (value) => value.valid,
                        {compressor: compressorName}
                    ));


                    arrays.ltsaps = (arrays.ltsaps || []).concat(sigmaAirManagerBackend.renderAsPrometheusGauge(
                        valuePrefix + 'compressor_load_time_since_air_producer_start_seconds',
                        firstRun ? 'Load time since air producer start in seconds' : null,
                        ['si/currentProcessImage', 'image', 'AIR_PRODUCER', parseInt(key, 10), 'inputs', 'SAM2_loadTimeSinceAirProducerStart'],
                        (value) => value.value,
                        (value) => value.valid,
                        {compressor: compressorName}
                    ));

                    arrays.wlt = (arrays.wlt || []).concat(sigmaAirManagerBackend.renderAsPrometheusGauge(
                        valuePrefix + 'compressor_weekly_load_time_seconds',
                        firstRun ? 'Weekly load time in seconds' : null,
                        ['si/currentProcessImage', 'image', 'AIR_PRODUCER', parseInt(key, 10), 'inputs', 'SAM2_weeklyLoadTime'],
                        (value) => value.value,
                        (value) => value.valid,
                        {compressor: compressorName}
                    ));

                    arrays.rtos = (arrays.rtos || []).concat(sigmaAirManagerBackend.renderAsPrometheusGauge(
                        valuePrefix + 'compressor_remaining_time_oil_separator_seconds',
                        firstRun ? 'Remaining time oil separator in seconds' : null,
                        ['si/currentProcessImage', 'image', 'AIR_PRODUCER', parseInt(key, 10), 'inputs', 'SAM2_remainingTimeOilSeparator'],
                        (value) => value.value,
                        (value) => value.valid,
                        {compressor: compressorName}
                    ));

                    arrays.rtoc = (arrays.rtoc || []).concat(sigmaAirManagerBackend.renderAsPrometheusGauge(
                        valuePrefix + 'compressor_remaining_time_oil_change_seconds',
                        firstRun ? 'Remaining time oil change in seconds' : null,
                        ['si/currentProcessImage', 'image', 'AIR_PRODUCER', parseInt(key, 10), 'inputs', 'SAM2_remainingTimeOilChange'],
                        (value) => value.value,
                        (value) => value.valid,
                        {compressor: compressorName}
                    ));

                    arrays.rtof = (arrays.rtof || []).concat(sigmaAirManagerBackend.renderAsPrometheusGauge(
                        valuePrefix + 'compressor_remaining_time_oil_filter_seconds',
                        firstRun ? 'Remaining time oil filter in seconds' : null,
                        ['si/currentProcessImage', 'image', 'AIR_PRODUCER', parseInt(key, 10), 'inputs', 'SAM2_remainingTimeOilFilter'],
                        (value) => value.value,
                        (value) => value.valid,
                        {compressor: compressorName}
                    ));

                    arrays.rtaf = (arrays.rtaf || []).concat(sigmaAirManagerBackend.renderAsPrometheusGauge(
                        valuePrefix + 'compressor_remaining_time_air_filter_seconds',
                        firstRun ? 'Remaining time air filter in seconds' : null,
                        ['si/currentProcessImage', 'image', 'AIR_PRODUCER', parseInt(key, 10), 'inputs', 'SAM2_remainingTimeAirFilter'],
                        (value) => value.value,
                        (value) => value.valid,
                        {compressor: compressorName}
                    ));

                    arrays.rtv = (arrays.rtv || []).concat(sigmaAirManagerBackend.renderAsPrometheusGauge(
                        valuePrefix + 'compressor_remaining_time_valve_seconds',
                        firstRun ? 'Remaining time valve in seconds' : null,
                        ['si/currentProcessImage', 'image', 'AIR_PRODUCER', parseInt(key, 10), 'inputs', 'SAM2_remainingTimeValve'],
                        (value) => value.value,
                        (value) => value.valid,
                        {compressor: compressorName}
                    ));

                    arrays.rtcpl = (arrays.rtcpl || []).concat(sigmaAirManagerBackend.renderAsPrometheusGauge(
                        valuePrefix + 'compressor_remaining_time_coupling_seconds',
                        firstRun ? 'Remaining time coupling in seconds' : null,
                        ['si/currentProcessImage', 'image', 'AIR_PRODUCER', parseInt(key, 10), 'inputs', 'SAM2_remainingTimeCoupling'],
                        (value) => value.value,
                        (value) => value.valid,
                        {compressor: compressorName}
                    ));

                    arrays.rtmb = (arrays.rtmb || []).concat(sigmaAirManagerBackend.renderAsPrometheusGauge(
                        valuePrefix + 'compressor_remaining_time_motor_bearing_seconds',
                        firstRun ? 'Remaining time motor bearing in seconds' : null,
                        ['si/currentProcessImage', 'image', 'AIR_PRODUCER', parseInt(key, 10), 'inputs', 'SAM2_remainingTimeMotorBearing'],
                        (value) => value.value,
                        (value) => value.valid,
                        {compressor: compressorName}
                    ));

                    arrays.rtel = (arrays.rtel || []).concat(sigmaAirManagerBackend.renderAsPrometheusGauge(
                        valuePrefix + 'compressor_remaining_time_electric_seconds',
                        firstRun ? 'Remaining time electric in seconds' : null,
                        ['si/currentProcessImage', 'image', 'AIR_PRODUCER', parseInt(key, 10), 'inputs', 'SAM2_remainingTimeElectric'],
                        (value) => value.value,
                        (value) => value.valid,
                        {compressor: compressorName}
                    ));

                    arrays.rtlub = (arrays.rtlub || []).concat(sigmaAirManagerBackend.renderAsPrometheusGauge(
                        valuePrefix + 'compressor_remaining_time_lubrication_seconds',
                        firstRun ? 'Remaining time lubrication in seconds' : null,
                        ['si/currentProcessImage', 'image', 'AIR_PRODUCER', parseInt(key, 10), 'inputs', 'SAM2_remainingTimeLubrication'],
                        (value) => value.value,
                        (value) => value.valid,
                        {compressor: compressorName}
                    ));

                    arrays.mtt = (arrays.mtt || []).concat(sigmaAirManagerBackend.renderAsPrometheusGauge(
                        valuePrefix + 'compressor_maintenance_timer_seconds',
                        firstRun ? 'Maintenance timer in seconds' : null,
                        ['si/currentProcessImage', 'image', 'AIR_PRODUCER', parseInt(key, 10), 'states', 'SAM2_remaingTimeNextMaintenance'],
                        (value) => value.value,
                        (value) => value.valid,
                        {compressor: compressorName}
                    ));

                    arrays.pw = (arrays.pw || []).concat(sigmaAirManagerBackend.renderAsPrometheusGauge(
                        valuePrefix + 'compressor_power_consumption_watts',
                        firstRun ? 'Power consumption in Watt' : null,
                        ['si/currentProcessImage', 'image', 'AIR_PRODUCER', parseInt(key, 10), 'states', 'SAM2_powerConsumption'],
                        (value) => value.value,
                        (value) => value.valid,
                        {compressor: compressorName}
                    ));

                    arrays.pwcum = (arrays.pwcum || []).concat(sigmaAirManagerBackend.renderAsPrometheusGauge(
                        valuePrefix + 'compressor_power_consumption_cumulative_watts',
                        firstRun ? 'Power consumption cumulative in Watt' : null,
                        ['si/currentProcessImage', 'image', 'AIR_PRODUCER', parseInt(key, 10), 'states', 'SAM2_powerConsumptionCumulative'],
                        (value) => value.value,
                        (value) => value.valid,
                        {compressor: compressorName}
                    ));

                    arrays.fad = (arrays.fad || []).concat(sigmaAirManagerBackend.renderAsPrometheusGauge(
                        valuePrefix + 'compressor_free_air_delivery_cubicmetersperhour',
                        firstRun ? 'Volumetric flow rate (FAD) in Cubic metre / hour' : null,
                        ['si/currentProcessImage', 'image', 'AIR_PRODUCER', parseInt(key, 10), 'states', 'SAM2_freeAirDelivery'],
                        (value) => CubicMetrePerMinuteToCubicMetrePerHourGaugeValue(value.value),
                        (value) => value.valid,
                        {compressor: compressorName}
                    ));

                    arrays.fadcum = (arrays.fadcum || []).concat(sigmaAirManagerBackend.renderAsPrometheusGauge(
                        valuePrefix + 'compressor_free_air_delivery_cumulative_cubicmetersperhour',
                        firstRun ? 'Volumetric flow rate (FAD) cumulative in Cubic metre / hour' : null,
                        ['si/currentProcessImage', 'image', 'AIR_PRODUCER', parseInt(key, 10), 'states', 'SAM2_freeAirDeliveryCumulative'],
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

        for (let key in arrays) {
            if (arrays.hasOwnProperty(key)) {
                result.push(...arrays[key])
            }
        }
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
