/**
 *      Web server for ioBroker
 *
 *      Copyright (c) 2013-2014 hobbyquacker, bluefox http://iobroker.com
 *
 *      CC BY-NC 3.0
 *
 *      Commercial use not allowed!
 *      Kommerzielle Nutzung nicht gestattet!
 *      Комерческое использование запрещено!
 *
 */

// Keep WebStorm satisfied
if (typeof __dirname == "undefined") {
    var __dirname = "";
}

var settings = require(__dirname+'/../../settings.js');

var logger =    require(__dirname+'/../../logger.js'),
    express =   require('express'),
    http =      require('http'),
    https =     require('https'),
    crypto =    require('crypto'),
    app,
    appSsl,
    server,
    serverSsl,
    authHash = "";

if (settings.ioListenPort) {
    app = express();

    if (settings.authentication && settings.authentication.enabled) {
        app.use(express.basicAuth(settings.authentication.user, settings.authentication.password));
    }

    server = require('http').createServer(app);
}

// Create md5 hash of user and password
if (settings.authentication.user && settings.authentication.password) {
    // We can add the client IP address, so the key will be different for every client, but the server should calculate hash on the fly
    authHash = crypto.createHash('md5').update(settings.authentication.user+settings.authentication.password).digest("hex");
}

if (settings.ioListenPortSsl) {
    var options = null;

    // Can we read certificates
    try {
        options = {
            key: fs.readFileSync(__dirname+'/cert/privatekey.pem'),
            cert: fs.readFileSync(__dirname+'/cert/certificate.pem')
        };
    } catch(err) {
        logger.error(err.message);
    }
    if (options) {
        appSsl = express();
        if (settings.authentication && settings.authentication.enabledSsl) {
            appSsl.use(express.basicAuth(settings.authentication.user, settings.authentication.password));
        }
        serverSsl = require('https').createServer(options, appSsl);
    }
}

function uploadParser(req, res, next) {
    var urlParts = url.parse(req.url, true);
    var query = urlParts.query;

    //console.log(query);

    // get the temporary location of the file
    var tmpPath = req.files.file.path;

    logger.info("webserver <-- file upload "+req.files.file.name+" ("+req.files.file.size+" bytes) to "+tmpPath);
    logger.info("webserver <-- file upload query params "+JSON.stringify(query));

    var newName;
    if (query.id) {
        newName = query.id + "." + req.files.file.name.replace(/.*\./, "");
    } else {
        newName = req.files.file.name;
    }
    // set where the file should actually exists - in this case it is in the "images" directory
    var targetPath = __dirname + "/" + query.path + newName;
    logger.info("webserver     move uploaded file "+tmpPath+" -> "+targetPath);

    // move the file from the temporary location to the intended location
    fs.rename(tmpPath, targetPath, function(err) {
        if (err) throw err;
        // delete the temporary file, so that the explicitly set temporary upload dir does not get filled with unwanted files
        fs.unlink(tmpPath, function() {
            if (err) throw err;
            res.send('File uploaded to: ' + targetPath + ' - ' + req.files.file.size + ' bytes');
        });
    });
}

function findDatapoint (needle, hssdp) {
    if (!dataValues[needle]) {
        if (metaIndex.Name[needle]) {
            // Get by Name
            needle = metaIndex.Name[needle][0];
            if (hssdp) {
                // Get by Name and Datapoint
                if (metaObjects[needle].DPs) {
                    return metaObjects[needle].DPs[hssdp];
                } else {
                    return false;
                }
            }
        } else if (metaIndex.Address[needle]) {
            needle = metaIndex.Address[needle][0];
            if (hssdp) {
                // Get by Channel-Address and Datapoint
                if (metaObjects[needle].DPs && metaObjects[needle].DPs[hssdp]) {
                    needle = metaObjects[needle].DPs[hssdp];
                }
            }
        } else if (needle.match(/[a-zA-Z-]+\.[0-9A-Za-z-]+:[0-9]+\.[A-Z_]+/)) {
            // Get by full BidCos-Address
            addrArr = needle.split(".");
            if (metaIndex.Address[addrArr[1]]) {
                needle = metaObjects[metaIndex.Address[addrArr[1]]].DPs[addArr[2]];
            }
        } else {
            return false;
        }
    }
    return needle;

}

