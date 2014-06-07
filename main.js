/**
 *      ioBroker - communication brocker for Node.js
 *
 *      Socket.IO based Home Automation Interface
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

var settings = require(__dirname+'/settings.js');

// Do not change formatting of the next string, because used in Grunt. (Value can be changed)
settings.version             = "2.0.0";
settings.basedir             = __dirname;
settings.datastorePath       = __dirname+"/datastore/";
settings.stringTableLanguage = settings.stringTableLanguage || "de";

var fs =        require('fs-extra'),
    logger =    require(__dirname+'/logger.js'),
    crypto =    require('crypto'),
    request =   require('request'),
    cp =        require('child_process'),
    socketio =  require('socket.io'),
    scheduler = require('node-schedule'),
    _ =         require('lodash'),
    c =         require(__dirname+'/www/lib/js/sysConst.js'),
    os=         require('os'),
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
        device:   [],   // [id10, id20, id30] - List of all devices
        channel:  [],   // [id11, id12, id21, id31 ] - List of all channels
        point:    [],   // [id1, id4] - List of all points
        specType: {},   // "PLAY:3" : [id1], "HM-SEC1" : [id50], ...
        address:  [],   // [adpaterId] - specific addresses, like 192.168.2.3 or HQE67655444 {["SFGHE":id1], ["abcd": id2]}
        adapter:  {},   // { "sonos": 4, "System": 0, "script": 1}
        favorite: {},   // { "Light" : [34,56,43], "Heat": [123, 45, 64]}
        location: {},   // "living room" : [id1, id2, id3], "wc" : [id4, id2, id5] - ids are sorted
        role:     {},   // "Media" : [id1, id4], "Light" : [id6, id7] - ids are sorted
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
    io = socketio.listen(parseInt(settings.ioListenPort) + 1);
    initSocketIO(io);
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
         // Create the Socket.io Server over the HTTPS Server
        ioSsl = socketio.listen(parseInt(settings.ioListenPortSsl) + 1, options);
        initSocketIO(ioSsl);
    }
}


logger.info   ("ioBroker  starting version "+settings.version + " copyright (c) 2013-2014 hobbyquaker,bluefox http://iobroker.com");
logger.verbose("ioBroker  commandline "+JSON.stringify(process.argv));

// Create system variables
dataValues[c.cSystem] = [];
if (!settings.adapters) {
    settings.adapters = [];
}
// Define system adapters: web server and system variables
settings.adapters[c.cSystem]    = {type: "System",    parent: c.cSystem,    description: "ioBroker system variables"};
settings.adapters[c.cWebServer] = {type: "webServer", parent: c.cWebServer, description: "ioBroker web server"};

// Clear tmp directory
deleteFolderRecursive(__dirname+'/tmp');

loadPersistentObjects();
loadDataValues();
createSystemVariables ();
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
    // Create restart required variable
    addObject (c.cSystem, c.cSystemRestartRequired,
        // Object description
        {   name:        "RestartRequired",
            specType:    "Variable",
            type:        c.cObjTypePoint,
            isPersistent:false,
            isLogged:    false,
            description: "If restart of core required"
        },
        // Object value
        false
    );
    // Create restart reason variable
    addObject (c.cSystem, c.cSystemWhyRestartRequired,
        // Object description
        {   name:        "WhyRestartRequired",
            specType:    "Variable",
            type:        c.cObjTypePoint,
            isPersistent:false,
            isLogged:    false,
            description: "List of adapters which requires restart"
        },
        // Object value
        ""
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

var commStats = {
    clients: 0,
    counters: {}, // counters in form {rx: 5, wired: 10}
    start: ((new Date()).getTime()),
    uptime: function() {
        var mseconds = ((new Date()).getTime()) - commStats.start;
        var diff = new Date(mseconds);
        var hours = diff.getHours();
        var days = Math.floor(hours/24);
        hours = hours - (24 * days);
        return days+" days, "+(hours-1)+" hours, "+ diff.getMinutes()+" minutes, "+diff.getSeconds()+" seconds";
    },
    log: function() {
        for (var cnt in commStats.counters) {
            if (commStats.counters[cnt].last === undefined) {
                commStats.counters[cnt].last = 0;
            }
            logger.info("ioBroker stats  "+cnt+": "+((commStats.counters[cnt].value - commStats.counters[cnt].last)/settings.statsIntervalMinutes).toFixed(0)+"msg/min");
            commStats.counters[cnt].last = commStats.counters[cnt].value;
        }
        logger.info("ioBroker stats  "+socketList.length+" Socket.IO Clients connected");
        logger.verbose("ioBroker uptime "+commStats.uptime());
    }
};

if (settings.commStats.enabled) {
    setInterval(commStats.log, settings.commStats.intervalMinutes * 60000);
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

function deleteFolderRecursive (path) {
    if (fs.existsSync(path)) {
        fs.readdirSync(path).forEach(function(file,index){
            var curPath = path + "/" + file;
            if (fs.statSync(curPath).isDirectory()) { // recurse
                deleteFolderRecursive(curPath);
            } else { // delete file
                fs.unlinkSync(curPath);
            }
        });
        fs.rmdirSync(path);
    }
};

function indexOfSorted (element, arr) {
    var num = locationOf(element, arr);
    if (arr[num][2] == element[2]) {
        return num;
    }
    return -1;
}

// Binary search
function locationOf (element, arr, start, end) {
    start = start || 0;
    end = end || arr.length;
    var pivot = parseInt(start + (end - start) / 2, 10);
    if (arr[pivot][2] === element[2]) {
        return pivot;
    }
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
        var insertIn = locationOf(element, arr);
        if (arr[insertIn][2] == element[2]) {
            return;
        }

        arr.splice(locationOf(element, arr) + 1, 0, element);
    }
    return arr;
}

// Convert value to formatted object {val, ts(timestamp), ack(acknowledged), ls (last changed)}
function getObjValue (value) {
    var objVal = {val: null, ts: null, ack: true, lc: null};
    if (typeof value == "object" && value !== null && value.val) {
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
    if (typeof value == 'object') {
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
function addObject (adapterID, objID, obj, value, informAdapters) {
    var processedFields = ['parent', 'type', 'name', 'children', 'specType', 'address'];
    adapterID = getAdapterId (adapterID);
    objID = parseInt (objID);

    if (adapterID === undefined || adapterID > c.cAdapterMask) {
        logger.error('addObject '+adapterID+ '.' + objID +' ' + JSON.stringify(obj) + ' has invalid format: adapterID is invalid');
        return null;
    }
    if (objID === undefined || objID > c.cObjectsMask) {
        logger.error('addObject '+adapterID+ '.' + objID +' ' + JSON.stringify(obj) + ' has invalid format: objID is invalid');
        return null;
    }
    var indexObject = [adapterID, objID, adapterID << c.cAdapterShift | objID];

    if (typeof obj != 'object') {
        logger.error('addObject '+adapterID+ '.' + objID +' '+ JSON.stringify(obj) + ' has invalid format: not an object');
        return null;
    }
    if (obj.name === undefined) {
        logger.error('addObject '+adapterID+ '.' + objID +' '+ JSON.stringify(obj) + ' has invalid format: no name is set');
        return null;
    }
    if (obj.type === undefined) {
        logger.error('addObject '+adapterID+ '.' + objID +' '+ JSON.stringify(obj) + ' has invalid format: no type is set');
        return null;
    }
    if (typeof obj.type == 'string') {
        obj.type = obj.type.toLowerCase();
        // Try to convert type
        switch (obj.type) {
            case 'device':
                obj.type = c.cObjTypeDevice;
                break;
            case 'point':
                obj.type = c.cObjTypePoint;
                break;
            case 'channel':
                obj.type = c.cObjTypeChannel;
                break;
            default:
                logger.error('addObject '+JSON.stringify(obj)+' has invalid format: invalid type');
                return null;
        }
    }

    if (!metaObjects[adapterID]) {
        metaObjects[adapterID] = [];
        dataValues [adapterID] = [];
    }

    // Convert children array from string to number
    if (obj.children) {
        for (var t = 0, len = obj.children.length; t < len; t++) {
            if (typeof obj.children[t] == 'string') {
                obj.children[t] = parseInt (obj.children[t]);
            }
        }
    }

    obj.adapterId = adapterID;
    if (obj.location) {
        obj.location = [obj.location];
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
            logger.warn('addObject '+adapterID+ '.' + objID +' ' + JSON.stringify(obj) + ' add object with non- existing parent');
        }
    }

    // Arrange indexes
    // Name
    if (!metaIndex.name[adapterID]) {
        metaIndex.name[adapterID] = {};
    }

    if (metaIndex.name[adapterID][obj.name] !== undefined && metaIndex.name[adapterID][obj.name][2/*cCombiId*/] != indexObject[2/*cCombiId*/]) {
        logger.warn('addObject '+adapterID+ '.' + objID +' '+ JSON.stringify(obj) + ' has not an unique name');
    }
    else {
        metaIndex.name[adapterID][obj.name] = indexObject;
    }

    // Process favorites, locations, roles, etc
    for (var attr in obj) {
        if (attr[0] != '_' && processedFields.indexOf(attr) == -1) {
            // Always make array from string
            if (obj[attr] && typeof obj[attr] == 'string') {
                obj[attr] = [obj[attr]];
            }
            for (var i = 0, len = obj[attr].length; i < len; i++) {
                if (obj[attr][i]) {
                    if (metaIndex[attr] === undefined) {
                        metaIndex[attr] = {};
                    }
                    if (metaIndex[attr][obj[attr][i]] === undefined) {
                        metaIndex[attr][obj[attr][i]] = [];
                    }
                    insertSorted (metaIndex[attr][obj[attr][i]], indexObject);
                }
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
            metaIndex.address[adapterID] = {};
        }
        if (metaIndex.address[adapterID][obj.address] !== undefined && metaIndex.address[adapterID][obj.address][2/*cCombiId*/] != indexObject[2/*cCombiId*/]) {
            logger.warn('addObject '+adapterID+ '.' + objID +' '+ JSON.stringify(obj) + ' has not an unique address');
        }
        else {
            metaIndex.address[adapterID][obj.address] = indexObject;
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

    logger.verbose('addObject '+adapterID+ '.' + objID +' '+ JSON.stringify(obj) + ' inserted succsessfully');

    if (informAdapters) {
        // Inform GUI and adapters about new object
        sendNewObject(indexObject, value);
    }

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
            if (socketList[i].subscribe) {
                if (indexOfSorted(id, socketList[i].subscribe) == -1) {
                    continue;
                }
            }
            // Adapters => GUI
            if (value.ack) {
                if (!adapterId || metaIndex.adapterInfo[adapterId].multiData) {
                    socketList[i].emit('event', id[2/*cCombiId*/], value);
                }
            }
            // GUI => Adapters
            else {
                if (id[0/*cAdapterId*/] == adapterId || metaIndex.adapterInfo[adapterId].multiData) {
                    socketList[i].emit('event', (!adapterId || !metaIndex.adapterInfo[adapterId] || metaIndex.adapterInfo[adapterId].multiData) ? id[2/*cCombiId*/] : id[1/*cObjectId*/], value);
                }
            }
        }
    }
}

