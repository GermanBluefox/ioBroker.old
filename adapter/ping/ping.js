/**
 *      Homander Ping Adapter
 *      11'2013-2014 Bluefox
 *
 *      Version 0.3
 *
 */

// Constants of object types
var cObjTypeDevice  = 1;
var cObjTypeChannel = 2;
var cObjTypePoint   = 3;

var settings = require(__dirname+'/../../settings.js');

var logger = require(__dirname+'/../../logger.js'),
    io     = require('socket.io-client'),
	ping   = require("ping");

var statesIDs = [],// array with {ip, state}
    curID     = null;

if (settings.ioListenPort) {
	var socket = io.connect("127.0.0.1", {
		port: settings.ioListenPort
	});
} else if (settings.ioListenPortSsl) {
	var socket = io.connect("127.0.0.1", {
		port: settings.ioListenPortSsl,
		secure: true
	});
} else {
	process.exit();
}

var pingSettings = null;

socket.on('connect', function () {
    logger.info("adapter ping  connected to Homander");
    this.emit ("getAdapterSettings", process.env.adapterId, function (data) {
        pingSettings = data;
        pingInit ();
    });
});

socket.on('getAdapterId', function (callback) {
    if (callback) {
        callback (process.env.adapterId);
    }
});

socket.on('disconnect', function () {
    logger.info("adapter ping  disconnected from Homander");
});

function stop() {
    logger.info("adapter ping  terminating");
    setTimeout(function () {
        process.exit();
    }, 250);
}

process.on('SIGINT', function () {
    stop();
});

process.on('SIGTERM', function () {
    stop();
});

function addObject(id, obj) {
    socket.emit("addObject", id, obj);
}

function pingInit () {
    var devChannels = [];
    var i = 0;

    for (var id_ in pingSettings.IPs) {
        var id = parseInt (id_.substring(1));

        var ip_ = pingSettings.IPs[id_].ip.replace(/\./g,"_");

        devChannels.push((pingSettings.firstId + 1) + (id * 2));
		
        var chObject = {
            name:         (pingSettings.IPs[id_]['name']) ? pingSettings.IPs[id_]['name'] : pingSettings.IPs[id_].ip,
            type:         cObjTypePoint,
            address:      ip_+".STATE",
            isLogged:     true,
            isPersistent: true,
            specType:     "PING"
        };
		
		if (pingSettings.IPs[id_].location) {
			chObject.location = pingSettings.IPs[id_].location;
		}
		if (pingSettings.IPs[id_].role) {
			chObject.role = pingSettings.IPs[id_].role;
		}
		
		addObject(i, chObject);

        statesIDs[i] = id_;

        i++;
    }

    logger.info("adapter ping  inserted objects");
	// Fix polling interval if too short
	if (pingSettings.pollingInterval <= 5000 * (i + 1)) {
		pingSettings.pollingInterval = 5000 * (i + 1);
	}

    logger.info("adapter ping  polling enabled - interval "+pingSettings.pollingInterval+"ms");

    setInterval(pollIp, pingSettings.pollingInterval);
    pollIp (undefined);
}

function setState(objId, val) {
    logger.verbose("adapter ping  setState "+pingSettings.IPs[statesIDs[objId]].ip+" "+val);
    socket.emit("setPointValue", objId, val, null, true);
}

function pollIp(objId) {
    if (!statesIDs.length) {
        return;
    }

    if (objId === undefined) {
        objId = 0;
    }
    else
        objId++;

    if (statesIDs[objId] !== undefined) {
        curID = objId;
        logger.verbose("adapter ping  polling ip "+pingSettings.IPs[statesIDs[curID]].ip);
        ping.sys.probe(pingSettings.IPs[statesIDs[curID]].ip, function(isAlive){
            if (!isAlive) {
                logger.verbose("adapter ping  result for "+pingSettings.IPs[statesIDs[curID]].ip+" is UNRECHABLE");
                setState(curID,  false);
            } else {
                logger.verbose("adapter ping  result for "+pingSettings.IPs[statesIDs[curID]].ip+" is ALIVE");
                setState(curID,  true);
            }
        });
        setTimeout (pollIp, 5000, objId);
    }
}