function restApiPost(req, res) {
    var path = req.params[0];
    var tmpArr = path.split("/");
    var command = tmpArr[0];
    var response;

    var responseType = "json";
    var status = 500;

    res.set("Access-Control-Allow-Origin", "*");

    switch(command) {
        case "setBulk":
            response = [];
            status = 200;
            for (var item in req.body) {
                var parts = item.split("/");
                var dp = findDatapoint(parts[0], parts[1]);
                if (dp == false) {
                    sres = {error: "datapoint "+item+" not found"};
                } else if (req.body[item] === undefined) {
                    sres = {error: "no value given for "+item};
                } else {
                    sres = {id:dp,value:req.body[item]};
                    setState(dp,req.body[item]);
                }
                response.push(sres);
            }
            break;
        default:
            response = {error: "command "+command+" unknown"};
    }
    switch (responseType) {
        case "json":
            res.json(response);
            break;
        case "plain":
            res.set('Content-Type', 'text/plain');
            res.send(response);
            break;

    }
}

/* TODO */
function restApi(req, res) {

    var path = req.params[0];
    var tmpArr = path.split("/");
    var command = tmpArr[0];
    var response;

    var responseType = "json";
    var status = 500;

    res.set("Access-Control-Allow-Origin", "*");

    switch(command) {
        case "getPlainValue":
            responseType = "plain";
            if (!tmpArr[1]) {
                response = "error: no datapoint given";
                break;
            }
            var dp = findDatapoint(tmpArr[1], tmpArr[2]);
            if (!dp || !dataValues[dp]) {
                response = "error: datapoint not found";
            } else {
                response = String(dataValues[dp][0]);
                status = 200;
            }
            break;
        case "get":

            if (!tmpArr[1]) {
                response = {error: "no object/datapoint given"};
                break;
            }
            var dp_ = findDatapoint(tmpArr[1], tmpArr[2]);
            if (!dp_) {
                response = {error: "object/datapoint not found"};
            } else {
                status = 200;
                response = {id: dp_};
                if (dataValues[dp_]) {
                    response.value      = dataValues[dp_][0];
                    response.ack        = dataValues[dp_][2];
                    response.timestamp  = dataValues[dp_][1];
                    response.lastchange = dataValues[dp_][3];
                }
                if (metaObjects[dp_]) {
                    for (var attr in metaObjects[dp_]) {
                        response[attr] = metaObjects[dp_][attr];
                    }
                }
            }
            break;
        case "getBulk":
            if (!tmpArr[1]) {
                response = {error: "no dataValues given"};
                break;
            }
            status = 200;
            response = {};
            var dps = tmpArr[1].split(",");
            for (var i = 0; i < dps.length; i++) {
                var parts = dps[i].split(";");
                dp = findDatapoint(parts[0], parts[1]);
                if (dp) {
                    response[dps[i]] = {"val":dataValues[dp][0], "ts":dataValues[dp][3]};
                }
            }
            break;
        case "set":
            if (!tmpArr[1]) {
                response = {error: "object/datapoint not given"};
            }
            var dp = findDatapoint(tmpArr[1], tmpArr[2]);
            var value;
            if (req.query) {
                value = req.query.value;
            }
            if (!value) {
                response = {error: "no value given"};
            } else {
                if (value === "true") {
                    value = true;
                } else if (value === "false") {
                    value = false;
                } else if (!isNaN(value)) {
                    value = parseFloat(value);
                }
                setState(dp, value);
                status = 200;
                response = {id:dp,value:value};
            }
            break;
        case "toggle":
            if (!tmpArr[1]) {
                response = {error: "object/datapoint not given"};
            }
            var dp = findDatapoint(tmpArr[1], tmpArr[2]);
                var value = dataValues[dp][0];
                if (value === true) value = 1;
                if (value === false) value = 0;
                value = 1 - parseInt(value, 10);
                setState(dp, value);
                status = 200;
                response = {id:dp,value:value};
            break;
        case "setBulk":
            response = [];
            status = 200;
            for (var item in req.query) {
                var parts = item.split("/");
                var dp = findDatapoint(parts[0], parts[1]);
                if (dp == false) {
                    sres = {error: "datapoint "+item+" not found"};
                } else if (req.query[item] === undefined) {
                    sres = {error: "no value given for "+item};
                } else {
                    sres = {id:dp,value:req.query[item]};
                    setState(dp,req.query[item]);
                }
                response.push(sres);
            }
            break;
        case "programExecute":
            if (!tmpArr[1]) {
                response = {error: "no program given"};
            }
            var id;
            if (metaIndex.Program && metaIndex.PROGRAM.indexOf(tmpArr[1]) != -1) {
                id = tmpArr[1]
            } else if (metaIndex.Name && metaIndex.Name[tmpArr[1]]) {
                if (metaObjects[tmpArr[1]].TypeName == "PROGRAM") {
                    id = metaIndex.Name[tmpArr[1]][0];
                }
            }
            if (!id) {
                response = {error: "program not found"};
            } else {
                status = 200;
                programExecute(id);
                response = {id:id};
            }
            break;
        case "getIndex":
            response = metaIndex;
            status = 200;
            break;
        case "getObjects":
            response = metaObjects;
            status = 200;
            break;
        case "getdataValues":
            response = dataValues;
            status = 200;
            break;
        default:
            response = {error: "command "+command+" unknown"};
    }
    switch (responseType) {
        case "json":
            res.json(response);
            break;
        case "plain":
            res.set('Content-Type', 'text/plain');
            res.send(response);
            break;

    }

}

