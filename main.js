/**
 *      Homander - HOMe cOMmANDER for Node.js
 *
 *      Socket.IO based Home Automation Interface
 *
 *      Copyright (c) 2013-2014 hobbyquacker, bluefox http://homander.com
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

var settings = require(__dirname+'/settings.js');

settings.version             = "2.0.0";
settings.basedir             = __dirname;
settings.datastorePath       = __dirname+"/datastore/";
settings.stringTableLanguage = settings.stringTableLanguage || "de";

var fs =        require('fs-extra'),
    logger =    require(__dirname+'/logger.js'),
    express =   require('express'),
    http =      require('http'),
    https =     require('https'),
    crypto =    require('crypto'),
    request =   require('request'),
    cp =        require('child_process'),
    url =       require('url'),
    socketio =  require('socket.io'),
    scheduler = require('node-schedule'),
    _ =         require('lodash'),
    c =         require(__dirname+'/www/lib/js/sysConst.js'),
    os=         require('os'),
    app,
    appSsl,
    server,
    serverSsl,
    io,
    ioSsl,
    devlogCache = [],
    childrenAdapter = [],
    timerAdapter = [],
    extDone = false,
    authHash = "";

var socketList    = [], // Array of connected clients. It can be adapters, GUI
    metaObjects   = [], // Object tree
    dataValues    = [], // Values of the objects
    metaIndex     = {   // Mapping
        name:     [],   // [adpaterId] - {"name of object1": id, "name of object2": id}
        location: [],   // "living room" : [id1, id2, id3], "wc" : [id4, id2, id5] - ids are sorted
        role:     [],   // "Media" : [id1, id4], "Light" : [id6, id7] - ids are sorted
        device:   [],   // [id10, id20, id30] - List of all devices
        channel:  [],   // [id11, id12, id21, id31 ] - List of all channels
        point:    [],   // [id1, id4] - List of all points
        specType: [],   // "PLAY:3" : [id1], "HM-SEC1" : [id50], ...
        address:  [],   // [adpaterId] - specific addresses, like 192.168.2.3 or HQE67655444 {["SFGHE":id1], ["abcd": id2]}
        adapter:  {},   // { "sonos": 4, "System": 0, "script": 1}
        favorite: {},   // { "Light" : [34,56,43], "Heat": [123, 45, 64]}
        adapterInfo: [] // [ {name: System", type: "System" }]
    };

var statuses = {};


/** @namespace settings.logging.enabled */
/** @namespace settings.logging.file */
/** @namespace settings.logging.move */
/** @namespace settings.logging.varChangeOnly */
/** @namespace settings.logging.writeInterval */
/** @namespace settings.adapters */

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

logger.info   ("Homander  starting version "+settings.version + " copyright (c) 2013-2014 hobbyquaker,bluefox http://homander.com");
logger.verbose("Homander  commandline "+JSON.stringify(process.argv));

// Create system variables
dataValues[c.cSystem] = [];
if (!settings.adapters) {
    settings.adapters = [];
}
settings.adapters[c.cSystem] = {name: "System", parent: c.cSystem, description: "Homander system variables"};

loadPersistentObjects();
loadDataValues();
createSystemVariables ();
initWebserver();
initAdapters();

function createSystemVariables () {
// Create language variable
    addObject (c.cSystem, c.cSystemLanguage,
        // Object description
        {   name:        "Language",
            specType:    "Variable",
            type:        c.cObjTypePoint,
            isPersistent:false,
            isLogged:    false,
            description: "System language"
        },
        // Object value
        settings.language || 'en'
    );
// Create ready variable
    addObject (c.cSystem, c.cSystemReady,
        // Object description
        {   name:        "Ready",
            specType:    "Variable",
            type:        c.cObjTypePoint,
            isPersistent:false,
            isLogged:    false,
            description: "Is all adapters and script engine started"
        },
        // Object value
        false
    );
// Create web server status variable
    addObject (c.cSystem, c.cSystemWebServerUp,
        // Object description
        {   name:        "WebServerUp",
            specType:    "Variable",
            type:        c.cObjTypePoint,
            isPersistent:false,
            isLogged:    false,
            description: "If web server started"
        },
        // Object value
        false
    );
}

function updateStatus () {
    if (io) {
        io.sockets.emit('updateStatus', statuses);
    }
    if (ioSsl) {
        ioSsl.sockets.emit('updateStatus', statuses);
    }
}

if (settings.logging.enabled) {
    setInterval(writeLog, settings.logging.writeInterval * 1000);
    if (settings.logging.move) {
        scheduler.scheduleJob('0 0 * * *', function(){
            moveLog(settings.logging.file);
        });
    }
}

var stats = {
    clients: 0,
    counters: {}, // counters in form {rx: 5, wired: 10}
    start: ((new Date()).getTime()),
    uptime: function() {
        var mseconds = ((new Date()).getTime()) - stats.start;
        var diff = new Date(mseconds);
        var hours = diff.getHours();
        var days = Math.floor(hours/24);
        hours = hours - (24 * days);
        return days+" days, "+(hours-1)+" hours, "+ diff.getMinutes()+" minutes, "+diff.getSeconds()+" seconds";
    },
    log: function() {
        for (var cnt in stats.counters) {
            if (stats.counters[cnt].last === undefined) {
                stats.counters[cnt].last = 0;
            }
            logger.info("Homander stats  "+cnt+": "+((stats.counters[cnt].value - stats.counters[cnt].last)/settings.statsIntervalMinutes).toFixed(0)+"msg/min");
            stats.counters[cnt].last = stats.counters[cnt].value;
        }
        logger.info("Homander stats  "+socketList.length+" Socket.IO Clients connected");
        logger.verbose("Homander uptime "+stats.uptime());
    }
};

if (settings.stats) {
    setInterval(stats.log, settings.statsIntervalMinutes * 60000);
}

// Copy directory (used for the driver device images)
function copyDir (srcDir, destSrc) {
    // check if deirectory exists
    if (fs.existsSync(__dirname + srcDir)) {
        fs.copy(__dirname + srcDir, __dirname + destSrc, function (err) {
            if (err) {
                logger.error ("Error by coping directory " + srcDir + " to " + destSrc + ": " + err);
            } else {
                logger.info ("Directory " + srcDir + " copied to " + destSrc);
            }
        }); //copies directory, even if it has subdirectories or files
    }
}

