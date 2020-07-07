import encHex from "crypto-js/enc-hex";
import sha256 from "crypto-js/sha256";
import * as querystring from "querystring";
import * as http from "http";
import {Observable} from 'rxjs';
import WebSocket, {ClientOptions} from "ws";
import {sigmaAirManagerHost, sigmaAirManagerPassword, sigmaAirManagerPort, sigmaAirManagerUser} from "./config";
import Timeout = NodeJS.Timeout;

interface SessionInfo {
    sid: string;
    upgrades: string[];
    pingInterval: number;
    pingTimeout: number;
}

interface ParsedFromMediMessage {
    metric: string;
    data: any;
}

interface WebSocketMessage {
    returnCode: number;
    object: any;
    parsed?: ParsedFromMediMessage;
}

interface ArraySearchToken {
    attribute: string;
    value: string;
}

export class SigmaAirManagerBackend {
    currentValues: any = {};
    private cookies: string[] = [];
    private heartbeat: Timeout;
    private alive: Timeout;
    private send2: Timeout;

    static syslogMessage(level: string = 'debug', message: string = 'Socket.IO upgrade to transport websocket', timestamp = Date.now()) {
        return [
            "syslog", {
                "level": level,
                "message": message,
                "timestamp": timestamp
            }]
    }

    static initReady() {
        return ["initReady"];
    }

    static joinRoom(room: string) {
        return ["joinroom", room];
    }

    static toMedi(endpoint: string, target: string, parameters: string, msgId: number) {
        return [
            "tomedi",
            {
                "endpoint": endpoint,
                "target": target,
                "parameters": parameters,
                "msgId": msgId
            }
        ]
    }

    static heartbeat() {
        return ["hmiHeartbeat", Date.now()];
    }

    static alive() {
        return ["alive"];
    }

    encodeWebSocketMessage(prefix: number, object?: any): string {
        return prefix.toString() + (
            object
                ? (typeof object === 'string' || object instanceof String)
                ? object
                : JSON.stringify(object)
                : '');
    }

    decodeWebSocketMessage(message: string): WebSocketMessage {
        const re = /^([0-9]+)(.*)/;
        const match = message.match(re);
        const result: WebSocketMessage = {
            returnCode: parseInt(match[1], 10),
            object: match[2] ?
                (match[2][0] === '[' || match[2][0] === '{')
                    ? JSON.parse(match[2])
                    : match[2]
                : undefined
        };

        if (result && result.object && result.object[0] === 'frommedi') {
            let metricName = result.object[1].data.header.from;

            if (metricName !== 'algo/debugImage'
                && metricName !== 'anybus/inputImage'
                && metricName !== 'hull/controlVector') {
                const parsedBody = JSON.parse(result.object[1].data.body);

                if (metricName === 'leds/ledstate') {
                    metricName = metricName + ':' + parsedBody.name;
                }

                result.parsed = {
                    metric: metricName,
                    data: parsedBody
                }
            }
        }

        return result;
    }

    sendWebSocketInit(ws: WebSocket) {
        this.heartbeat = setInterval(
            () => ws.send(this.encodeWebSocketMessage(42, SigmaAirManagerBackend.heartbeat())),
            1000
        );
        this.alive = setInterval(
            () => ws.send(this.encodeWebSocketMessage(42, SigmaAirManagerBackend.alive())),
            10000
        );
        this.send2 = setInterval(
            () => ws.send(this.encodeWebSocketMessage(42, '2')),
            10000
        );
        ws.send(this.encodeWebSocketMessage(5));
        //   ws.send(this.encodeWebSocketMessage(42, SigmaAirManagerBackend.syslogMessage()));
        ws.send(this.encodeWebSocketMessage(42, SigmaAirManagerBackend.initReady()));
        ws.send(this.encodeWebSocketMessage(42, SigmaAirManagerBackend.joinRoom('HMI')));
        ws.send(this.encodeWebSocketMessage(42, SigmaAirManagerBackend.joinRoom('remoteHMI')));
        ws.send(this.encodeWebSocketMessage(42, SigmaAirManagerBackend.joinRoom('si/currentProcessImage')));

        ws.send(this.encodeWebSocketMessage(42,
            SigmaAirManagerBackend.toMedi('', 'sysmon/hasIotNetConflict', '""', 1)));
        ws.send(this.encodeWebSocketMessage(42,
            SigmaAirManagerBackend.toMedi('', 'importer/getsdcardstate', '{}', 2)));
        ws.send(this.encodeWebSocketMessage(42,
            SigmaAirManagerBackend.toMedi('', 'si/getConfiguration', null, 3)));
    }

    handleWebSocketMessage(ws: WebSocket, message: string) {
        this.currentValues['internal/last_timestamp'] = Date.now();
        const decodedMessage = this.decodeWebSocketMessage(message);
        switch (decodedMessage.returnCode) {
            case 3 :
                this.sendWebSocketInit(ws);
                break;
            case 41:
                console.log('connection closed');
                clearInterval(this.heartbeat);
                break;
            case 42:
                if (decodedMessage.parsed) {
                    this.currentValues[decodedMessage.parsed.metric] = decodedMessage.parsed.data;
                }
                break;
            default:
                console.log('received message with unknown returnCode ' + decodedMessage.returnCode, decodedMessage.object)
        }
    }