function initWebserver() {
    if (app) {
        if (settings.useCache) {
            var oneYear = 30758400000;
            app.use('/', express.static(__dirname + '/../../www', { maxAge: oneYear }));
            app.use('/log', express.static(__dirname + '/../../log', { maxAge: oneYear }));
        }
        else {
            app.use('/', express.static(__dirname + '/../../www'));
            app.use('/log', express.static(__dirname + '/../../log'));
        }

        // File Uploads
        app.use(express.bodyParser({uploadDir:__dirname+'/../../tmp'}));
        app.post('/upload', uploadParser);

        app.get('/api/*', restApi);

        app.post('/api/*', restApiPost);
        app.get('/auth/*', function (req, res) {
            res.set('Content-Type', 'text/javascript');
            if (settings.authentication.enabled) {
                res.send("var socketSession='"+ authHash+"';");
            } else {
                res.send("var socketSession='nokey';");
            }
        });
        app.get('/lang/*', function (req, res) {
            res.set('Content-Type', 'text/javascript');
			res.send("var systemLang='"+ (settings.language || 'en') +"';");
        });    
	}

    if (appSsl) {
        if (settings.useCache) {
            var oneYear_ = 30758400000;
            appSsl.use('/', express.static(__dirname + '/../../www', { maxAge: oneYear_ }));
            appSsl.use('/log', express.static(__dirname + '/../../log', { maxAge: oneYear_ }));
        }
        else {
            appSsl.use('/', express.static(__dirname + '/../../www'));
            appSsl.use('/log', express.static(__dirname + '/../../log'));
        }

        // File Uploads
        appSsl.use(express.bodyParser({uploadDir:__dirname+'/../../tmp'}));
        appSsl.post('/upload', uploadParser);

        appSsl.get('/api/*', restApi);
        appSsl.post('/api/*', restApiPost);
        appSsl.get('/auth/*', function (req, res) {
            res.set('Content-Type', 'text/javascript');
            if (settings.authentication.enabledSsl) {
                res.send("var socketSession='"+ authHash+"';");
            } else {
                res.send("var socketSession='nokey';");
            }
        });
        appSsl.get('/lang/*', function (req, res) {
            res.set('Content-Type', 'text/javascript');
			res.send("var systemLang='"+ (settings.language || 'en') +"';");
        });    
    }

    if (settings.authentication && settings.authentication.enabled) {
        logger.info("webserver     basic auth enabled");
    }

    if (server) {
        server.listen(settings.ioListenPort);
        logger.info("webserver     listening on port "+settings.ioListenPort);
    }

    if (serverSsl){
        serverSsl.listen(settings.ioListenPortSsl);
        logger.info("webserver ssl listening on port "+settings.ioListenPortSsl);
    }
}

process.on('SIGINT', function () {
    stop();
});

process.on('SIGTERM', function () {
    stop();
});

function stop() {
    logger.verbose("webserver     terminating");
    setTimeout(function () {
        process.exit(0);
    }, 250);
}


initWebserver();

