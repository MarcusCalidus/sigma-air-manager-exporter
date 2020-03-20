import express from 'express';
import {serverPort} from './config';
import {SigmaAirManagerBackend} from "./sigma-air-manager-backend";

const app = express();
const sigmaAirManagerBackend = new SigmaAirManagerBackend();

app.get('/currentValues', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(sigmaAirManagerBackend.currentValues));
});

/*
app.get('/probe', (req, res) => {
    // create new Curl Object
    const curl = new Curl();

    // set Curl options
    curl.setOpt('URL', lanServerHost + '/export.csv?lang=english');
    curl.setOpt('FOLLOWLOCATION', true);

    // on Curl end result handle csv data in result
    curl.on(
        'end',
        (statusCode, data) => {
            const result: string[] = [];

            result.push('# HELP modbus_em_http_status_code Displays wheher or not the probe was a success');
            result.push('# TYPE modbus_em_http_status_code gauge');
            result.push('modbus_em_http_status_code ' + statusCode);

            if (statusCode !== 200) {
                result.push('# HELP modbus_em_success Displays wheher or not the probe was a success');
                result.push('# TYPE modbus_em_success gauge');
                result.push('modbus_em_success 0');
            } else {
                // convert csv to array
                const arrayData = parse(
                    data.toString(),
                    {
                        delimiter: ';',
                        skipEmptyLines: true
                    }).data;

                // find index of electricity meter.
                // PID of meter is taken from query parameter target e.g. /probe?target=5I8P1265
                const targetIndex = (arrayData[2] as string[]).findIndex( (s) => s.trim() === req.query.target);
                if (targetIndex < 0) {
                    // target not found? tell the client!
                    res.sendStatus(404)
                } else {
                    // everything seems fine
                    res.statusCode = 200;
                    res.setHeader('Content-Type', 'text/plain');

                    arrayData.forEach(
                        (record, index) => {
                            if (index > 2) {
                                const varName = 'modbus_em_' + record[0]
                                    .trim()
                                    .replace(/[^a-zA-Z0-9]/g, '_')
                                    .replace(/__/g, '_')
                                    .toLowerCase();

                                if (!varName.startsWith('modbus_em_factory_alarm_status')) {
                                    result.push('# HELP ' + varName + ' ' + record[0].trim() + ' ' + record[1].trim());
                                    result.push('# TYPE ' + varName + ' gauge');
                                    result.push(varName + ' ' + record[2].replace(',', '.').trim());
                                }
                            }
                        }
                    );

                    result.push('# HELP modbus_em_success Displays wheher or not the probe was a success');
                    result.push('# TYPE modbus_em_success gauge');
                    result.push('modbus_em_success 1');

                    res.send(result.join('\n'));
                }
            }
        });

    // Bei Curl Fehler, Verbindung trennen
    curl.on('error', curl.close.bind(curl));
    // Curl Request ausführen
    curl.perform();
});
*/

// start the Express server
app.listen(serverPort, () => {
    console.log(`server started at http://localhost:${serverPort}`);
    sigmaAirManagerBackend.initialize()
});
