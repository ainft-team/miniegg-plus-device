const { UART } = require('uart');
const { ATCommand } = require('at');
const { URL } = require('url');
const ECN = ['OPEN', 'WEP', 'WPA PSK', 'WPA2 PSK', 'WPA WPA2 PSK', 'WPA2-EAP'];

class ESP8266HTTPClient {
    constructor(serial, options) {
        if (!serial) {
            serial = new UART(0, { baudrate: 115200 });
        }
        this._nets = [];
        this.at = new ATCommand(serial, options);
        this.at.addHandler('+CWLAP:', (line) => {
            line = line.trim();
            const n = line.substr(8, line.length - 10);
            const tokens = n.split(',');
            if (tokens.length >= 5) {
                try {
                    const net = {
                        security: ECN[Number(tokens[0])],
                        ssid: JSON.parse(tokens[1]),
                        rssi: Number(tokens[2]),
                        bssid: JSON.parse(tokens[3]),
                        channel: Number(tokens[4]),
                    };
                    this._nets.push(net);
                } catch (err) {
                    console.error(err.toString(), line);
                }
            }
        });
    }

    reset() {
        return new Promise((resolve, reject) => {
            this._nets = [];
            this.at.send(
                'AT+RST',
                () => {
                    this.at.send('AT+CWMODE=1', (r) => {
                        if (r === 'OK') {
                            resolve();
                        } else {
                            reject('AT+CWMODE=1 failed');
                        }
                    });
                },
                ['WIFI DISCONNECT'],
                { timeout: 5000 }
            );
        });
    }

    /**
     * Connect to a Wi-Fi network
     */
    wifi(connect = {}) {
        return new Promise((resolve, reject) => {
            const ssid = connect.ssid || storage.getItem('ssid');
            const pwd = connect.password || storage.getItem('pwd') || "";
            if (!ssid) {
                return reject('No ssid');
            }
            this.at.send(`AT+CWJAP="${ssid}","${pwd}"`, (r) => {
                if (r === 'OK') {
                    resolve();
                } else {
                    reject('Connection failed');
                }
            });
        });
    }

    /**
     * Scan Wi-Fi networks
     */
    scan() {
        this._nets = [];
        return new Promise((resolve, reject) => {
            this.at.send(
                'AT+RST',
                () => {
                    this.at.send('AT+CWLAP', (r) => {
                        if (r === 'OK') {
                            resolve(this._nets);
                        } else {
                            console.log(r);
                            reject('Scan failed');
                        }
                    });
                },
                500
            );
        });
    }

    /**
     * Transfer and receive data within a TCP connection
     * 1. Establish TCP connection
     * 2. Send request data
     * 3. Receive response data
     * 4. Close the connection (or closed by peer)
     */
    _transfer(host, port, req, timeout, cb) {
        let res = '';
        let closed = false;
        const _recv = (line, buffer) => {
            buffer = line + buffer;
            let idx = buffer.indexOf('+IPD,');
            if (idx > -1) {
                let pos = buffer.indexOf(':', idx);
                if (pos > -1) {
                    idx += 5;
                    let len = parseInt(buffer.substr(idx, pos).trim());
                    if (buffer.length > pos + len) {
                        let data = buffer.substr(pos + 1, len);
                        res += data;
                        return buffer.substr(pos + len + 1);
                    }
                }
            }
            return false;
        };
        const _close = () => {
            closed = true;
            cb(null, res);
        };
        this.at.addHandler('+IPD,', _recv);
        this.at.addHandler('CLOSED', _close);
        this.at.send(`AT+CIPSTART="TCP","${host}",${port}`, (r1) => {
            if (r1 === 'OK') {
                this.at.send(`AT+CIPSEND=${req.length}`, (r2) => {
                    if (r2 === 'OK') {
                        this.at.send(
                            req,
                            (r3) => {
                                if (r3 === 'SEND OK') {
                                    setTimeout(() => {
                                        if (!closed)
                                            this.at.send('AT+CIPCLOSE');
                                    }, timeout);
                                } else {
                                    cb('Connection Error');
                                }
                            },
                            ['SEND OK', 'SEND FAIL', 'ERROR'],
                            { sendAsData: true }
                        );
                    } else {
                        cb('Connection Error');
                    }
                });
            } else {
                cb('Connection Error');
            }
        });
    }

    /**
     * Parse HTTP response
     */
    _parse(data) {
        if (data.trim().length > 0) {
            var idx = data.indexOf('\r\n\r\n');
            var body = data.substr(idx).replace(/^\s+/g, ''); // trim leading whilte spaces only
            var lines = data.substr(0, idx).trim().split('\r\n');
            var terms = lines.shift().split(' ');
            var status = parseInt(terms[1].trim());
            var headers = {};
            lines.forEach((l) => {
                var pair = l.split(':');
                headers[pair[0].trim().toLowerCase()] = pair[1].trim();
            });
            if (headers['transfer-encoding'] === 'chunked') {
                var buf = body;
                var quit = false;
                body = '';
                while (!quit) {
                    var i = buf.indexOf('\r\n');
                    if (i > -1) {
                        var l = buf.substr(0, i);
                        var cl = parseInt('0x' + l); // chunk length
                        if (cl > 0) {
                            if (buf.length >= i + cl + 2) {
                                // chunk received
                                var chunk = buf.substr(i + 2, cl);
                                body += chunk;
                                buf = buf.substr(i + 2 + cl + 2);
                            } else {
                                // data not received yet
                                quit = true;
                            }
                        } else {
                            // end chunk
                            quit = true;
                        }
                    }
                }
            }
            return {
                status: status,
                statusText: terms[2].trim(),
                ok: status >= 200 && status < 300,
                headers: headers,
                body: body,
            };
        }
        return null;
    }

    /**
     * Send HTTP request and receive the response
     * @param {string} url
     * @param {object} options
     */
    http(url, options) {
        options = Object.assign({ method: 'GET', timeout: 10000 }, options);
        let _url = new URL(url);
        let _req = `${options.method} ${
            _url.pathname + _url.search
        } HTTP/1.1\r\n`;
        let _headers = Object.assign(
            {
                host: _url.host,
                connection: 'close',
                'content-length': options.body
                    ? Object.keys(options.body).length.toString()
                    : '0',
            },
            options.headers
        );
        Object.keys(_headers).forEach((key) => {
            _req += `${key}: ${_headers[key]}\r\n`;
        });
        _req += '\r\n';
        _req += options.body || '';
        return new Promise((resolve, reject) => {
            this._transfer(
                _url.hostname,
                _url.port || 80,
                _req,
                options.timeout,
                (err, res) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(this._parse(res));
                    }
                }
            );
        });
    }
}

exports.ESP8266HTTPClient = ESP8266HTTPClient;
