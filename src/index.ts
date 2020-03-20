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
    res.end('Prometheus exporter not ready...')
    // ToDo: Format data for Prometheus
});

// start the Express server
app.listen(serverPort, () => {
    console.log(`server started at http://localhost:${serverPort}`);
    sigmaAirManagerBackend.initialize()
});
