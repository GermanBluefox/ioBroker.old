/**
 *      Homander email Adapter
 *      11'2013-2014 hobbyquacker, bluefox
 *
 *      Version 0.1
 *
 *      To send pushover notification from user script:
 *
 *       toAdapter ('email', 'send', {
 *          from:    'sweethome@mail.com',
 *          to:      'test@mail.com',
 *          subject: 'Some subject',
 *          text:    'Email body',
 *       });
 *
 */


var nodemailer = require("nodemailer"),
    logger     = require(__dirname+'/../../logger.js');

var emailTransport;
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
        emailTransport = nodemailer.createTransport(settings.transport, settings.transportOptions);
    });
});

socket.on('getAdapterId', function (callback) {
    if (callback) {
        callback (process.env.adapterId);
    }
});

socket.on('send', function (obj) {
    if (emailTransport) {
        var msg = {};
        msg.from    = obj.from    || settings.defaults.from;
        msg.to      = obj.to      || settings.defaults.to;
        msg.subject = obj.subject || settings.defaults.subject;
        msg.text    = obj.text    || settings.defaults.text;

        emailTransport.sendMail(msg, function(error, response){
            if (error) {
                logger.error("adapter email    error "+JSON.stringify(error))
            } else {
                logger.info("adapter email    sent to "+msg.to);
            }
        });
    }
});

socket.on('disconnect', function () {
    logger.info("adapter pushover  disconnected from Homander");
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
