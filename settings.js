var fs     = require('fs'),
    logger = require(__dirname+'/logger.js');

var settings = {};
settings.adapters = [];

try {
    var settingsJson = fs.readFileSync(__dirname+"/datastore/settings.json");
    settings = JSON.parse(settingsJson.toString());
    logger.verbose("ioBroker      settings found");
    if (!settings.uid) {
        logger.verbose("ioBroker      creating uid");
        settings.uid = Math.floor((Math.random()*4294967296)).toString(16)+Math.floor((Math.random()*4294967296)).toString(16)+Math.floor((Math.random()*4294967296)).toString(16)+Math.floor((Math.random()*4294967296)).toString(16);
        fs.writeFileSync(__dirname+"/datastore/settings.json", JSON.stringify(settings));
    }
} catch (e) {
    logger.info("ioBroker      creating datastore/settings.json");
    var settingsJson = fs.readFileSync(__dirname+"/settings-dist.json");
    settings = JSON.parse(settingsJson.toString());
    settings.unconfigured = true;
    logger.verbose("ioBroker      creating uid");
    settings.uid = Math.floor((Math.random()*4294967296)).toString(16)+Math.floor((Math.random()*4294967296)).toString(16)+Math.floor((Math.random()*4294967296)).toString(16)+Math.floor((Math.random()*4294967296)).toString(16);
    fs.writeFileSync(__dirname+"/datastore/settings.json", JSON.stringify(settings));
}

settings.updateSelfRunning = false;

if (!settings.httpEnabled) {
    delete settings.ioListenPort;
}
if (!settings.httpsEnabled) {
    delete settings.ioListenPortSsl;
}


/*
// Find Adapters
var adapters = fs.readdirSync(__dirname+"/adapter");

for (var i = 0; i < adapters.length; i++) {
    if (adapters[i] == ".DS_Store" || adapters[i].match(/^skeleton/)) {
        continue;
    }

    var adapterSettings = {},
        settingsJson;

    try {
        settingsJson = fs.readFileSync(__dirname+"/datastore/adapter-"+adapters[i]+".json");
        adapterSettings = JSON.parse(settingsJson.toString());
        logger.verbose("ioBroker      settings.json found for "+adapters[i]);

    } catch (e) {
        try {
            settingsJson = fs.readFileSync(__dirname+"/adapter/"+adapters[i]+"/settings.json");
            var adapterSettings = JSON.parse(settingsJson.toString());
            fs.writeFileSync(__dirname+"/datastore/adapter-"+adapters[i]+".json", JSON.stringify(adapterSettings));
            logger.info("ioBroker      creating datastore/adapter-"+adapters[i]+".json");
        } catch (ee) {
            logger.error("ioBroker      no settings.json found for "+adapters[i]);
        }
    }
    settings.adapters[adapters[i]] = adapterSettings;
}
*/


//console.log(JSON.stringify(settings, null, " "));

module.exports = settings;

