'use strict';

const fs = require('fs');
const rfs = require('rotating-file-stream');
const Koa = require('koa');
const bodyParser = require('koa-bodyparser');
const routes = require('./app/routes');
const mongoose = require('koa-mongoose');
mongoose.Promise = global.Promise;
const winston = require('winston');
winston.transports.DailyRotateFile = require('winston-daily-rotate-file');


function isProduction() {
    return process.env.NODE_ENV === 'production';
}

function loadConfig() {
    function getConfigFilename() {
        const envFilename = process.env.CONFIG_FILE;
        if (envFilename) {
            return envFilename;
        } else {
            const env = process.env.NODE_ENV || 'development';
            return __dirname + `/config/config-${env}.json`;
        }
    }

    const configFilename = getConfigFilename();
    try {
        const json = fs.readFileSync(configFilename);
        return JSON.parse(json);
    } catch (e) {
        winston.error(`Failed to load ${configFilename}`);
        return null;
    }
}

function initLogger(app) {
    const logDir = __dirname + '/logs';
    const accessLogFilename = 'access.log';
    const logFilename = 'app.log';

    const prodMode = isProduction();

    // create log directory
    if (prodMode) {
        fs.existsSync(logDir) || fs.mkdirSync(logDir);
    }

    // Access Logs
    if (prodMode) {
        const morgan = require('koa-morgan');
        const ws = rfs(accessLogFilename, {
            interval: '1d',
            path: logDir
        });
        app.use(morgan('combined', {stream: ws}))
    }
    else {
        app.use(require('koa-logger')());
    }

    // winston
    winston.level = process.env.LOG_LEVEL || 'debug';
    if (prodMode) {
        const path = `${logDir}/${logFilename}`;
        const pattern = '.yyyy-MM-dd';
        winston.add(winston.transports.DailyRotateFile, {
            filename: path,
            datePattern: pattern
        });
        winston.remove(winston.transports.Console);
    }
}

function initErrorLogger(app) {
    app.on('error', (err, ctx) => {
        winston.error('server error', err, ctx);
    });
}

function registerRoutes(app) {
    app.use(bodyParser());

    routes.registerRoutes();
    const router = routes.router;
    app.use(router.routes());
    app.use(router.allowedMethods());
}

function setupMongo(app, cfg) {
    app.use(mongoose(cfg));
}

function setStaticDir(app, directory) {
    app.use(require('koa-static')(directory, {}));
}

function startServer(app) {
    const port = 3000;
    winston.info('Server started.', {port: port});
    return app.listen(port);
}

function start(config) {
    if (!config) {
        return;
    }

    const app = new Koa();
    initLogger(app);
    initErrorLogger(app);
    setupMongo(app, config['mongo'] || {});
    registerRoutes(app);
    setStaticDir(app, './static');

    return startServer(app);
}

const config = loadConfig();
const server = start(config);

exports.config = config;
exports.server = server;