// Binary search
function locationOf (element, arr, start, end) {
    start = start || 0;
    end = end || arr.length;
    var pivot = parseInt(start + (end - start) / 2, 10);
    if (arr[pivot][2] === element[2]) return pivot;
    if (end - start <= 1)
        return arr[pivot][2] > element[2] ? pivot - 1 : pivot;
    if (arr[pivot][2] < element[2]) {
        return locationOf(element, arr, pivot, end);
    } else {
        return locationOf(element, arr, start, pivot);
    }
}
// Insert indexObject sorted into array
function insertSorted (arr, element) {
    if (arr.length == 0) {
        arr.push(element);
    }
    else {
        arr.splice(locationOf(element, arr) + 1, 0, element);
    }
    return arr;
}
// Convert value to formatted object {val, ts(timestamp), ack(acknowledged), ls (last changed)}
function getObjValue (value) {
    var objVal = {val: null, ts: null, ack: true, lc: null};
    if (typeof value == "object" && value !== null) {
        if (value.val !== undefined) {
            objVal.val = value.val;
        }
        if (value.ts !== undefined && value.ts !== null) {
            objVal.ts = value.ts;
        }
        else {
            objVal.ts = formatTimestamp();
        }
        if (value.ack !== undefined) {
            objVal.ack = value.ack;
        }
        if (value.lc !== undefined) {
            objVal.lc = value.lc;
        }
    }
    else // [value, timestamp, ack, lastchange]
    if (typeof value == "array") {
        if (value.length > 0) {
            objVal.val = value[0];
            if (value.length > 1) {
                objVal.ts = value[1];
                if (value.length > 2) {
                    objVal.ack = value[2];
                    if (value.length > 3) {
                        objVal.lc = value[3];
                    }
                }
            }
        }
        if (objVal.ts == null) {
            objVal.ts = formatTimestamp ();
        }
    }
    else
    if (typeof value != "undefined") {
        // some simple type: string, int, boolean or float
        objVal.val = value;
        objVal.ts  = formatTimestamp ();
        objVal.ack = true;
        objVal.lc  = null;
    }

    return objVal;
}

// Add variable to object tree
//   adapterID        - adapter ID[2-4095] or 0 [cSystem] or 1[cScript]
//   objID            - objId in adapter from 0 to 1048575
//   obj              - {name, type} these attributes are mandatory
//   [optional] value - can be set as simple type (string, boolean, int) or as object {val, ts(timestamp), ack(acknowledged), ls (last changed)}
//                    or as array [val, ts, ack, lc]
//                    if just value is set up - timestamp and lastchanged will be current time, ack = true
//                    If "ack" (acknowledged) is false, this value was set by user from GUI or from script. If true means value came from adapter or it is variable
function addObject (adapterID, objID, obj, value) {
    if (adapterID === undefined || adapterID > c.cAdapterMask) {
        logger.error("addObject "+adapterID+ "." + objID +" " + JSON.stringify(obj) + " has invalid format: adapterID is invalid");
        return null;
    }
    if (objID === undefined || objID > c.cObjectsMask) {
        logger.error("addObject "+adapterID+ "." + objID +" " + JSON.stringify(obj) + " has invalid format: objID is invalid");
        return null;
    }
    var indexObject = [adapterID, objID, adapterID << c.cAdapterShift | objID];

    if (typeof obj != "object") {
        logger.error("addObject "+adapterID+ "." + objID +" "+ JSON.stringify(obj) + " has invalid format: not an object");
        return null;
    }
    if (obj.name === undefined) {
        logger.error("addObject "+adapterID+ "." + objID +" "+ JSON.stringify(obj) + " has invalid format: no name is set");
        return null;
    }
    if (obj.type === undefined) {
        logger.error("addObject "+adapterID+ "." + objID +" "+ JSON.stringify(obj) + " has invalid format: no type is set");
        return null;
    }
    if (typeof obj.type == "string") {
        obj.type = obj.type.toLowerCase();
        // Try to convert type
        switch (obj.type) {
            case "device":
                obj.type = c.cObjTypeDevice;
                break;
            case "point":
                obj.type = c.cObjTypePoint;
                break;
            case "channel":
                obj.type = c.cObjTypeChannel;
                break;
            default:
                logger.error("addObject "+JSON.stringify(obj)+" has invalid format: invalid type");
                return null;
        }
    }

    if (!metaObjects[adapterID]) {
        metaObjects[adapterID] = [];
        dataValues [adapterID] = [];
    }

    obj.adapterId = adapterID;
    if (obj.location && typeof obj.location == "string") {
        obj.location = [obj.location];
    }

    if (obj.favorite && typeof obj.favorite == "string") {
        obj.favorite = [obj.favorite];
    }

    if (obj.role && typeof obj.role == "string") {
        obj.role = [obj.role];
    }

    if (obj.parent === undefined || obj.parent === null) {
        obj.parent = null;
    }
    else {
        // Add object to list by parent
        if (metaObjects[adapterID][obj.parent]) {
            if (!metaObjects[adapterID][obj.parent].children) {
                metaObjects[adapterID][obj.parent].children = [];
            }
            if (metaObjects[adapterID][obj.parent].children.indexOf (objID) == -1) {
                metaObjects[adapterID][obj.parent].children.push(objID);
            }
        }
        else {
            logger.warn("addObject "+adapterID+ "." + objID +" " + JSON.stringify(obj) + " add object with non- existing parent");
        }
    }

    metaObjects[adapterID][objID] = obj;

    if (obj.type == c.cObjTypePoint) {
        if (obj.isLogged === undefined) {
            obj.isLogged = true;
        }

        // Points have value in dataValues
        if (value !== undefined) {
            setPointValue (indexObject, value);
        }
        insertSorted(metaIndex.point, indexObject);
    }
    else
    if (obj.type == c.cObjTypeDevice) {
        insertSorted(metaIndex.device, indexObject);
    }
    if (obj.type == c.cObjTypeChannel) {
        insertSorted(metaIndex.channel, indexObject);
    }
    // Arrange indexes
    // Name
    if (!metaIndex.name[adapterID]) {
        metaIndex.name[adapterID] = [];
    }

    if (metaIndex.name[adapterID][obj.name] !== undefined && metaIndex.name[adapterID][obj.name][2/*cCombyId*/] != indexObject[2/*cCombyId*/]) {
        logger.warn("addObject "+adapterID+ "." + objID +" "+ JSON.stringify(obj) + " has not an unique name");
    }
    else {
        metaIndex.name[adapterID][obj.name] = indexObject;
    }
    // Location
    if (obj.location) {
        if (metaIndex.location[obj.location] === undefined) {
            metaIndex.location[obj.location] = [];
        }
        for (var i = 0, len = obj.location; i < len; i++) {
            if (obj.location[i]) {
                insertSorted (metaIndex.location[obj.location[i]], indexObject);

            }
        }
    }
    // favorite
    if (obj.favorite) {
        if (metaIndex.favorite[obj.favorite] === undefined) {
            metaIndex.favorite[obj.favorite] = [];
        }
        for (var i = 0, len = obj.favorite; i < len; i++) {
            if (obj.favorite[i]) {
                insertSorted (metaIndex.favorite[obj.favorite[i]], indexObject);

            }
        }
    }
    // role
    if (obj.role) {
        if (metaIndex.role[obj.role] === undefined) {
            metaIndex.role[obj.role] = [];
        }
        for (var i = 0, len = obj.role; i < len; i++) {
            if (obj.role[i]) {
                insertSorted (metaIndex.role[obj.role[i]], indexObject);
            }
        }
    }
    // specType
    if (obj.specType) {
        if (metaIndex.specType[obj.specType] === undefined) {
            metaIndex.specType[obj.specType] = [];
        }
        insertSorted (metaIndex.specType[obj.specType], indexObject);
    }
    // address
    if (obj.address) {
        if (!metaIndex.address[adapterID]) {
            metaIndex.address[adapterID] = [];
        }
        if (metaIndex.address[adapterID][obj.name] !== undefined && metaIndex.address[adapterID][obj.name][2/*cCombyId*/] != indexObject[2/*cCombyId*/]) {
            logger.warn("addObject "+adapterID+ "." + objID +" "+ JSON.stringify(obj) + " has not an unique address");
        }
        else {
            metaIndex.address[adapterID][obj.name] = indexObject;
        }
    }
    logger.verbose("addObject "+adapterID+ "." + objID +" "+ JSON.stringify(obj) + " inserted succsessfully");

    return obj;
}

