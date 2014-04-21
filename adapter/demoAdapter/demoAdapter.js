/**
 *      Demo Adapter
 *      11'2013-2014 hobbyquacker, bluefox
 *
 *      Version 0.1
 *
 *      Demo adapter
 *
 */

var logger     = require(__dirname+'/../../logger.js'),
    io         = require('socket.io-client'),
    c          = require(__dirname+'/www/lib/js/sysConst.js'); // Constants for addressing

var socket;
var settings;
var counter = 0; // optional

// Connect to server
if (process.env.serverPort) {
    socket = io.connect(process.env.serverIp || "127.0.0.1", {
        port:   process.env.serverPort,
        secure: process.env.serverIsSec
    });
} else {
    process.exit();
}

socket.on('connect', function () {
    logger.info("adapter pushover  connected to ioBroker");
    this.emit ("getAdapterSettings", process.env.adapterId, function (data) {
        settings = data;

    });
});

socket.on('getAdapterId', function (callback) {
    if (callback) {
        callback (process.env.adapterId);
    }
});

socket.on('someSpecificCommand', function (obj) {
    //Process specific command
});

socket.on('event', function (id, val) {
    //Process specific command
    if (!val.ack){
        logger.verbose ('Got command ' + val.val + ' for variable ' + id);
    } else {
        logger.verbose ('Got update ' + val.val + ' (time: '+ val.ts + ') for variable ' + id);
    }
});

socket.on('disconnect', function () {
    logger.info("adapter pushover  disconnected from ioBroker");
});

function stop() {
    logger.info("adapter pushover  terminating");
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
// Update value of variable
function setValue(id, value, timestamp) {
    socket.emit ('setPointValue', {val: value, ts: timestamp});
}

function initAdapter () {
    // Init adapter with settings

    // Register variable
    addObject (1, // Id of the variable in this adapter
        {   name:        "Test1",
            specType:    "Variable",
            type:        c.cObjTypePoint, // cObjTypeDevice, cObjTypeChannel or cObjTypePoint
            isPersistent:false,           // The value should not be saved by power off
            isLogged:    false,           // The variable should not be logged in value logger
            description: "Test variable 1",
            location:    "Nowere extactly"// Can be differ from channel, else will be taken from parent channel
        },
        {val: 1}
    );
    addObject (0, // Id of the variable in this adapter
        {   name:        "Test1",
            specType:    "Channel",
            type:        c.cObjTypePoint, // cObjTypeDevice, cObjTypeChannel or cObjTypePoint
            location:    "Nowere",
            role:        "TestRole",
            description: "Test channel 1",
            children:    [1] // here is id of Test1
        },
        {val: 1}
    );

    // --- OK ---
    // Device => Channel => Variable
    //         L Channel => Variable
    //                   L  Variable

    // Channel => Variable
    //          L Variable

    // Variable

    // --- not OK ---
    // Variable => Channel
    // Device   => Variable
    // Channel  => Device

    //Update datapoint every 5 seconds
    setTimeout (function () {
        // Channel cannot be updated
        setValue(1, counter++);
    }, 5000);
}