// Inform adapter and GUI about one new object
function sendNewObject (id, value) {
    logger.verbose("sendNewObject: " + settings.adapters[id[0/*cAdapterId*/]].name + "." + metaObjects[id[0/*cAdapterId*/]][id[1/*cObjectId*/]].name + " value - " + JSON.stringify(value));
    // go through all sockets
    for (var i = 0, len = socketList.length; i < len; i++)  {
        if (socketList[i]) {
            // Send information only to multiData adapters or GUI
            var adapterId = socketList[i].adapterId;
            if (!adapterId || metaIndex.adapterInfo[adapterId].multiData) {
                socketList[i].emit('newObject', id[2/*cCombiId*/], metaObjects[id[0/*cAdapterId*/]][id[1/*cObjectId*/]], value);
            }
        }
    }
}

// inform adapters and GUI about many new objects for one adapter. Adapter must read information for this adapter anew.
function sendNewObjects (adapterId) {
    // go through all sockets
    for (var i = 0, len = socketList.length; i < len; i++)  {
        if (socketList[i]) {
            // Send information only to multiData adapters or GUI
            var adapterId = socketList[i].adapterId;
            if (!adapterId || metaIndex.adapterInfo[adapterId].multiData) {
                logger.verbose("sendNewObjects: new data points of adapter " + settings.adapters[adapterId].name + ' to '+ ( settings.adapters[socketList[i].adapterId]) ? settings.adapters[socketList[i].adapterId].name :  socketList[i].id);
                socketList[i].emit('newObjects', adapterId);
            }
        }
    }
}