// Send new value to all adapters and GUIs. If value.ack == false, it is control direction. If value.ack == true, it is state update.
// value.ack == true can come only from adapter, so do not send this value there, adapter knows anyway.
// value.ack == false can come only from GUI or from script engine, so send this only to this adapter
function sendEvent (id, value) {
    logger.verbose("socket.io --> broadcast event " + id[0/*cAdapterId*/] + "." + id[1/*cObjectId*/] + " " + JSON.stringify(value));
    // go through all sockets
    for (var i = 0, len = socketList.length; i < len; i++)  {
        if (socketList[i]) {
            var adapterId = socketList[i].adapterId;
            // Adapters => GUI
            if (value.ack) {
                if (!adapterId || metaIndex.adapterInfo[adapterId].multiData) {
                    socketList[i].emit('event', id[2/*cCombyId*/], value);
                }
            }
            // GUI => Adapters
            else {
                if (id[0/*cAdapterId*/] == adapterId || metaIndex.adapterInfo[adapterId].multiData) {
                    socketList[i].emit('event', (!adapterId || !metaIndex.adapterInfo[adapterId] || metaIndex.adapterInfo[adapterId].multiData) ? id[2/*cCombyId*/] : id[1/*cObjectId*/], value);
                }
            }
        }
    }
}

// following forms are supported:
// integer, like 1048577 ( 0x100001 => [1, 1, 1048577])
// array  [adapterid, objid] => [adapterid, objid, comby]
// string "1048577"          => ( 0x100001 => [1, 1, 1048577])
// string "sonos.pointname"  => [1, 1, 1048577]
// string "1.pointname"      => [1, 1, 1048577]
// string "sonos.address"    => [1, 1, 1048577]
function getId (id) {
    // Convert id if not array
    var typeId = typeof id;
    if (typeId != "array") {
        if (typeId == "string") {
            var p = id.indexOf(".");
            if (p == -1) {
                id = parseInt (id);
                id = [id >> c.cAdapterShift, id & c.cObjectsMask, id];
            }
            else { // this is name or address
                // extract adapter ID
                var adapterId = id.substring (0, p);
                id = id.substring(p + 1);
                if (adapterId.length > 0 && adapterId[0] >= '0' && adapterId[0] <= '9') {
                    adapterId = parseInt (adapterId);
                    if (!settings.adapters[adapterId]){
                        // invalid adapter
                        log.warn ("getId requested invalid adapter " + JSON.stringify (id));
                        return null;
                    }
                } else {
                    if (metaIndex.adapter[adapterId]) {
                        adapterId = metaIndex.adapter[adapterId];
                    }
                    else {
                        // invalid adapter
                        log.warn ("getId requested invalid adapter " + JSON.stringify (id));
                        return null;
                    }
                }
                // Try to find name
                var _id = metaIndex.name[adapterId][id];
                if (_id === undefined) {
                    _id = metaIndex.address[adapterId][id];
                    if (_id === undefined) {
                        if (id.length > 0 && id[0] >= '0' && id[0] <= '9') {
                            id = parseInt (id);
                        }
                        else {
                            // invalid object id
                            log.warn ("getId requested invalid object name " + JSON.stringify (id));
                            return null;
                        }
                    }
                }
                id = [adapterId, id];
            }
        }
    }

    if (!id[2]) id[2] = id[0] << c.cAdapterShift | id[1];
    return id;
}