    initWebSocket(sessionInfo: SessionInfo): void {
        const query = querystring.stringify(
            {
                'EIO': 3,
                transport: 'websocket',
                sid: sessionInfo.sid
            }
        );

        const clientOptions: ClientOptions = {
            headers: {
                'Cookie': this.cookies.join('; '),
            }
        };

        const ws = new WebSocket(
            'ws://' + sigmaAirManagerHost + '/socket.io/?' + query, clientOptions);

        ws.on('open',
            () => {
                ws.send(this.encodeWebSocketMessage(2, 'probe'));
            });

        ws.on('message',
            (data: string) => {
                this.handleWebSocketMessage(ws, data);
            });

        ws.on('error', (err: Error) => {
            console.error('WebSocket error', err)
        });

        ws.on('close', (code: number, data: string) => {
            console.log('WebSocket closed', code, data);
            if (code !== 1000) {
                this.initialize();
            }
        })
    }

    getSession(): Observable<SessionInfo> {
        // request option
        const options = {
            host: sigmaAirManagerHost,
            port: sigmaAirManagerPort,
            method: 'GET',
            path: '/socket.io/?transport=polling',
            headers: {
                'Cookie': this.cookies.join('; '),
            }
        };

        return new Observable<SessionInfo>(
            subscriber => {
                const req = http.request(
                    options,
                    (res) => {
                        let result = '';
                        if (res.statusCode !== 200) {
                            subscriber.error('received unexpected statusCode ' + res.statusCode)
                        } else {
                            res.on(
                                'data',
                                (chunk) => {
                                    result = result + chunk;
                                });

                            res.on(
                                'close',
                                () => {
                                    const jResult: SessionInfo = JSON.parse(
                                        result.replace(/(.*)({.*})(.*)/,
                                            '$2')
                                    );
                                    this.cookies.push('io=' + jResult.sid);
                                    subscriber.next(jResult);
                                    subscriber.complete();
                                });
                        }

                        res.on(
                            'error',
                            (err) => {
                                subscriber.error(err)
                            })
                    }
                );
                req.on('error', (err) => {
                    subscriber.error(err);
                });
                req.end();
            })
    }

    login(): Observable<void> {
        // login form data
        const postData = querystring.stringify({
            inputUser: sigmaAirManagerUser,
            inputPassword: '',
            inputPassHash: sha256(sigmaAirManagerPassword).toString(encHex)
        });

        // request option
        const options = {
            host: sigmaAirManagerHost,
            port: sigmaAirManagerPort,
            method: 'POST',
            path: '/HMI/login.html',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': postData.length
            }
        };

        return new Observable<void>(
            subscriber => {
                const req = http.request(
                    options,
                    (res) => {
                        if (res.statusCode !== 302) {
                            subscriber.error('received unexpected statusCode ' + res.statusCode)
                        } else {
                            if (res.headers.location !== '/HMI') {
                                subscriber.error('invalid redirect to ' + res.headers.location + ' expected /HMI. Check credentials')
                            } else {
                                this.cookies = res.headers["set-cookie"];
                                subscriber.next();
                                subscriber.complete();
                            }
                        }

                        res.on(
                            'error',
                            (err) => {
                                subscriber.error(err)
                            })
                    });

                req.on('error', (err) => {
                    subscriber.error(err);
                });

                req.write(postData);
                req.end();
            }
        )
    }

    initialize() {
        this.login().subscribe(
            () => {
                console.log('Logged into Sigma Air Manager');
                this.getSession()
                    .subscribe(
                        (session) => {
                            console.log('Received Sigma Air Manager Session ' + session.sid + ' for user ' + sigmaAirManagerUser);
                            this.initWebSocket(session)
                        },
                        error => console.error(error)
                    )
            },
            error => console.error(error)
        );
    }

    renderAsPrometheusGauge(
        name: string,
        help: string,
        valuePath: (string | number | ArraySearchToken)[],
        valueTransfomerFn?: (rawValue: any) => string,
        valueValidityCheckFn?: (rawValue: any) => boolean,
        labels?: any): string[] {
        let object = this.currentValues;

        valuePath.forEach(
            value => {
                if (typeof object !== 'undefined' && object !== null) {
                    if (typeof value === 'object' && Array.isArray(object)) {
                        object = (object as any[]).find(
                            element => element[(value as ArraySearchToken).attribute] === (value as ArraySearchToken).value
                        );
                    } else {
                        object = object[value as string | number];
                    }
                }
            }
        );

        if (typeof object === 'undefined' || object === null) {
            return [];
        }

        const result: string[] = [];
        if (help) {
            result.push(`# HELP ${name} ${help}`);
            result.push(`# TYPE ${name} gauge`);
        }

        let labelsStr = '';
        if (labels) {
            const labelArray: string[] = [];
            for (const key in labels) {
                if (labels.hasOwnProperty(key)) {
                    labelArray.push(key + '="' + escape(labels[key]) + '"')
                }
            }
            labelsStr = '{' + labelArray.join(';') + '}';
        }

        if (!valueValidityCheckFn || valueValidityCheckFn(object)) {
            if (!!valueTransfomerFn) {
                result.push(name + labelsStr + ' ' + valueTransfomerFn(object))
            } else {
                result.push(name + labelsStr + ' ' + object.toString())
            }
        }
        return result;
    }
}
