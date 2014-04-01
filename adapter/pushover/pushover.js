/**
 *      Homander pushover Adapter
 *      11'2013-2014 hobbyquacker, bluefox
 *
 *      Version 0.1
 *
 *      To send pushover notification from user script:
 *
 *       toAdapter ('pushover', 'send', {
 *          message:  'Test text', // mandatory - your text message
 *          title:    'SweetHome', // optional  - your message's title, otherwise your app's name is used
 *          sound:    'magic',     // optional  - the name of one of the sounds supported by device clients to override the user's default sound choice
 *                                 //    pushover, bike, bugle, cashregister, classical, cosmic, falling,
 *                                 //    gamelan, incoming, intermission, magic, mechanical, pianobar, siren,
 *                                 //    spacealarm, tugboat, alien, climb, persistent, echo, updown, none
 *          priority: -1,          // optional
 *                                 //    -1 to always send as a quiet notification,
 *                                 //    1 to display as high-priority and bypass the user's quiet hours, or
 *                                 //    2 to also require confirmation from the user
 *          url,                   // optional  - a supplementary URL to show with your message
 *          url_title,             // optional  - a title for your supplementary URL, otherwise just the URL is shown
 *          device,                // optional  - your user's device name to send the message directly to that device, rather than all of the user's devices
 *          timestamp              // optional  - a Unix timestamp of your message's date and time to display to the user, rather than the time your message is received by our API
 *       });
 *
 */


var po_notif = require('pushover-notifications'),
    logger   = require(__dirname+'/../../logger.js');

var pushover;
var socket;
var settings;

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
    logger.info("adapter pushover  connected to Homander");
    this.emit ("getAdapterSettings", process.env.adapterId, function (data) {
        settings = data;
        if (settings.user && settings.token) {
            pushover = new po_notif({
                user:  settings.user,
                token: settings.token
            });
        }
    });
});

socket.on('getAdapterId', function (callback) {
    if (callback) {
        callback (process.env.adapterId);
    }
});

socket.on('send', function (obj) {
    if (pushover) {
        var msg = {};
        msg.message   = obj.message;
        msg.title     = obj.title     || settings.title;
        msg.sound     = obj.sound     || settings.sound;
        msg.priority  = obj.priority  || settings.priority;
        msg.url       = obj.url       || settings.url;
        msg.url_title = obj.url_title || settings.url_title;
        msg.device    = obj.device    || settings.device;

        pushover.send( msg, function( err, result ) {
            if (err) {
                logger.error("adapter pushover error "+JSON.stringify(err));
                return false;
            } else {
                return true;
            }
        });
    }
    else {
        logger.error('adapter pushover has invalid settings: user "'+settings.user+'", token "'+settings.token+'"');
    }
});

socket.on('disconnect', function () {
    logger.info('adapter pushover  disconnected from Homander');
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