// Set new value of point. If ack == true, this is just an update, if false - this is control direction
function setPointValue(id, value) {
    // Convert id if not array
    id = getId(id);

    // Convert value to formatted object
    value = getObjValue (value);

    // unescape Script WriteURL()
    if (typeof value.val == "string") {
        value.val = unescape( value.val);
    }
    if (dataValues[id[0]] === undefined) {
        logger.warn("setPointValue "+id[0]+ "."+id[1] + ": adapter not exists");
        return null;
    }

    // Get old value to compare
    var oldval = dataValues[id[0]][id[1]];

    logger.verbose("setPointValue "+ settings.adapters[id[0]].name + "." +metaObjects[id[0]][id[1]].name + " " + JSON.stringify(oldval)+" -> "+JSON.stringify(value));

    if (!oldval) {
        // First value
        dataValues[id[0]][id[1]] = value;

        sendEvent (id, value);
        devLog    (id, value);
    }
    else {
        // Value changed
        if (value.val != oldval.val) {
            value.lc = formatTimestamp();
        } else {
            value.lc = oldval.lc;
        }

        dataValues[id[0]][id[1]] = value;

        if (value.val == oldval.val && value.ack == oldval.ack && value.ts == oldval.ts && value.lc == oldval.lc) {
            // No change
        } else {
            sendEvent (id, value);
            // If log updates and changes or value really changed
            if (!settings.logging.varChangeOnly || value.val != oldval.val) {
                devLog (id, value);
            }
        }
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

// Create metaIndex.adapter - address adapter by name
function initAdapters() {
    if (!extDone) {
        // extend index information for adapters
        for (var i = 0, len = settings.adapters.length; i < len; i++) {
            if (settings.adapters[i]) {
                metaIndex.adapterInfo[i] = settings.adapters[i];
                if (metaIndex.adapter[settings.adapters[i].name]) {
                    logger.error("initAdapters: Duplicate adapter name " + settings.adapters[i].name);
                } else {
                    metaIndex.adapter[settings.adapters[i].name] = i;

                    if (settings.adapters[i].name != settings.adapters[i].type) {
                        if (!metaIndex.adapter[settings.adapters[i].type]) {
                            metaIndex.adapter[settings.adapters[i].type] = i;
                        }
                    }
                }
            }
        }

        extDone = true;
        setTimeout(startAdapters, 45000);
    }
}

function initWebserver() {
    if (app) {
        if (settings.useCache) {
            var oneYear = 30758400000;
            app.use('/', express.static(__dirname + '/www', { maxAge: oneYear }));
            app.use('/log', express.static(__dirname + '/log', { maxAge: oneYear }));
        }
        else {
            app.use('/', express.static(__dirname + '/www'));
            app.use('/log', express.static(__dirname + '/log'));
        }

        // File Uploads
        app.use(express.bodyParser({uploadDir:__dirname+'/tmp'}));
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
            appSsl.use('/', express.static(__dirname + '/www', { maxAge: oneYear_ }));
            appSsl.use('/log', express.static(__dirname + '/log', { maxAge: oneYear_ }));
        }
        else {
            appSsl.use('/', express.static(__dirname + '/www'));
            appSsl.use('/log', express.static(__dirname + '/log'));
        }

        // File Uploads
        appSsl.use(express.bodyParser({uploadDir:__dirname+'/tmp'}));
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
        io = socketio.listen(server);
        io.set('logger', { debug: function(obj) {logger.debug("socket.io: "+obj)}, info: function(obj) {logger.debug("socket.io: "+obj)} , error: function(obj) {logger.error("socket.io: "+obj)}, warn: function(obj) {logger.warn("socket.io: "+obj)} });
        initSocketIO(io);
    }

    if (serverSsl){
        serverSsl.listen(settings.ioListenPortSsl);
        logger.info("webserver ssl listening on port "+settings.ioListenPortSsl);
        ioSsl = socketio.listen(serverSsl);
        ioSsl.set('logger', { debug: function(obj) {logger.debug("socket.io: "+obj)}, info: function(obj) {logger.debug("socket.io: "+obj)} , error: function(obj) {logger.error("socket.io: "+obj)}, warn: function(obj) {logger.warn("socket.io: "+obj)} });
        initSocketIO(ioSsl);
    }
    setPointValue ([c.cSystem, c.cSystemWebServerUp], true);
}

function formatTimestamp() {
    var timestamp = new Date();
    return timestamp.getFullYear()                                + '-' +
        ("0" + (timestamp.getMonth() + 1).toString(10)).slice(-2) + '-' +
        ("0" + (timestamp.getDate()     ).toString(10)).slice(-2) + ' ' +
        ("0" + (timestamp.getHours()    ).toString(10)).slice(-2) + ':' +
        ("0" + (timestamp.getMinutes()  ).toString(10)).slice(-2) + ':' +
        ("0" + (timestamp.getSeconds()  ).toString(10)).slice(-2);
}

function delObject (id) {
    // Convert id if not array
    id = getId(id);

    var obj = metaObjects[id[0]][id[1]];
    if (obj.address) {
        delete metaIndex.address[id[0]][obj.address];
    }
    if (dataValues[id[0]][id[1]]) {
        dataValues[id[0]][id[1]] = null;
    }

    delete metaIndex.name[adapterId][obj.name];

    // Clear location
    if (obj.location) {
        for (var i = 0, len = metaIndex.location[obj.location].length; i < len; i++) {
            for (var j = 0, jlen = obj.location.length; j < jlen; j++) {
                if (metaIndex.location[obj.location[j]][i][2/*iCombyId*/] == id[2/*iCombyId*/]) {
                    metaIndex.location[obj.location[j]].splice (i, 1);
                    if (!metaIndex.location[obj.location[j]].length) {
                        delete metaIndex.location[obj.location[j]];
                    }
                }
            }
        }
    }

    // Clear favorite
    if (obj.favorite) {
        for (var i = 0, len = metaIndex.favorite[obj.favorite].length; i < len; i++) {
            for (var j = 0, jlen = obj.favorite.length; j < jlen; j++) {
                if (metaIndex.favorite[obj.favorite[j]][i][2/*iCombyId*/] == id[2/*iCombyId*/]) {
                    metaIndex.favorite[obj.favorite[j]].splice (i, 1);
                    if (!metaIndex.favorite[obj.favorite[j]].length) {
                        delete metaIndex.favorite[obj.favorite[j]];
                    }
                }
            }
        }
    }

    // Clear role
    if (obj.role) {
        for (var i = 0, len = metaIndex.role[obj.role].length; i < len; i++) {
            for (var j = 0, jlen = obj.role.length; j < jlen; j++) {
                if (metaIndex.role[obj.role[j]][i][2/*iCombyId*/] == id[2/*iCombyId*/]) {
                    metaIndex.role[obj.role[j]].splice (i, 1);
                    if (!metaIndex.role[obj.role[j]].length) {
                        delete metaIndex.role[obj.role[j]];
                    }
                }
            }
        }
    }

    // Clear specType
    if (obj.specType) {
        for (var i = 0, len = metaIndex.specType[obj.specType].length; i < len; i++) {
            if (metaIndex.specType[obj.specType][i][2/*iCombyId*/] == id[2/*iCombyId*/]) {
                metaIndex.specType[obj.specType].splice (i, 1);
                break;
            }
        }
        if (!metaIndex.role[obj.specType].length) {
            delete metaIndex.specType[obj.specType];
        }
    }

    // Clear devices
    if (obj.type == c.cObjTypeDevice) {
        for (var i = 0, len = metaIndex.device.length; i < len; i++) {
            if (metaIndex.device[i][2/*iCombyId*/] == id[2/*iCombyId*/]) {
                metaIndex.device.splice (i, 1);
                break;
            }
        }
    }
    else// Clear channels
    if (obj.type == c.cObjTypeChannel) {
        for (var i = 0, len = metaIndex.channel.length; i < len; i++) {
            if (metaIndex.channel[i][2/*iCombyId*/] == id[2/*iCombyId*/]) {
                metaIndex.channel.splice (i, 1);
                break;
            }
        }
    }
    else// Clear point
    if (obj.type == c.cObjTypePoint) {
        for (var i = 0, len = metaIndex.point.length; i < len; i++) {
            if (metaIndex.point[i][2/*iCombyId*/] == id[2/*iCombyId*/]) {
                metaIndex.point.splice (i, 1);
                break;
            }
        }
    }
}

// remove from trees all objects of this adapter
function delAdapterObjects (adapterId) {
    metaObjects[adapterId] = null;
    dataValues[adapterId]  = null;
    metaIndex.address[adapterId] = null;
    metaIndex.name[adapterId] = null;
    // Clear location
    for (var obj in metaIndex.location) {
        for (var len = metaIndex.location[obj].length, i = len -1; i >= 0; i--) {
            if (metaIndex.location[obj][i][0] == adapterId){
                metaIndex.location[obj].splice(i, 1);
            }
        }
    }
    for (var obj in metaIndex.location) {
        if (!metaIndex.location[obj].length) {
            delete metaIndex.location[obj];
        }
    }

    // Clear favorite
    for (var obj in metaIndex.favorite) {
        for (var len = metaIndex.favorite[obj].length, i = len -1; i >= 0; i--) {
            if (metaIndex.favorite[obj][i][0] == adapterId){
                metaIndex.favorite[obj].splice(i, 1);
            }
        }
    }
    for (var obj in metaIndex.favorite) {
        if (!metaIndex.favorite[obj].length) {
            delete metaIndex.favorite[obj];
        }
    }

    // Clear role
    for (var obj in metaIndex.role) {
        for (var len = metaIndex.role[obj].length, i = len -1; i >= 0; i--) {
            if (metaIndex.role[obj][i][0] == adapterId){
                metaIndex.role[obj].splice(i, 1);
            }
        }
    }
    for (var obj in metaIndex.role) {
        if (!metaIndex.role[obj].length) {
            delete metaIndex.role[obj];
        }
    }

    // Clear specType
    for (var obj in metaIndex.specType) {
        for (var len = metaIndex.specType[obj].length, i = len -1; i >= 0; i--) {
            if (metaIndex.specType[obj][i][0] == adapterId){
                metaIndex.specType[obj].splice(i, 1);
            }
        }
    }
    for (var obj in metaIndex.specType) {
        if (!metaIndex.specType[obj].length) {
            delete  metaIndex.specType[obj];
        }
    }

    // Clear devices
    for (var obj in metaIndex.device) {
        for (var len = metaIndex.device[obj].length, i = len -1; i >= 0; i--) {
            if (metaIndex.device[obj][i][0] == adapterId){
                metaIndex.device[obj].splice(i, 1);
            }
        }
    }
    for (var obj in metaIndex.device) {
        if (!metaIndex.device[obj].length) {
            delete  metaIndex.device[obj];
        }
    }

    // Clear channels
    for (var obj in metaIndex.channel) {
        for (var len = metaIndex.channel[obj].length, i = len -1; i >= 0; i--) {
            if (metaIndex.channel[obj][i][0] == adapterId){
                metaIndex.channel[obj].splice(i, 1);
            }
        }
    }
    for (var obj in metaIndex.channel) {
        if (!metaIndex.channel[obj].length) {
            delete  metaIndex.channel[obj];
        }
    }

    // Clear point
    for (var obj in metaIndex.point) {
        for (var len = metaIndex.point[obj].length, i = len -1; i >= 0; i--) {
            if (metaIndex.point[obj][i][0] == adapterId){
                metaIndex.point[obj].splice(i, 1);
            }
        }
    }
    for (var obj in metaIndex.point) {
        if (!metaIndex.point[obj].length) {
            delete  metaIndex.point[obj];
        }
    }
}



function addObjects (adapterId, isMerge, newObjects, newValues) {
    if (!isMerge && metaObjects[adapterId]) {
        metaObjects[adapterId] = null;
    }
    if (newObjects) {
        for (var id in newObjects) {
            if (newObjects[id]) {
                addObject (adapterId, id, newObjects[id]);
            }
        }
    }

    if (newValues) {
        for (var id in newValues) {
            if (newValues[dp]) {
                setPointValue([adapterId, id], newValues[dp]);
            }
        }
    }
}

function initSocketIO(_io) {
	_io.configure(function (){
	  this.set('authorization', function (handshakeData, callback) {
        var isHttps = (serverSsl !== undefined && this.server == serverSsl);
        if ((!isHttps && settings.authentication.enabled) || (isHttps && settings.authentication.enabledSsl)) {
            // do not check if localhost
            if(handshakeData.address.address.toString() == "127.0.0.1") {
                logger.verbose("Homander  local authetication " + handshakeData.address.address);
                callback(null, true);
            } else
            if (handshakeData.query["key"] === undefined || handshakeData.query["key"] != authHash) {
                logger.warn("Homander  authetication error on "+(isHttps ? "https from " : "http from ") + handshakeData.address.address);
                callback ("Invalid session key", false);
            } else{
                logger.verbose("Homander  authetication successful on "+(isHttps ? "https from " : "http from ") + handshakeData.address.address);
                callback(null, true);
            }
        }
        else {
           callback(null, true);
        }
	  });
	});

    _io.sockets.on('connection', function (socket) {
        socketList.push(socket);
        var address = socket.handshake.address;
        logger.verbose("socket.io <-- " + address.address + ":" + address.port + " " + socket.transport + " connected");

        // By default receive all updates of all variables
        socket.adapterId  = 0;
        socket.subsscribe = null;

        // Request adapter id, if no id or 0 (cSystem), send all messages
        socket.emit ("getAdapterId", function (adapterId) {
            this.adapterId = parseInt (adapterId);
            logger.info ("Connected adapter " + adapterId + " on " + this.id);
        });

        socket.on ("subscribe", function (id) {
            if (this.adapterId && settingd.adapters[this.adapterId].mut)
            id = getId (id);
            if (!socket.subsscribe) {
                socket.subsscribe = [];
            }
            insertSorted(socket.subsscribe, id);
        });

        socket.on('log', function (sev, msg) {
           switch (sev) {
               case "info":
                   logger.info(msg);
                   break;
               case "warn":
                   logger.warn(msg);
                   break;
               case "error":
                   logger.error(msg);
           }
        });

        socket.on('execCmd', function (cmd, callback) {
            logger.info("Homander  exec "+cmd);
            cp.exec(cmd, callback);
        });

        socket.on('execScript', function (script, arg, callback) {
            logger.info("Homander  script "+script + "["+arg+"]");
            var scr_prc = cp.fork (__dirname + script, arg);
            var result = null;
            scr_prc.on('message', function(obj) {
                // Receive results from child process
                console.log ("Message: " + obj);
				logger.debug("Homander  script result: " + obj);
                result = obj;
            });
            scr_prc.on ("exit", function (code, signal) {
                if (callback) {
					logger.debug("Homander  script end result: " + result);
                    callback (script, arg, result);
                }
            });
        });

        socket.on('restartAdapter', function (adapter) {
           return startAdapter(adapter)
        });

        socket.on('updateAddon', function (url, name) {
            var path = __dirname + "/update-addon.js";
            logger.info("Homander  starting "+path+" "+url+" "+name);
            var updateProcess = cp.fork(path, [url, name]);
            updateProcess.on("close", function (code) {
                var msg;
                if (code == 0) {
                    msg = " done.";
                } else {
                    msg = " failed.";
                }
                if (io) {
                    io.sockets.emit('ioMessage', 'Update '+name+msg);
                }
                if (ioSsl) {
                    ioSsl.sockets.emit('ioMessage', 'Update '+name+msg);
                }
            });
        });

        socket.on('updateSelf', function () {
            var path = __dirname + "/update-self.js";
            settings.updateSelfRunning = true;
            logger.info("Homander  starting "+path);
            var updateProcess = cp.fork(path);
            if (io) {
                io.sockets.emit('ioMessage', 'Update started. Please be patient...');
            }
            if (ioSsl) {
                ioSsl.sockets.emit('ioMessage', 'Update started. Please be patient...');
            }
            updateProcess.on("close", function (code) {
                settings.updateSelfRunning = false;
                if (code == 0) {
                    if (io) {
                        io.sockets.emit('ioMessage', 'Update done. Restarting...');
                    }
                    if (ioSsl) {
                        ioSsl.sockets.emit('ioMessage', 'Update done. Restarting...');
                    }
                    logger.info('Homander  update done. restarting...');
                    cp.fork(__dirname+'/Homander-server.js', ['restart']);
                } else {
                    logger.error("Homander  update failed.");
                    if (io) {
                        io.sockets.emit("ioMessage", "Error: update failed.");
                    }
                    if (ioSsl) {
                        ioSsl.sockets.emit("ioMessage", "Error: update failed.");
                    }
                }

            });
        });

        socket.on('createBackup', function (isWithLog) {
            var path = __dirname + "/backup.js";
            logger.info("Homander  starting "+path);
            var backupProcess = cp.fork(path, [isWithLog ? "createWithLog": "create"]);
            var fileName = "";
            backupProcess.on("message", function (msg) {
                fileName = msg;
            });
            if (io) {
                io.sockets.emit("ioMessage", "Backup started. Please be patient...");
            }
            if (ioSsl) {
                ioSsl.sockets.emit("ioMessage", "Backup started. Please be patient...");
            }
            backupProcess.on("close", function (code) {
                if (code == 0) {
                    if (io) {
                        io.sockets.emit("readyBackup", fileName);
                    }
                    if (ioSsl) {
                        ioSsl.sockets.emit("readyBackup", fileName);
                    }
                } else {
                    logger.error("Homander  Backup failed.");
                    if (io) {
                        io.sockets.emit("ioMessage", "Error: Backup failed.");
                    }
                    if (ioSsl) {
                        ioSsl.sockets.emit("ioMessage", "Error: Backup failed.");
                    }
                }
            });
        });

        socket.on('applyBackup', function (fileName) {
            var path = __dirname + "/backup.js";
            logger.info("Homander  starting "+path);
            var backupProcess = cp.fork(path, [fileName]);

            if (io) {
                io.sockets.emit("ioMessage", "Apply backup started. Please be patient...");
            }
            if (ioSsl) {
                ioSsl.sockets.emit("ioMessage", "Apply backup started. Please be patient...");
            }
            backupProcess.on("close", function (code) {
                if (code == 0) {
                    if (io) {
                        io.sockets.emit("applyReady", "Apply backup done. Restart Homander");
                    }
                    if (ioSsl) {
                        ioSsl.sockets.emit("applyReady", "Apply backup done. Restart Homander");
                    }
                } else {
                    logger.error("Homander  Apply backup failed.");
                    if (io) {
                        io.sockets.emit("applyError", "Error: Backup failed.");
                    }
                    if (ioSsl) {
                        ioSsl.sockets.emit("applyError", "Error: Backup failed.");
                    }
                }
            });
        });

        socket.on('refreshAddons', function () {
            if (io) {
                io.sockets.emit("refreshAddons");
            }
            if (ioSsl) {
                ioSsl.sockets.emit("refreshAddons");
            }
        });

        socket.on('reloadData', function () {
            logger.info("socket.io --> broadcast reload")
            if (io) {
                io.sockets.emit("reloadData");
            }
            if (ioSsl) {
                ioSsl.sockets.emit("reloadData");
            }
        });

        socket.on('reloadDataReady', function () {
            if (io) {
                io.sockets.emit('reloadDataReady');
            }
            if (ioSsl) {
                ioSsl.sockets.emit('reloadDataReady');
            }
        });

        socket.on('setStates', function (newdataValues){
            mergeTrees (null, false, null, null, newdataValues);
        });

        socket.on('devLog', function (timeStamp, id, val){
            devLog (timeStamp, id, val);
        });

        socket.on('restart', function () {
            logger.info("Homander  received restart command");
            cp.fork(__dirname+"/homander-server.js", ["restart"]);
        });

        socket.on('readdir', function (path, callback) {
            path = __dirname+"/"+path;
            logger.verbose("socket.io <-- readdir "+path);
            fs.readdir(path, function (err, data) {
                if (err) {
                    callback(undefined);
                } else {
                    callback(data);
                }
            });
        });

        socket.on('readdirStat', function(path, callback) {
            path = __dirname + "/" + path;
            logger.verbose("socket.io <-- readdirStat " + path);

            fs.readdir(path, function(err, files) {
                var data = [];
                if (err) {
                    callback(undefined);
                }
                if (files.length == 0) {
                    callback(undefined);
                } else {
                    files.forEach(function(file) {
                        fs.stat(path + file, function(err, stats) {
                            data.push({
                                "file": file,
                                "stats": stats
                            });
                            if (data.length == files.length) {
                                callback(data);
                                logger.info(data);
                            }
                        });
                    });
                }
            });
        });

        socket.on('writeFile', function (name, obj, callback) {
            var content = JSON.stringify(obj);
            logger.verbose("socket.io <-- writeFile "+name+" "+content);
            fs.writeFile(settings.datastorePath+name, content);
            // Todo Fehler abfangen
            if (callback) { callback(); }
        });

        socket.on('writeRawFile', function (path, content, callback) {
            logger.verbose("socket.io <-- writeRawFile "+path);
            fs.writeFile(__dirname+"/"+path, content);
            // Todo Fehler abfangen
            if (callback) { callback(); }
        });

        socket.on('readFile', function (name, callback) {
            logger.verbose("socket.io <-- readFile "+name);

            fs.readFile(settings.datastorePath+name, function (err, data) {
                if (err) {
                    logger.error("Homander  failed loading file "+settings.datastorePath+name);
                    callback(undefined);
                } else {
                    try {
                        var obj = JSON.parse(data);
                        callback(obj);
                    } catch (e) {
                        callback(null, e);
                    }
                }
            });
        });

        socket.on('readRawFile', function (name, callback) {
            logger.verbose("socket.io <-- readFile "+name);

            fs.readFile(__dirname+"/"+name, function (err, data) {
                if (err) {
                    logger.error("Homander  failed loading file "+__dirname+"/"+name);
                    callback(undefined);
                } else {
                    callback(data.toString());
                }
            });
        });

        socket.on('touchFile', function (name, callback) {
            logger.verbose("socket.io <-- touchFile "+name);
            if (!fs.existsSync(__dirname+"/"+name)) {
                logger.info("Homander  creating empty file "+name);
                var stream = fs.createWriteStream(__dirname+"/"+name);
                stream.end();
            }
        });

        socket.on('delRawFile', function (name, callback) {
            logger.info("socket.io <-- delRawFile "+name);

            fs.unlink(__dirname+"/"+name, function (err, data) {
                if (err) {
                    logger.error("Homander  failed deleting file "+__dirname+"/"+name);
                    callback(false);
                } else {
                    callback(true);
                }
            });
        });

        socket.on('readJsonFile', function (name, callback) {
            logger.verbose("socket.io <-- readFile "+name);

            fs.readFile(__dirname+"/"+name, function (err, data) {
                if (err) {
                    logger.error("Homander  failed loading file "+__dirname+"/"+name);
                    callback(undefined);
                } else {
                    try {
                        callback(JSON.parse(data));
                    }
                    catch (e) {
                        logger.error("Invalid json file " + data);
                    }
                }
            });
        });

        socket.on('getUrl', function (url, callback) {
            logger.info("Homander  GET "+url);
            if (url.match(/^https/)) {
                https.get(url, function(res) {
                    var body = "";
                    res.on("data", function (data) {
                        body += data;
                    });
                    res.on("end", function () {
                        callback(body);
                    });

                }).on('error', function(e) {
                        logger.error("Homander  GET "+url+" "+ e.message);
                    });
            } else {
                http.get(url, function(res) {
                    var body = "";
                    res.on("data", function (data) {
                        body += data;
                    });
                    res.on("end", function () {
                        callback(body);
                    });
                }).on('error', function(e) {
                    logger.error("Homander  GET "+url+" "+ e.message);
                });
            }
        });

        socket.on('getStatus', function (callback) {
            callback(statuses);
        });

        socket.on('setStatus', function (obj, value) {
            if (typeof obj == "object") {
                for (var n in obj) {
                    statuses[n] = obj[n];
                }
            }
            else {
                statuses[obj] = value;
            }
            updateStatus ();
        });

        socket.on('setStats', function(name, value) {
            if (!stats.counters[name]) {
                stats.counters[name] = {value: 0};
            }

            stats.counters[name].value = value;
        });

        socket.on('getNextId', function (start, callback) {
            callback(nextId(start));
        });

        socket.on('getSettings', function (callback) {
            callback(settings);
        });

        socket.on('getAdapterSettings', function (adapterId, callback) {
            callback(settings.adapters[adapterId].settings);
        });

        socket.on('setSettings', function (_settings, callback) {
            settings = _settings;
            // Copy devices directory of all adapters to www/img/adapters
            for (var i = c.cUserAdapter, len = settings.adapters.length; i < len; i++) {
                if (settings.adapters[i]) {
                    copyDir ("/" + settings.adapters[i].type, "/www/img/devices/" + settings.adapters[i].type);
                }
            }

            logger.verbose("socket.io <-- writeFile settings.json");
            fs.writeFile(settings.datastorePath+"settings.json", JSON.stringify(settings));
            // Todo Fehler abfangen
            if (callback) { callback(true); }
        });

        socket.on('getVersion', function(callback) {
            callback(settings.version);
        });

        socket.on('getPointValues', function(callback) {
            logger.verbose("socket.io <-- getData");

            callback(dataValues);
        });

        socket.on('getPointValue', function(objId, callback) {
            logger.verbose("socket.io <-- getDatapoint " + id);
            var adapterId = this.adapterId;
            // If adapter id there
            if (objId && (objId & (~c.cObjectsMask))) {
                adapterId = objId >> c.cAdapterShift;
                objId     = objId & c.cObjectsMask;
            }

            if (!adapterId || !dataValues[adapterId]) {
                logger.warn ("getPointValue: invalid adapter id " + adapterId + " for object " + objId);
            }
            else {
                callback(id, dataValues[adapterId][objId]);
            }
        });
		
        socket.on('getObjects', function(callback) {
            logger.verbose("socket.io <-- getObjects");
            callback(metaObjects);
        });

        socket.on('getIndex', function(callback) {
            logger.verbose("socket.io <-- getIndex");
            callback(metaIndex);
        });

        socket.on('addObject', function (objId, obj, value, callback) {
            if (this.adapterId) {
                if (addObject (this.adapterId, objId, obj, value) != null) {
                    if (callback) callback (true);
                }
                else
                if (callback) callback (false);
            }
            else {
                if (typeof objId != "array") {
                    log.warn("addObject : objId must be defined as array");
                    if (callback) {
                        callback (false);
                    }
                }
                else if (objId.length > 1) {
                    if (addObject (objId[0], objId[1], obj, value)) {
                        if (callback) callback(true);
                    }
                    else
                    if (callback) callback (false);
                }
                else {
                    log.warn("addObject : objId must be defined as array with [adapter, obj]");
                    if (callback) {
                        callback (false);
                    }
                }
            }
        });

        socket.on('addObjects', function (newObjects, callback) {
            if (this.adapterId) {
                addObjects (this.adapterId, false, newObjects);
                if (callback) {
                    callback();
                }
             }
        });

        socket.on('toAdapter', function (adapter, cmd, arg, callback) {
            var adapterId;
            if (typeof adapter == 'string') {
                if (adapter.length > 1 && adapter[0] >= '0' && adapter[0] <= '9') {
                    adapterId = parseInt(adapter)                    
                }
                else {
                    adapterId = metaIndex.adapters[adapter];
                    // Find adapter with this name
                    if (!adapterId) {
                        for (var i = 0, len = settings.adapters.length; i < len; i++) {
                            if (settings.adapters[i] && settings.adapters[i].type && settings.adapters[i].type == adapter) {
                                adapterId = i;
                                break;
                            }
                        }
                    }
                }
            }

            if (adapterId) {
                for (var i = 0, len = socketList.length; i < len; i++) {
                    if (!socketList[i].adapterId || socketList[i].adapterId == adapterId) {
                        socketList[i].emit(cmd, arg, function (result){
                            if (callback) {
                                callback(result);
                            }
                        });
                    }
                }
            } else {
                logger.error ("toAdapter: Unknown adapter id - " + adapter);
            }
        });

        socket.on('setPointValue', function (objId, val, ts, ack, callback) {
            var adapterId = this.adapterId;
            // If adapter id there
            if (objId && (objId & (~c.cObjectsMask))) {
                adapterId = objId >> c.cAdapterShift;
                objId     = objId & c.cObjectsMask;
            }
            // Todo Delay??
            if (!adapterId || !settings.adapters[adapterId] || !metaObjects[adapterId]) {
                logger.warn("setPointValue adapter " + adapterId + " does not exist");
                if (callback)  {
                    callback (null);
                }
                return;
            }
            if (!metaObjects[adapterId][objId]) {
                logger.warn("setPointValue object " + objId + " of " + settings.adapters[adapterId].name + " does not exist");
                if (callback)  {
                    callback (null);
                }
                return;
            }
            logger.info("setPointValue " + settings.adapters[adapterId].name + "." + metaObjects[adapterId][objId].name + " " +JSON.stringify(val));

            var obj = setPointValue([adapterId, objId], {val:val, ts:ts, ack: ack});
            if (callback)  {
                callback (obj);
            }
        });

        socket.on('setPointValues', function (values, callback) {
            var adapterId = this.adapterId;

            if (!adapterId) {
                // Bulk set does not support by multi adapters
                logger.warn ('setPointValues: Bulk set does not support by multi adapters (' + this.id + ')');
                if (callback)  {
                    callback (null);
                }
                return;
            }

            if (!settings.adapters[adapterId] || !metaObjects[adapterId]) {
                logger.warn("setPointValues adapter " + adapterId + " does not exist");
                if (callback)  {
                    callback (null);
                }
                return;
            }

            for (var objId = 0, len = values.length; objId < len; objId++) {
                if (values[objId]) {
                    setPointValue ([adapterId, objId], {val: values[objId].val, ts:values[objId].ts, ack: true, lc: values[objId].lc});
                }
            }
        });

        // Get list of all IP address on device
        socket.on('getIpAddresses', function (callback) {
            var ifaces=os.networkInterfaces();
            var ipArr = [];
            for (var dev in ifaces) {
                var alias=0;
                ifaces[dev].forEach(function(details){
                    if (details.family=='IPv4') {
                        ipArr.push ({name: dev+(alias?':'+alias:''), address: details.address});
                        ++alias;
                    }
                });
            }
            if (callback) {
                callback (ipArr);
            }
        })

        socket.on('disconnect', function () {
            var address = socket.handshake.address;
            logger.verbose("socket.io <-- " + address.address + ":" + address.port + " " + socket.transport + " disconnected");
            socketList.splice(socketList.indexOf(socket), 1);
            this.subscribe = null;
        });

        socket.on('close', function () {
            var address = socket.handshake.address;
            logger.verbose("socket.io <-- " + address.address + ":" + address.port + " " + socket.transport + " closed");
            socketList.splice(socketList.indexOf(socket), 1);
            this.subscribe = null;
        });
    });
}

function _startAdapterHelper (adapterId) {
    var isRestarting = false;
    // Kill adapter before start
    if (childrenAdapter[_adapter].process && !childrenAdapter[adapterId].period) {
        try{
            isRestarting = true;
            logger.info("Homander  killing adapter " + settings.adapters[adapterId].name);
            childrenAdapter[_adapter].process.kill ();
            childrenAdapter[_adapter].process = null;
        }
        catch (e)
        {

        }
    }

    logger.info("Homander  starting adapter "+settings.adapters[adapterId].name+(childrenAdapter[adapterId].period ? ' (interval='+period+'ms)': ''));
    var path = __dirname + '/adapter/'+settings.adapters[adapterId].name+"/"+settings.adapters[adapterId].name+'.js';
    var env = _.clone (process.env);

    env.adapterId   = adapterId;
    env.serverIp    = '127.0.0.1';
    env.serverPort  = settings.ioListenPort || settings.ioListenPortSsl;
    env.serverIsSec = settings.ioListenPort ? false: (settings.ioListenPortSsl ? true: false);

    childrenAdapter[_adapter].process = cp.fork (path, env);

    return isRestarting ? "Adapter started" : "Adapter restarted";
}
// start one adapter
function startAdapter (adapterId) {
    if (!settings.adapters[adapterId]) {
        return;
    }

    var mode = settings.adapters[adapterId].mode;

    if (!childrenAdapter[adapterId]) {
        childrenAdapter[adapterId] = {};
    }

    switch (mode) {
        case "periodical":
            // Stop old timer
            if (childrenAdapter[adapterId].timerAdapter) {
                clearInterval (childrenAdapter[adapterId].timerAdapter);
                childrenAdapter[adapterId].timerAdapter = null;
            }

            // Get period and convert it
            childrenAdapter[adapterId].period = (parseInt (settings.adapters[adapterId].period) * 60000) || 3600000; // default - one hour

            // Start interval
            childrenAdapter[adapterId].timerAdapter = setInterval(_startAdapterHelper, childrenAdapter[adapterId].period, adapterId);
            break;

        default:
            break;
    }

    // Start adapter immediately
    _startAdapterHelper (adapterId);
}
// start all adapters and scrit engine
function startAdapters () {
    if (!settings.adapters) {
        return false;
    }
    var i = 0;
    for (var adapterId = c.cUserAdapter; adapterId < settings.adapters.length; adapterId++) {
        if (settings.adapters[adapterId]) {
            setTimeout(startAdapter, (i*3000), adapterId);
            i++;
        }
    }

    // Start as last script engine
    if (settings.adapters[c.cScript]) {
        setTimeout(startScriptEngine, (i*3000), c.cScript);
    }
}

process.on('SIGINT', function () {
    stop();
});

process.on('SIGTERM', function () {
    stop();
});

function stop() {
    try {
        // Terminate all adapters
        for (var i = 0, len = childrenAdapter.length; i < len; i++) {
            if (childrenAdapter[i] && childrenAdapter[adapter].process) {
                logger.info("Homander  killing adapter "+settings.adapters[i].name);
                if (childrenAdapter[adapter].timerAdapter){
                    clearTimeout (childrenAdapter[adapter].timerAdapter);
                    childrenAdapter[adapter].timerAdapter = null;
                }
                childrenAdapter[adapter].process.kill();
                childrenAdapter[adapter].process = null;
            }
        }

        // Disconnect all clients
        socketList.forEach(function (socket) {
            logger.info("socket.io --> disconnecting socket");
            socket.disconnect();
        });

        if (io && io.server) {
            logger.info("Homander  closing http server");
            io.server.close();
            io.server = undefined;
        }
        if (ioSsl && ioSsl.server) {
            logger.info("Homander  closing https server");
            ioSsl.server.close();
            ioSsl.server = undefined;
        }
    } catch (e) {
        logger.error("Homander  something went wrong while terminating: "+e)
    }

    saveDataValues();
    savePersistentObjects();

    setTimeout(quit, 500);
}

function quit() {
    logger.verbose("Homander  quit");
	logger.info("Homander  uptime "+stats.uptime());
	logger.info("Homander  terminating");
	setTimeout(function () {
		process.exit(0);
	}, 250);
}

function cacheLog(str) {
    devlogCache.push(str);
}

var logMoving = [];

function writeLog() {

    if (logMoving[settings.logging.file]) {
        setTimeout(writeLog, 250);
        return false;
    }

    var tmp = devlogCache;
    devlogCache = [];

    var l = tmp.length;
    logger.verbose("Homander  writing "+l+" lines to "+settings.logging.file);

    var file = __dirname+"/log/"+settings.logging.file;

    fs.appendFile(file, tmp.join(""), function (err) {
        if (err) {
            logger.error("Homander  writing to "+settings.logging.file + " error: "+JSON.stringify(err));
        }
    });

}

function moveLog(file) {
    logMoving[file] = true;
    setTimeout(moveLog, 86400000);
    var ts = (new Date()).getTime() - 3600000;
    ts = new Date(ts);


    var timestamp = ts.getFullYear() + '-' +
        ("0" + (ts.getMonth() + 1).toString(10)).slice(-2) + '-' +
        ("0" + (ts.getDate()).toString(10)).slice(-2);

    logger.info("Homander  moving Logfile "+file+" "+timestamp);

    fs.rename(__dirname+"/log/"+file, __dirname+"/log/"+file+"."+timestamp, function() {
        logMoving[file] = false;
    });

}

function devLog(id, value) {
    var ts  = value.ts;
    var val = value.val;
    if (!settings.logging.enabled) {
        return;
    }
    if (!metaObjects[id[0]][id[1]].isLogged) {
        return;
    }

    if (!ts || (typeof ts == "string" && ts.indexOf(" ") != -1)) {
        ts = Math.round((new Date()).getTime() / 1000);
    }

    if (typeof val === "string") {
        if (val === "true")  { val = true; }
        if (val === "false") { val = false; }
        if (!isNaN(val)) {
            val = parseFloat(val);
        }
    }
    cacheLog(ts+" "+id[2/*cComboId*/]+" "+JSON.stringify(val)+"\n");
}

function savePersistentObjects() {
    var name    = "io-persistent-objs.json";
    var objects = JSON.parse(JSON.stringify(metaObjects));

    for (var i = 0, ilen = objects.length; i < ilen; i++) {
        if (objects[i]) {
            for (var j = 0, jlen = objects[i].length; j < jlen; j++) {
                if (objects[i][j] && !objects[i][j].isPersistent) {
                    objects[i][j] = null;
                }
            }
        }
    }

    fs.writeFileSync(settings.datastorePath+name, JSON.stringify(objects));
    logger.info("Homander  saved persistent objects");
    objects = null;
}

function loadPersistentObjects() {
    try {
        var objects = JSON.parse(fs.readFileSync(settings.datastorePath+"io-persistent-objs.json"));
        for (var i = 0, ilen = objects.length; i < ilen; i++) {
            if (objects[i]) {
                for (var j = 0, jlen = objects[i].length; j < jlen; j++) {
                    if (objects[i][j]) {
                        addObject (i, j, objects[i][j]);
                    }
                }
            }
        }
        logger.info("Homander      loaded persistent objects");
        return true;
    } catch (e) {
        return false;
    }
}

function saveDataValues() {
    var name = "io-persistent-dps.json";
    var content = JSON.parse(JSON.stringify(dataValues));

    for (var i = 0, ilen = content.length; i < ilen; i++) {
        if (content[i]) {
            for (var j = 0, jlen = content[i].length; j < jlen; j++) {
                if (content[i][j] && (!metaObjects[i][j] || !metaObjects[i][j].isPersistent)) {
                    content[i][j] = null;
                }
                else {
                    content[i][j].ack = null;
                }
            }
        }
    }

    fs.writeFileSync(settings.datastorePath+name, JSON.stringify(content));
    logger.info("Homander  saved dataValues");
    content = null;
}

function loadDataValues() {
    var dps;
    try {
        var x = fs.readFileSync(settings.datastorePath+"io-persistent-dps.json");
        dps = JSON.parse(x);
        dataValues = dps;
        logger.info("Homander  loaded dataValues");
        return true
    } catch (e) {
        return false;
    }
}
