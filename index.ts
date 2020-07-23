#!/usr/bin/env node

import * as express from "express"
import * as HttpProxy from "http-proxy"
import * as fs from "fs"
import * as hostile from "hostile"
import { Server } from "net";
import isElevated = require('is-elevated');
import * as debounce from "debounce"
import * as path from "path"

let configPath = path.join(__dirname, "config.json");

import * as winston from "winston"

const logFormat = winston.format.printf(info => {
    return `${info.level}: ${info.message}`;
});

const logger = winston.createLogger({
    transports: [new winston.transports.Console({
        level: "info",
        format: winston.format.combine(winston.format.colorize(), logFormat)
    })]
});

class ProxyShell {

    config: object = null;
    apiProxy: HttpProxy;
    server: Server

    constructor(config) {

        this.config = config;
    }

    async handleApi(req: express.Request, res: express.Response) {

        logger.warn("Direct calls to the proxy are not currently supported, in future an API will be available");
        res.status(404).send("Direct calls are not supported").end();
    }

    handleProxy(req: express.Request, res: express.Response) {

        let host = req.header("host");
        let target = this.config[host];

        if (target != null && target != "") {

            logger.info(`Request to "${host}", proxied to "${target}"`);

            try {
                this.apiProxy.web(req, res, {
                    target: target
                }, (err) => {
                    logger.warn(`Error proxying ${host} to "${target}" with message "${err}"`);
                    res.status(503).send(`PROXY: Service error: "${err}"`).end();
                });
            }
            catch (ex) {
                logger.error(ex);
            }
        } else {
            logger.warn(`Request to "${host}", cannot be proxied due to no config`);
            res.status(503).send("PROXY: Service not configured").end();
        }
    }

    async Start() {

        const port = 80;

        // Get the domains
        for (let domain of Object.keys(this.config)) {

            let target = this.config[domain];

            logger.info(`Proxying traffic for "${domain}"`);

            // TODO confirm the domain has a protocol

            await this.addToHosts(domain);
        }

        if (Object.keys(this.config).length == 0) {
            logger.warn("No proxied addresses listed!");
        }

        // Setup the reverse-proxy
        const app: express.Application = express();
        this.apiProxy = HttpProxy.createProxyServer();

        app.all("*", (req, res) => {

            let host = req.header("host");
            let target = this.config[host];

            if (host !== "127.0.0.1") {

                this.handleProxy(req, res);
            }
            else {
                this.handleApi(req, res);
            }
        });

        this.server = app.listen(port, "127.0.0.1", () => {
            logger.info(`Reverse-proxy listening on port 127.0.0.1:${port}`)
        });
    }

    async removeFromHosts(domain: string) {

        await new Promise((res, rej) => hostile.remove("127.0.0.1", domain, (err?: string) => {
            if (err)
                rej();
            res();
        }));
    }

    async addToHosts(domain: string) {

        await new Promise((res, rej) => hostile.set("127.0.0.1", domain, (err?: string) => {
            if (err)
                rej();
            res();
        }));
    }

    async Stop(): Promise<any> {

        logger.info("Closing server");

        if (this.server)
            this.server.close();
        if (this.apiProxy)
            this.apiProxy.close();

        for (let domain of Object.keys(this.config)) {

            logger.info(`Removing "${domain}" from /etc/hosts`);
            await this.removeFromHosts(domain);
        }
    }
}

async function readConfig() {

    return await new Promise(async (res, rej) => {

        let doesConfigExists = await new Promise(resB => fs.exists(configPath, exists => {
            resB(exists);
        }));

        if (!doesConfigExists) {
            res({});
            return;
        }

        fs.readFile(configPath, (err, buff) => {

            try {
                res(JSON.parse(buff.toString()));
            } catch (ex) {

                logger.warn(`Error reading config: ${err}, ${ex}`);
                rej();
            }
        });
    });
}

async function main() {

    if (process.argv[2] == "add") {

        let data = await readConfig();

        let key = process.argv[3];
        let value = process.argv[4];

        if (!value.startsWith("http:") && !value.startsWith("https:")) {
            logger.warn("No protocol detected, assuming http://");
            value = `http://${value}`;
        }

        logger.info(`Adding ${key} = ${value}`);

        data[key] = value;

        await new Promise(res =>
            fs.writeFile(configPath, JSON.stringify(data), {}, err => res()));

        process.exit();
    }

    if (process.argv[2] == "clear") {

        logger.info(`Clearing config`);

        await new Promise(res =>
            fs.writeFile(configPath, "{}", {}, () => res()));

        process.exit();
    }

    if (!(await isElevated())) {

        logger.error("local-proxy needs to be run as Admin to edit the /etc/hosts file");
        process.exit(0);
    }

    let proxyShell: ProxyShell = null;

    try {
        proxyShell = new ProxyShell(await readConfig());
        await proxyShell.Start();
    }
    catch (ex) {
        winston.error(ex);
        process.exit();
    }

    logger.info(`Watching "${configPath}" for changes`)

    let reloadConfig = async () => {

        logger.info(`Stopping running proxy`);

        await proxyShell.Stop();

        logger.info(`Started reloading config`);

        try {
            proxyShell = new ProxyShell(await readConfig());
            await proxyShell.Start();
        }
        catch (ex) {
            logger.error(`ProxyShell starting failed: ${ex}`);
        }

        logger.info(`Finished reloading config`);
    }

    fs.watchFile(configPath, debounce(reloadConfig));

    // When closed, clean-up the host file
    process.on("SIGINT", async () => {

        await proxyShell.Stop();
        process.exit();
    });
}

main();