// Convert adapter from string or number to number
// Following input is enabled: "ccu", 10, "10", "ccu_10"
function getAdapterId (adapter) {
    var adapterId;
    if (typeof adapter == 'string' && adapter.length > 0) {
        if (adapter[0] >= '0' && adapter[0] <= '9') {
            adapterId = parseInt (adapter);
        } else {
            adapterId = metaIndex.adapter[adapter];
        }
    } else {
        adapterId = adapter;
    }

    if (!settings.adapters[adapterId]){
        // invalid adapter
        log.warn ("getId requested invalid adapter " + JSON.stringify (adapter));
        return null;
    }

    return adapterId;
}

function addObjects (adapterId, isMerge, newObjects, newValues) {
    if (!isMerge && metaObjects[adapterId]) {
        metaObjects[adapterId] = null;
    }
    if (newObjects) {
        for (var id in newObjects) {
            if (newObjects[id]) {
                addObject(adapterId, id, newObjects[id], undefined, false);
            }
        }
    }

    sendNewObjects(adapterId);

    if (newValues) {
        for (var id in newValues) {
            if (newValues[dp]) {
                setPointValue([adapterId, id], newValues[dp]);
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
function getId (id, adapterId) {
    // Convert id if not array
    var typeId = typeof id;
    if (typeId != "object") {
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
                adapterId = getAdapterId(adapterId);
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
        else { // number
            if (adapterId) {
                adapterId = getAdapterId(adapterId);
                id = [adapterId, id];
            }
            else {
                id = [id >> c.cAdapterShift, id & c.cObjectsMask, id];
            }
        }
    }

    if (!id[2]){
        id[2] = id[0] << c.cAdapterShift | id[1];
    }

    if (!id[0]) {
        logger.error('getId: invalid adapter id [' + id[0] + ','+id[1]+','+id[2]+']');
    }

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

// Create metaIndex.adapter - address adapter by name
function initAdapters() {
    if (!extDone) {
        // extend index information for adapters
        for (var i = 0, len = settings.adapters.length; i < len; i++) {
            if (settings.adapters[i]) {
                if (!settings.adapters[i].name) {
                    settings.adapters[i].name = settings.adapters[i].type;
                }
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
        // Start web server immediately
        startAdapter(c.cWebServer);
        setTimeout(startAdapters, 5000);
    }
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

function getConnInfo () {
    var info = [];
    this.subscribeConnInfo = true;
    for (var i = 0, len = socketList.length; i < len; i++) {
        var type = (socketList[i].adapterId && settings.adapters[socketList[i].adapterId]) ? settings.adapters[socketList[i].adapterId].type : '';
        info.push({id: i,
            adapterId: socketList[i].adapterId,
            name: (socketList[i].adapterId && settings.adapters[socketList[i].adapterId]) ? settings.adapters[socketList[i].adapterId].name : '',
            type: type,
            socketId: socketList[i].id,
            selfName: socketList[i].adapterName || (type.charAt(0).toUpperCase() + type.slice(1) + " Adapter"),
            ip: socketList[i].handshake.address.address,
            port: socketList[i].handshake.address.port,
            connTime: socketList[i].adapterConnTime
        });
    }
    return info;
}

function updateConnInfo () {
    // Inform control panel about changes
    var isSomeoneWants = false;
    for (var i = 0, len = socketList.length; i < len; i++) {
        if (socketList[i].subscribeConnInfo) {
            isSomeoneWants = true;
            break;
        }
    }
    if (isSomeoneWants) {
        var info = getConnInfo();
        for (var i = 0, len = socketList.length; i < len; i++) {
            if (socketList[i].subscribeConnInfo) {
                socketList[i].emit ('updateConnInfo', info);
            }
        }
    }
}

function initSocketIO(_io) {
	_io.configure(function (){
	  this.set('authorization', function (handshakeData, callback) {
        var isHttps = (this === ioSsl);
        if ((!isHttps && settings.authentication.enabled) || (isHttps && settings.authentication.enabledSsl)) {
            // do not check if localhost
            if(handshakeData.address.address.toString() == "127.0.0.1") {
                logger.verbose("ioBroker  local authetication " + handshakeData.address.address);
                callback(null, true);
            } else
            if (handshakeData.query["key"] === undefined || handshakeData.query["key"] != authHash) {
                logger.warn("ioBroker  authetication error on "+(isHttps ? "https from " : "http from ") + handshakeData.address.address);
                callback ("Invalid session key", false);
            } else{
                logger.verbose("ioBroker  authetication successful on "+(isHttps ? "https from " : "http from ") + handshakeData.address.address);
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
        // By default receive all updates of all variables
        socket.adapterId  = 0;
        socket.subscribe                = null; // array of objects, that this adapter wants to get the updates for
        socket.subscribeConnInfo        = false;// If socketList changes should be sent
        socket.subscribeMetaDataChanges = false;// If by new objects or deletion the update should be sent
        socket.adapterConnTime          = formatTimestamp();

        updateConnInfo();

        // Request adapter id, if no id or 0 (cSystem), send all messages
        socket.emit ("getAdapterId", function (adapterId, name) {
            this.adapterId   = parseInt (adapterId);
            this.adapterName = name;
            logger.info ("Connected adapter " + adapterId + " on " + this.id);

            updateConnInfo();
        });

        socket.on('subscribe', function (id) {
            id = getId(id, this.adapterId);
            if (!socket.subscribe) {
                socket.subscribe = [];
            }
            insertSorted(socket.subscribe, id);
        });

        // Send diagnostics information about connected adpters and GUI
        socket.on('getConnInfo', function (callback) {
            this.subscribeConnInfo = true;
            socket.subscribeMetaDataChanges = true;
            if (callback) {
                callback(getConnInfo());
            }
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
            logger.info("ioBroker  exec "+cmd);
            cp.exec(cmd, callback);
        });

        socket.on('execScript', function (script, arg, callback) {
            logger.info("ioBroker  script "+script + "["+arg+"]");
            var scr_prc = cp.fork (__dirname + script, arg);
            var result = null;
            scr_prc.on('message', function(obj) {
                // Receive results from child process
                console.log ("Message: " + obj);
				logger.debug("ioBroker  script result: " + obj);
                result = obj;
            });
            scr_prc.on ("exit", function (code, signal) {
                if (callback) {
					logger.debug("ioBroker  script end result: " + result);
                    callback (script, arg, result);
                }
            });
        });

        socket.on('restartAdapter', function (adapter) {
            return startAdapter(adapter)
        });

        socket.on('update', function (_url) {
            var path = __dirname + "/update.js";
            logger.info("ioBroker  starting "+path+" "+_url);
            var updateProcess = cp.fork(path, [_url]);
            updateProcess.on("close", function (code) {
                var msg;
                if (code == 0) {
                    msg = " done.";
                } else {
                    msg = " failed.";
                }
                if (io) {
                    io.sockets.emit('ioMessage', 'Update '+_url + ' ' + msg);
                }
                if (ioSsl) {
                    ioSsl.sockets.emit('ioMessage', 'Update '+_url + ' ' + msg);
                }
            });
        });

        socket.on('updateSelf', function (_url) {
            var path = __dirname + "/update.js";
            settings.updateSelfRunning = true;
            logger.info("ioBroker  starting "+path);
            var updateProcess = cp.fork(path, [_url]);
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
                    logger.info('ioBroker  update done. restarting...');
                    cp.fork(__dirname+'/ioBroker.js', ['restart']);
                } else {
                    logger.error("ioBroker  update failed.");
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
            logger.info("ioBroker  starting "+path);
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
                    logger.error("ioBroker  Backup failed.");
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
            logger.info("ioBroker  starting "+path);
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
                        io.sockets.emit("applyReady", "Apply backup done. Restart ioBroker");
                    }
                    if (ioSsl) {
                        ioSsl.sockets.emit("applyReady", "Apply backup done. Restart ioBroker");
                    }
                } else {
                    logger.error("ioBroker  Apply backup failed.");
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
            logger.info("ioBroker  received restart command");
            cp.fork(__dirname+"/iobroker-server.js", ["restart"]);
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
            if (callback) {
                callback();
            }
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
                    logger.error("ioBroker  failed loading file "+settings.datastorePath+name);
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
                    logger.error("ioBroker  failed loading file "+__dirname+"/"+name);
                    callback(undefined);
                } else {
                    callback(data.toString());
                }
            });
        });

        socket.on('touchFile', function (name, callback) {
            logger.verbose("socket.io <-- touchFile "+name);
            if (!fs.existsSync(__dirname+"/"+name)) {
                logger.info("ioBroker  creating empty file "+name);
                var stream = fs.createWriteStream(__dirname+"/"+name);
                stream.end();
            }
        });

        socket.on('delRawFile', function (name, callback) {
            logger.info("socket.io <-- delRawFile "+name);

            fs.unlink(__dirname+"/"+name, function (err, data) {
                if (err) {
                    logger.error("ioBroker  failed deleting file "+__dirname+"/"+name);
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
                    logger.error("ioBroker  failed loading file "+__dirname+"/"+name);
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

        socket.on('getUrl', function (_url, callback) {
            logger.info("ioBroker  GET "+_url);
            if (_url.match(/^https/)) {
                protocol = https;
            }
            protocol.get(_url, function(res) {
                var body = "";
                res.on("data", function (data) {
                    body += data;
                });
                res.on("end", function () {
                    if (callback) {
                        callback(body);
                    }
                });
            }).on('error', function(e) {
                logger.error("ioBroker  GET "+_url+" "+ e.message);
                if (callback) {
                    callback(null);
                }
            });
        });

        // Download file and store it in tmp directory
        socket.on('downloadFile', function (_url, localFile, callback) {
            logger.info("ioBroker  GET Packet: "+_url);
            var file = fs.createWriteStream(__dirname + '/tmp/' + localFile);
            var protocol = http;

            if (_url.match(/^https/)) {
                protocol = https;
            }
            protocol.get(_url, function(res) {
                res.pipe(file);
                file.on('finish', function(){
                    if (callback) {
                        callback(localFile);
                    }
                });
            }).on('error', function(e) {
                logger.error("ioBroker  GET "+_url+" "+ e.message);
                if (callback) {
                    callback(localFile, e.message);
                }
            });
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
            if (!commStats.counters[name]) {
                commStats.counters[name] = {value: 0};
            }

            commStats.counters[name].value = value;
        });

        // Get communication statistics
        socket.on('getStats', function(name, callback) {
            if (!callback) {
                return;
            }
            if (name) {
                callback(commStats.counters[name]);
            }
            else {
                callback(commStats.counters);
            }
        });

        socket.on('getAdapterSettings', function (adapterId, callback) {
            callback(settings.adapters[adapterId] ? settings.adapters[adapterId].settings : null);
        });

        socket.on('getSettings', function (callback) {
            callback(settings);
        });

        socket.on('setSettings', function (_settings, reasonId, callback) {
            settings = _settings;

            logger.verbose("socket.io <-- writeFile settings.json");
            var _settings = _.clone(settings);

            // Set that restart required
            setPointValue([c.cSystem, c.cSystemRestartRequired], true);

            // Set why restart required
            var reason = dataValues[c.cSystem][c.cSystemWhyRestartRequired].val;
            if (reason.indexOf(settings.adapters[reasonId]) == -1) {
                reason += ((reason) ? ', ': '') + settings.adapters[reasonId].name;
                setPointValue([c.cSystem, c.cSystemWhyRestartRequired], reason);
            }

            // Remove standard adapters
            _settings.adapters[c.cSystem] = null;
            _settings.adapters[c.cScript] = null;

            fs.writeFile(settings.datastorePath+'settings.json', JSON.stringify(_settings));

            _settings = null;

            // Todo Fehler abfangen
            if (callback) {
                callback(true);
            }
        });

        socket.on('getVersion', function(callback) {
            if (callback) {
                callback(settings.version);
            }
        });

        socket.on('getPointValues', function(callback) {
            logger.verbose("socket.io <-- getData");
            if (callback) {
                callback(dataValues);
            } else {
                logger.error('getPointValues called with null callback');
            }
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
                if (callback) {
                    callback(id, dataValues[adapterId][objId]);
                } else {
                    logger.error('getPointValue called with null callback');
                }
            }
        });
		
        socket.on('getObjects', function(callback) {
            logger.verbose("socket.io <-- getObjects");
            if (callback) {
                callback(metaObjects);
            } else {
                logger.error('getObjects called with null callback');
            }
        });

        socket.on('getIndex', function(callback) {
            logger.verbose("socket.io <-- getIndex");
            if (callback) {
                callback(metaIndex);
            } else {
                logger.error('getIndex called with null callback');
            }
        });

        socket.on('addObject', function (objId, obj, value, callback) {
            if (this.adapterId) {
                if (addObject (this.adapterId, objId, obj, value) != null) {
                    if (callback) {
                        callback (true);
                    }
                }
                else
                if (callback) {
                    callback (false);
                }
            }
            else {
                if (typeof objId != 'object') {
                    logger.warn('addObject : objId must be defined as array');
                    if (callback) {
                        callback (false);
                    }
                }
                else if (objId.length > 1) {
                    if (addObject (objId[0], objId[1], obj, value)) {
                        if (callback) {
                            callback(true);
                        }
                    }
                    else
                    if (callback) {
                        callback (false);
                    }
                }
                else {
                    logger.warn("addObject : objId must be defined as array with [adapter, obj]");
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
    if (childrenAdapter[adapterId].process && !childrenAdapter[adapterId].period) {
        try{
            isRestarting = true;
            logger.info("ioBroker  killing adapter " + settings.adapters[adapterId].name);
            childrenAdapter[adapterId].process.kill ();
            childrenAdapter[adapterId].process = null;
        }
        catch (e)
        {

        }
    }

    logger.info("ioBroker  starting adapter "+settings.adapters[adapterId].name+(childrenAdapter[adapterId].period ? ' (interval='+period+'ms)': ''));
    var path = __dirname + '/adapter/'+settings.adapters[adapterId].type+"/"+settings.adapters[adapterId].type+'.js';
    var env = _.clone (process.env);

    env.adapterId   = adapterId;
    env.serverIp    = '127.0.0.1';
    env.serverPort  = settings.ioListenPort || settings.ioListenPortSsl;
    env.serverIsSec = settings.ioListenPort ? false: (settings.ioListenPortSsl ? true: false);

    childrenAdapter[adapterId].process = cp.fork (path, env);

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
        setTimeout(startAdapter, (i*3000), c.cScript);
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
                logger.info("ioBroker  killing adapter "+settings.adapters[i].name);
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
            logger.info("ioBroker  closing http server");
            io.server.close();
            io.server = undefined;
        }
        if (ioSsl && ioSsl.server) {
            logger.info("ioBroker  closing https server");
            ioSsl.server.close();
            ioSsl.server = undefined;
        }
    } catch (e) {
        logger.error("ioBroker  something went wrong while terminating: "+e)
    }

    saveDataValues();
    savePersistentObjects();

    setTimeout(quit, 500);
}

function quit() {
    logger.verbose("ioBroker  quit");
	logger.info("ioBroker  uptime "+commStats.uptime());
	logger.info("ioBroker  terminating");
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
    logger.verbose("ioBroker  writing "+l+" lines to "+settings.logging.file);

    var file = __dirname+"/log/"+settings.logging.file;

    fs.appendFile(file, tmp.join(""), function (err) {
        if (err) {
            logger.error("ioBroker  writing to "+settings.logging.file + " error: "+JSON.stringify(err));
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

    logger.info("ioBroker  moving Logfile "+file+" "+timestamp);

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
    logger.info("ioBroker  saved persistent objects");
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
        logger.info("ioBroker      loaded persistent objects");
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
    logger.info("ioBroker  saved dataValues");
    content = null;
}

function loadDataValues() {
    var dps;
    try {
        var x = fs.readFileSync(settings.datastorePath+"io-persistent-dps.json");
        dps = JSON.parse(x);
        dataValues = dps;
        logger.info("ioBroker  loaded dataValues");
        return true
    } catch (e) {
        return false;
    }
}
