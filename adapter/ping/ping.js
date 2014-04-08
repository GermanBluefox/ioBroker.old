/**
 *      ioBroker Ping Adapter
 *      11'2013-2014 Bluefox
 *
 *      Version 0.3
 *
 */

var logger = require(__dirname+'/../../logger.js'),
    io     = require('socket.io-client'),
    c      = require(__dirname+'/www/lib/js/sysConst.js'),
	ping   = require("ping");

var statesIDs = [],// array with {ip, state}
    curID     = null;

// 4 arguments will be sent by server to adapter: serverPort, serverIsSec, serverIp and adapterId

var socket;
// Connect to server
if (process.env.serverPort) {
	socket = io.connect(process.env.serverIp || "127.0.0.1", {
		port:   process.env.serverPort,
        secure: process.env.serverIsSec
	});
} else {
	process.exit();
}

var settings = null;

socket.on('connect', function () {
    logger.info("adapter ping  connected to ioBroker");
    this.emit ("getAdapterSettings", process.env.adapterId, function (data) {
        settings = data;
        pingInit ();
    });
});

socket.on('getAdapterId', function (callback) {
    if (callback) {
        callback (process.env.adapterId);
    }
});

socket.on('disconnect', function () {
    logger.info("adapter ping  disconnected from ioBroker");
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

    for (var id_ in settings.IPs) {
        var id = parseInt (id_.substring(1));

        var ip_ = settings.IPs[id_].ip.replace(/\./g,"_");

        devChannels.push((settings.firstId + 1) + (id * 2));
		
        var chObject = {
            name:         (settings.IPs[id_]['name']) ? settings.IPs[id_]['name'] : settings.IPs[id_].ip,
            type:         cObjTypePoint,
            address:      ip_+".STATE",
            isLogged:     true,
            isPersistent: true,
            specType:     "PING"
        };
		
		if (settings.IPs[id_].location) {
			chObject.location = settings.IPs[id_].location;
		}
		if (settings.IPs[id_].role) {
			chObject.role = settings.IPs[id_].role;
		}
		
		addObject(i, chObject);

        statesIDs[i] = id_;

        i++;
    }

    logger.info("adapter ping  inserted objects");
	// Fix polling interval if too short
	if (settings.pollingInterval <= 5000 * (i + 1)) {
		settings.pollingInterval = 5000 * (i + 1);
	}

    logger.info("adapter ping  polling enabled - interval "+settings.pollingInterval+"ms");

    setInterval(pollIp, settings.pollingInterval);
    pollIp (undefined);
}

function setState(objId, val) {
    logger.verbose("adapter ping  setState "+settings.IPs[statesIDs[objId]].ip+" "+val);
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
        logger.verbose("adapter ping  polling ip "+settings.IPs[statesIDs[curID]].ip);
        ping.sys.probe(settings.IPs[statesIDs[curID]].ip, function(isAlive){
            if (!isAlive) {
                logger.verbose("adapter ping  result for "+settings.IPs[statesIDs[curID]].ip+" is UNRECHABLE");
                setState(curID,  false);
            } else {
                logger.verbose("adapter ping  result for "+settings.IPs[statesIDs[curID]].ip+" is ALIVE");
                setState(curID,  true);
            }
        });
        setTimeout (pollIp, 5000, objId);
    }
}



