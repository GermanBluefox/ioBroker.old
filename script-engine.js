/**
 *      Homander Script Engine
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

var cAdapterMask  = 0xFFF;
var cAdapterShift = 20; // Bits
var cObjectsMask  = 0xFFFFF;

var cAdapterId    = 0;
var cObjectId     = 1;
var cCombyId      = 2;

// Constants of object types
var cObjTypeDevice  = 1;
var cObjTypeChannel = 2;
var cObjTypePoint   = 3;

var dataObjects = [],// Object tree
    dataIndex   = {},// Values of the objects
    dataValues  = [];// Mapping

var fs =        require('fs'),
    request =   require("request"),
    wol =       require('wake_on_lan');

var scriptEngine = {
    util:           require('util'),
    settings:       require(__dirname+'/settings.js'),
    logger:         require(__dirname+'/logger.js'),
    io:             require('socket.io-client'),
    scheduler:      require('node-schedule'),
    suncalc:        require('suncalc'),
    fs:             fs,
    socket: {},
    subscribers: [],
    schedules: [],
    poSettings: {},
    emailTransport: {},

    init: function () {
        var that = this;
        if (that.settings.ioListenPort) {
            that.socket = that.io.connect("127.0.0.1", {
                port: that.settings.ioListenPort
            });
        } else if (settings.ioListenPortSsl) {
            that.socket = that.io.connect("127.0.0.1", {
                port: that.settings.ioListenPortSsl,
                secure: true
            });
        } else {
            process.exit();
        }
        
        that.socket.on('connect', function () {
            that.logger.info("script-engine connected to Homander");
        });

        that.socket.on('getAdapterId', function (callback) {
            if (callback) {
                callback (1/*cSriptId*/);
            }
        });

        that.socket.on('disconnect', function () {
            that.logger.info("script-engine disconnected from Homander");
        });

        // Fetch Data
        that.socket.emit('getIndex', function(index) {
            that.logger.info("script-engine fetched dataIndex")
            dataIndex = index;
            that.socket.emit('getObjects', function(objects) {
                that.logger.info("script-engine fetched dataObjects")
                dataObjects = objects;
                that.socket.emit('getPointValues', function(dps) {
                    that.logger.info("script-engine fetched dataValues")
                    dataValues = dps;
                    that.initEventHandler();
                    that.startEngine();
                });
            });
        });

        // Pushover Adapter
        if (scriptEngine.settings.adapters.pushover && scriptEngine.settings.adapters.pushover.enabled) {
            var pushover   = require( 'pushover-notifications');

            scriptEngine.poSettings = scriptEngine.settings.adapters.pushover.settings;

            scriptEngine.pushover = new pushover( {
                user: scriptEngine.poSettings.user,
                token: scriptEngine.poSettings.token
            });
        }

        // Email Adapter
        if (scriptEngine.settings.adapters.email && scriptEngine.settings.adapters.email.enabled) {
            var nodemailer = require("nodemailer");
            scriptEngine.emailTransport = nodemailer.createTransport(scriptEngine.settings.adapters.email.settings.transport,
                scriptEngine.settings.adapters.email.settings.transportOptions
            );
        }

    },
    initEventHandler: function () {
        var that = this;
        that.socket.on('event', function (combyId, value) {
            if (!combyId) { return; }
            var id = [combyId >> cAdapterShift, combyId & cObjectsMask, combyId];

            var name,
                parent,
                channelName,
                deviceName,
                channelType,
                deviceType,
                adapterId,
                adapterType,
                roles     = [],
                locations = [];

            if (dataObjects[id[0/*cAdapterId*/]] && dataObjects[id[0/*cAdapterId*/]][id[1]]) {
                adapterId = id[0/*cAdapterId*/];
                adapterType = dataIndex.adapterInfo[adapterId].type;
                name    = dataObjects[id[0/*cAdapterId*/]][id[1]].name;
                parent  = dataObjects[id[0/*cAdapterId*/]][id[1]].parent;
                adapter = dataIndex.adapter[id[0/*cAdapterId*/]];
            }

            if (parent && dataObjects[id[0/*cAdapterId*/]][parent]) {
                if (dataObjects[id[0/*cAdapterId*/]][parent].type == cObjTypeChannel) {
                    channelName = dataObjects[id[0/*cAdapterId*/]][parent].name;
                    channelType = dataObjects[id[0/*cAdapterId*/]][parent].specType;

                    var device = dataObjects[id[0/*cAdapterId*/]][parent].parent;
                    if (device) {
                        deviceName = (dataObjects[id[0/*cAdapterId*/]][device] ? dataObjects[id[0]][device].name     : undefined);
                        deviceType = (dataObjects[id[0/*cAdapterId*/]][device] ? dataObjects[id[0]][device].specType : undefined);
                    }
                }
                else
                if (dataObjects[parent].type == cObjTypeDevice) {
                    // Device
                    var device = dataObjects[id[0/*cAdapterId*/]][parent].parent;
                    if (device) {
                        deviceName = (dataObjects[id[0/*cAdapterId*/]][device] ? dataObjects[id[0/*cAdapterId*/]][device].name     : undefined);
                        deviceType = (dataObjects[id[0/*cAdapterId*/]][device] ? dataObjects[id[0/*cAdapterId*/]][device].specType : undefined);
                    }
                }
                var ii = id[1];
                // Find locations
                while (ii) {
                    if (dataObjects[id[0/*cAdapterId*/]][ii].location) {
                        if (typeof dataObjects[id[0/*cAdapterId*/]][ii].location == "array") {
                            for (var k = 0, len = dataObjects[id[0/*cAdapterId*/]][ii].location.length; k < len; k++) {
                                if (dataObjects[id[0/*cAdapterId*/]][ii].location[k]) {
                                    locations.push (dataObjects[id[0/*cAdapterId*/]][ii].location[k]);
                                }
                            }
                        }
                        else
                            locations.push (dataObjects[id[0]][ii].location);
                        break;
                    }
                    ii = dataObjects[id[0/*cAdapterId*/]][ii].parent;
                }
                // Fund roles
                ii = id[1];
                while (ii) {
                    if (dataObjects[id[0/*cAdapterId*/]][ii].role) {
                        if (typeof dataObjects[id[0/*cAdapterId*/]][ii].role == "array") {
                            for (var k = 0, len = dataObjects[id[0/*cAdapterId*/]][ii].role.length; k < len; k++) {
                                if (dataObjects[id[0/*cAdapterId*/]][ii].role[k]) {
                                    roles.push (dataObjects[id[0/*cAdapterId*/]][ii].role[k]);
                                }
                            }
                        }
                        else
                            roles.push (dataObjects[id[0/*cAdapterId*/]][ii].role);
                        break;
                    }
                    ii = dataObjects[id[0]][ii].parent;
                }
            }
            else {
                log("script-engine error: parent " + parent + " of " + dataObjects[id[0/*cAdapterId*/]][id[1]].name + "does not exist");
                parent = null;
            }


            var oldObj = dataValues[id[0]][id[1]];

            if (!oldObj) { oldObj = []; }

            dataValues[id[0/*cAdapterId*/]][id[1]] = value;

            var eventObj = {
                adapterId:   adapterId,
                adapterType: adapterType,
                id:        id[1/*cObjectId*/],
                name:      name,
                newState:  value,
                oldState:  oldObj,
                roles:     roles,
                locations: locations,
                channel: {
                    id:    parent,
                    name:  channelName,
                    type:  channelType
                },
                device: {
                    id:    device,
                    name:  deviceName,
                    type:  deviceType
                },
                adapter: adapter
            };


            var length = that.subscribers.length;

            // Go through all subscripbers
            for (var i = 0; i < length; i++) {
                if (that.patternMatching(eventObj, that.subscribers[i].pattern)) {
                    that.subscribers[i].callback(eventObj);
                }

            }

        });
    },
    patternMatching: function (event, pattern) {
        if (!pattern.logic) {
            pattern.logic = "and";
        }

        var matched = false;

        // Datapoint id matching
        if (pattern.id && pattern.id == event.id) {
            //console.log("matched id!");
            if (pattern.logic == "or") { return true; }
            matched = true;
        } else if (pattern.id) {
            if (pattern.logic == "and") { return false; }
        }

        if (pattern.adapterId && pattern.adapterId == event.adapterId) {
            //console.log("matched id!");
            if (pattern.logic == "or") { return true; }
            matched = true;
        } else if (pattern.id) {
            if (pattern.logic == "and") { return false; }
        }
        // change matching
        if (pattern.change) {
            switch (pattern.change) {
                case "eq":
                    if (event.newState.value == event.oldState.value) {
                        if (pattern.logic == "or") { return true; }
                        matched = true;
                    } else {
                        if (pattern.logic == "and") { return false; }
                    }
                    break;
                case "ne":
                    if (event.newState.value != event.oldState.value) {
                        if (pattern.logic == "or") { return true; }
                        matched = true;
                    } else {
                        if (pattern.logic == "and") { return false; }
                    }
                    break;

                case "gt":
                    if (event.newState.value > event.oldState.value) {
                        if (pattern.logic == "or") { return true; }
                        matched = true;
                    } else {
                        if (pattern.logic == "and") { return false; }
                    }
                    break;
                case "ge":
                    if (event.newState.value >= event.oldState.value) {
                        if (pattern.logic == "or") { return true; }
                        matched = true;
                    } else {
                        if (pattern.logic == "and") { return false; }
                    }
                    break;
                case "lt":
                    if (event.newState.value < event.oldState.value) {
                        if (pattern.logic == "or") { return true; }
                        matched = true;
                    } else {
                        if (pattern.logic == "and") { return false; }
                    }
                    break;
                case "le":
                    if (event.newState.value <= event.oldState.value) {
                        if (pattern.logic == "or") { return true; }
                        matched = true;
                    } else {
                        if (pattern.logic == "and") { return false; }
                    }
                    break;
            }
        }

        // Value Matching
        if (pattern.val !== undefined && pattern.val == event.newState.value) {
            if (pattern.logic == "or") { return true; }
            matched = true;
        } else if (pattern.val !== undefined) {
            if (pattern.logic == "and") { return false; }
        }
        if (pattern.valGt !== undefined && event.newState.value > pattern.valGt) {
            if (pattern.logic == "or") { return true; }
            matched = true;
        } else if (pattern.valGt !== undefined) {
            if (pattern.logic == "and") { return false; }
        }
        if (pattern.valGe !== undefined && event.newState.value >= pattern.valGe) {
            if (pattern.logic == "or") { return true; }
            matched = true;
        } else if (pattern.valGe !== undefined) {
            if (pattern.logic == "and") { return false; }
        }
        if (pattern.valLt !== undefined && event.newState.value < pattern.valLt) {
            if (pattern.logic == "or") { return true; }
            matched = true;
        } else if (pattern.valLt !== undefined) {
            if (pattern.logic == "and") { return false; }
        }
        if (pattern.valLe !== undefined && event.newState.value <= pattern.valLe) {
            if (pattern.logic == "or") { return true; }
            matched = true;
        } else if (pattern.valLe !== undefined) {
            if (pattern.logic == "and") { return false; }
        }
        if (pattern.valNe !== undefined && event.newState.value != pattern.valNe) {
            if (pattern.logic == "or") { return true; }
            matched = true;
        } else if (pattern.valNe !== undefined) {
            if (pattern.logic == "and") { return false; }
        }

        // Old-Value matching
        if (pattern.oldVal !== undefined && pattern.oldVal == event.oldState.value) {
            if (pattern.logic == "or") { return true; }
            matched = true;
        } else if (pattern.oldVal !== undefined) {
            if (pattern.logic == "and") { return false; }
        }
        if (pattern.oldValGt !== undefined && event.oldState.value > pattern.oldValGt) {
            if (pattern.logic == "or") { return true; }
            matched = true;
        } else if (pattern.oldValGt !== undefined) {
            if (pattern.logic == "and") { return false; }
        }
        if (pattern.oldValGe !== undefined && event.oldState.value >= pattern.oldValGe) {
            if (pattern.logic == "or") { return true; }
            matched = true;
        } else if (pattern.oldValGe !== undefined) {
            if (pattern.logic == "and") { return false; }
        }
        if (pattern.oldValLt !== undefined && event.oldState.value < pattern.oldValLt) {
            if (pattern.logic == "or") { return true; }
            matched = true;
        } else if (pattern.oldValLt !== undefined) {
            if (pattern.logic == "and") { return false; }
        }
        if (pattern.oldValLe !== undefined && event.oldState.value <= pattern.oldValLe) {
            if (pattern.logic == "or") { return true; }
            matched = true;
        } else if (pattern.oldValLe !== undefined) {
            if (pattern.logic == "and") { return false; }
        }
        if (pattern.oldValNe !== undefined && event.oldState.value != pattern.oldValNe) {
            if (pattern.logic == "or") { return true; }
            matched = true;
        } else if (pattern.oldValNe !== undefined) {
            if (pattern.logic == "and") { return false; }
        }

        // newState.timestamp matching
        if (pattern.ts && pattern.ts == event.newState.timestamp) {
            if (pattern.logic == "or") { return true; }
            matched = true;
        } else if (pattern.ts) {
            if (pattern.logic == "and") { return false; }
        }
        if (pattern.tsGt && event.newState.timestamp > pattern.tsGt) {
            if (pattern.logic == "or") { return true; }
            matched = true;
        } else if (pattern.tsGt) {
            if (pattern.logic == "and") { return false; }
        }
        if (pattern.tsGe && event.newState.timestamp >= pattern.tsGe) {
            if (pattern.logic == "or") { return true; }
            matched = true;
        } else if (pattern.tsGe) {
            if (pattern.logic == "and") { return false; }
        }
        if (pattern.tsLt && event.newState.timestamp < pattern.tsLt) {
            if (pattern.logic == "or") { return true; }
            matched = true;
        } else if (pattern.tsLt) {
            if (pattern.logic == "and") { return false; }
        }
        if (pattern.tsLe && event.newState.timestamp <= pattern.tsLe) {
            if (pattern.logic == "or") { return true; }
            matched = true;
        } else if (pattern.tsLe) {
            if (pattern.logic == "and") { return false; }
        }

        // oldState.timestamp matching
        if (pattern.oldTs && pattern.oldTs == event.oldState.timestamp) {
            if (pattern.logic == "or") { return true; }
            matched = true;
        } else if (pattern.oldTs) {
            if (pattern.logic == "and") { return false; }
        }
        if (pattern.oldTsGt && event.oldState.timestamp > pattern.oldTsGt) {
            if (pattern.logic == "or") { return true; }
            matched = true;
        } else if (pattern.oldTsGt) {
            if (pattern.logic == "and") { return false; }
        }
        if (pattern.oldTsGe && event.oldState.timestamp >= pattern.oldTsGe) {
            if (pattern.logic == "or") { return true; }
            matched = true;
        } else if (pattern.oldTsGe) {
            if (pattern.logic == "and") { return false; }
        }
        if (pattern.oldTsLt && event.oldState.timestamp < pattern.oldTsLt) {
            if (pattern.logic == "or") { return true; }
            matched = true;
        } else if (pattern.oldTsLt) {
            if (pattern.logic == "and") { return false; }
        }
        if (pattern.oldTsLe && event.oldState.timestamp <= pattern.oldTsLe) {
            if (pattern.logic == "or") { return true; }
            matched = true;
        } else if (pattern.oldTsLe) {
            if (pattern.logic == "and") { return false; }
        }


        // newState.lastchange matching
        if (pattern.lc && pattern.lc == event.newState.lastchange) {
            if (pattern.logic == "or") { return true; }
            matched = true;
        } else if (pattern.lc) {
            if (pattern.logic == "and") { return false; }
        }
        if (pattern.lcGt && event.newState.lastchange > pattern.lcGt) {
            if (pattern.logic == "or") { return true; }
            matched = true;
        } else if (pattern.lcGt) {
            if (pattern.logic == "and") { return false; }
        }
        if (pattern.lcGe && event.newState.lastchange >= pattern.lcGe) {
            if (pattern.logic == "or") { return true; }
            matched = true;
        } else if (pattern.lcGe) {
            if (pattern.logic == "and") { return false; }
        }
        if (pattern.lcLt && event.newState.lastchange < pattern.lcLt) {
            if (pattern.logic == "or") { return true; }
            matched = true;
        } else if (pattern.lcLt) {
            if (pattern.logic == "and") { return false; }
        }
        if (pattern.lcLe && event.newState.lastchange <= pattern.lcLe) {
            if (pattern.logic == "or") { return true; }
            matched = true;
        } else if (pattern.lcLe) {
            if (pattern.logic == "and") { return false; }
        }

        // oldState.lastchange matching
        if (pattern.oldLc && pattern.oldLc == event.oldState.lastchange) {
            if (pattern.logic == "or") { return true; }
            matched = true;
        } else if (pattern.oldLc) {
            if (pattern.logic == "and") { return false; }
        }
        if (pattern.oldLcGt && event.oldState.lastchange > pattern.oldLcGt) {
            if (pattern.logic == "or") { return true; }
            matched = true;
        } else if (pattern.oldLcGt) {
            if (pattern.logic == "and") { return false; }
        }
        if (pattern.oldLcGe && event.oldState.lastchange >= pattern.oldLcGe) {
            if (pattern.logic == "or") { return true; }
            matched = true;
        } else if (pattern.oldLcGe) {
            if (pattern.logic == "and") { return false; }
        }
        if (pattern.oldLcLt && event.oldState.lastchange < pattern.oldLcLt) {
            if (pattern.logic == "or") { return true; }
            matched = true;
        } else if (pattern.oldLcLt) {
            if (pattern.logic == "and") { return false; }
        }
        if (pattern.oldLcLe && event.oldState.lastchange <= pattern.oldLcLe) {
            if (pattern.logic == "or") { return true; }
            matched = true;
        } else if (pattern.oldLcLe) {
            if (pattern.logic == "and") { return false; }
        }

        // Datapoint Name matching
        if (pattern.name) {
            if (pattern.name instanceof RegExp) {
                if (event.name && event.name.match(pattern.name)) {
                    if (pattern.logic == "or") { return true; }
                    matched = true;
                } else {
                    if (pattern.logic == "and") { return false; }
                }
            } else {
                if (event.name && pattern.name == event.name) {
                    if (pattern.logic == "or") { return true; }
                    matched = true;
                } else {
                    if (pattern.logic == "and") { return false; }
                }
            }
        }

        // Room id/name matching
        if (pattern.location) {
            if (pattern.location instanceof RegExp) {
                var submatch = false;
                for (var j = 0; j < event.channel.locations.length; j++) {
                    if (event.channel.locations[j].match(pattern.location)) {
                        submatch = true;
                        break;
                    }
                }
                if (submatch) {
                    if (pattern.logic == "or") {
                        return true;
                    }
                    matched = true;
                } else {
                    if (pattern.logic == "and") { return false; }
                }
            } else if (typeof pattern.location == "number") {
                if (event.locations.indexOf(pattern.location) != -1) {
                    if (pattern.logic == "or") { return true; }
                    matched = true;
                } else {
                    if (pattern.logic == "and") { return false; }
                }
            } else {
                if (event.locations.indexOf(pattern.location) != -1) {
                    if (pattern.logic == "or") { return true; }
                    matched = true;
                } else {
                    if (pattern.logic == "and") { return false; }
                }
            }
        }

        // function (Gewerk) id/name matching
        if (pattern.role) {
            if (pattern.role instanceof RegExp) {
                var submatch = false;
                for (var j = 0; j < event.channel.roles.length; j++) {
                    if (event.channel.roles[j].match(pattern.role)) {
                        submatch = true;
                        break;
                    }
                }
                if (submatch) {
                    if (pattern.logic == "or") {
                        return true;
                    }
                    matched = true;
                } else {
                    if (pattern.logic == "and") { return false; }
                }
            } else if (typeof pattern.role == "number") {
                if (event.role.indexOf(pattern.role) != -1) {
                    if (pattern.logic == "or") { return true; }
                    matched = true;
                } else {
                    if (pattern.logic == "and") { return false; }
                }
            } else {
                if (event.channel.roles.indexOf(pattern.role) != -1) {
                    if (pattern.logic == "or") { return true; }
                    matched = true;
                } else {
                    if (pattern.logic == "and") { return false; }
                }
            }

        }

        // channel id/name matching
        if (pattern.channel) {
            if (pattern.channel instanceof RegExp) {
                if (event.channel.name && event.channel.name.match(pattern.channel)) {
                    if (pattern.logic == "or") { return true; }
                    matched = true;
                } else {
                    if (pattern.logic == "and") { return false; }
                }
            } else if (typeof pattern.channel == "number") {
                if (event.channel.id && event.channel.id == pattern.channel) {
                    if (pattern.logic == "or") { return true; }
                    matched = true;
                } else {
                    if (pattern.logic == "and") { return false; }
                }
            } else {
                if (event.channel.name && event.channel.name == pattern.channel) {
                    if (pattern.logic == "or") { return true; }
                    matched = true;
                } else {
                    if (pattern.logic == "and") { return false; }
                }
            }
        }

        // channelType (HssType) matching
        if (pattern.channelType) {
            if (pattern.channelType instanceof RegExp) {
                if (event.channel.type && event.channel.type.match(pattern.channelType)) {
                    if (pattern.logic == "or") { return true; }
                    matched = true;
                } else {
                    if (pattern.logic == "and") { return false; }
                }
            } else {
                if (event.channel.type && pattern.channelType == event.channel.type) {
                    if (pattern.logic == "or") { return true; }
                    matched = true;
                } else {
                    if (pattern.logic == "and") { return false; }
                }
            }
        }

        // device id/name matching
        if (pattern.device) {
            if (pattern.device instanceof RegExp) {
                if (event.device.name && event.device.name.match(pattern.device)) {
                    if (pattern.logic == "or") { return true; }
                    matched = true;
                } else {
                    if (pattern.logic == "and") { return false; }
                }
            } else if (typeof pattern.device == "number") {
                if (event.device.id && event.device.id == pattern.device) {
                    if (pattern.logic == "or") { return true; }
                    matched = true;
                } else {
                    if (pattern.logic == "and") { return false; }
                }
            } else {
                if (event.device.name && event.device.name == pattern.device) {
                    if (pattern.logic == "or") { return true; }
                    matched = true;
                } else {
                    if (pattern.logic == "and") { return false; }
                }
            }
        }

        // device type (HssType) matching
        if (pattern.deviceType) {
            if (pattern.deviceType instanceof RegExp) {
                if (event.device.type && event.device.type.match(pattern.deviceType)) {
                    if (pattern.logic == "or") { return true; }
                    matched = true;
                } else {
                    if (pattern.logic == "and") { return false; }
                }
            } else {
                if (event.device.type && pattern.deviceType == event.device.type) {
                    if (pattern.logic == "or") { return true; }
                    matched = true;
                } else {
                    if (pattern.logic == "and") { return false; }
                }
            }
        }

        return matched;

    },
    startEngine: function () {
        var that = this;
        that.logger.info("script-engine starting");
        that.fs.readdir(__dirname+"/scripts", function (err, data) {
            data.sort();
            for (var i = 0; i < data.length; i++) {
                if (data[i] == "global.js") { continue; }
                if (!data[i].match(/js$/)) { continue; }
                var path = __dirname+"/scripts/"+data[i];
                runScript(path);
            }
        });
    },
    stop: function () {
        scriptEngine.logger.info("script-engine terminating");
        setTimeout(function () {
            process.exit();
        }, 250);
    }
}

function runScript(path) {
    scriptEngine.logger.info("script-engine loading "+path);
    var script = scriptEngine.fs.readFileSync(path);
    // Todo use vm.runInContext
    //var context = scriptEngine.vm.createContext(global);
    //scriptEngine.vm.runInContext(script, context, path);
    //scriptEngine.vm.runInThisContext(script, path);

    var subLength = scriptEngine.subscribers.length;
    var schLength = scriptEngine.schedules.length;
    try {
        eval(script.toString());
        scriptEngine.logger.info("script-engine registered "+(scriptEngine.subscribers.length-subLength)+" subscribers and "+(scriptEngine.schedules.length-schLength)+" schedules in "+path);
    } catch (e) {
        scriptEngine.logger.error("script-engine "+path+" "+e);
    }

}

// Global Stuff for use in Scripts
function log(msg) {
    scriptEngine.logger.info("script        "+msg);
}

function subscribe(pattern, callback) {
    scriptEngine.subscribers.push({
        pattern: pattern,
        callback: callback
    });
}

function schedule(pattern, callback) {
    var sch;
    if (pattern.astro) {
        var date = new Date();
        var ts = scriptEngine.suncalc.getTimes(date, scriptEngine.settings.latitude, scriptEngine.settings.longitude)[pattern.astro];

        if (pattern.shift) {
            ts = new Date(ts.getTime() + (pattern.shift * 60000));
        }

        if (ts < date) {
            date = new Date(date.getTime() + 86400000);
            ts = scriptEngine.suncalc.getTimes(date, scriptEngine.settings.latitude, scriptEngine.settings.longitude)[pattern.astro];
            if (pattern.shift) {
                ts = new Date(ts.getTime() + (pattern.shift * 60000));
            }

        }

        sch = scriptEngine.scheduler.scheduleJob(ts, function () {
            setTimeout(function () {
                sch = schedule(pattern, callback);
            }, 1000);
            callback();
        });

        scriptEngine.schedules.push(sch);
        return sch;
    } else {
        sch = scriptEngine.scheduler.scheduleJob(pattern, callback);
        scriptEngine.schedules.push(sch);
        return sch;
    }
}

function setState (adapterId, id, val, callback) {
    scriptEngine.socket.emit("setAnyPointValue", [adapterId, id, val], function () {
        if (callback) {
            callback();
        }
    });
}

function getState (adapterId, id, dpType) {
    var dp = dataValues[adapterId][findDatapoint(adapterId, id, dpType)];
    if (dp) {
        return dp.val;
    } else {
        return null;
    }
}

function getTimestamp(adapterId, id) {
    return dataValues[adapterId][id].ts;
}

function executeProgram(id, callback) {
    scriptEngine.socket.emit("executeProgram", id, function () {
        if (callback) {
            callback();
        }
    });
}

function execCmd(cmd, callback) {
    scriptEngine.socket.emit("execCmd", function(err, stdout, stdin) {
        if (callback) {
            callback(err, stdout, stdin);
        }
    })
}

function alarmReceipt(adapterId, id) {
    scriptEngine.socket.emit("cmdToAdapter", adapterId, "alarmReceipt", id);
}

function setObject(id, obj, callback) {
    scriptEngine.socket.emit("addObject", id, obj, function () {
        if (callback) {
            callback();
        }
    });
}
// read directory (root is www)
function readdir(path, callback) {
    scriptEngine.socket.emit("readdir", ["www" + ((!path) ? "" : "/" + path)], function (data) {
        if (callback) {
            callback(data);
        }
    });
}

function pushover(obj) {
    if (scriptEngine.settings.adapters.pushover && scriptEngine.settings.adapters.pushover.enabled) {
        var msg = {};
        msg.message = obj.message || scriptEngine.poSettings.message;
        msg.title = obj.title || scriptEngine.poSettings.title;
        msg.sound = obj.sound || scriptEngine.poSettings.sound;
        msg.priority = obj.priority || scriptEngine.poSettings.priority;
        msg.url = obj.url || scriptEngine.poSettings.url;
        msg.url_title = obj.url_title || scriptEngine.poSettings.url_title;
        msg.device = obj.device || scriptEngine.poSettings.device;
        scriptEngine.pushover.send( msg, function( err, result ) {
            if (err) {
                scriptEngine.logger.error("script-engine pushover error "+JSON.stringify(err));
                return false;
            } else {
                return true;
            }
        });
    } else {
        scriptEngine.logger.error("script-engine pushover adapter not enabled");
    }
}

function email(obj) {
    if (scriptEngine.settings.adapters.email && scriptEngine.settings.adapters.email.enabled) {

        var msg = {};
        msg.from = obj.from || scriptEngine.settings.adapters.email.settings.defaults.from;
        msg.to = obj.to || scriptEngine.settings.adapters.email.settings.defaults.to;
        msg.subject = obj.subject || scriptEngine.settings.adapters.email.settings.defaults.subject;
        msg.text = obj.text || scriptEngine.settings.adapters.email.settings.defaults.text;

        scriptEngine.emailTransport.sendMail(msg, function(error, response){
            if (error) {
                scriptEngine.logger.error("script-engine email error "+JSON.stringify(error))
            } else {
                scriptEngine.logger.info("script-engine email sent to "+msg.to);
            }
        });
    } else {
        scriptEngine.logger.error("script-engine email adapter not enabled");
    }
}

function findDatapoint (needle, hssdp) {
    if (dataValues[needle] === undefined) {
        if (dataIndex.Name[needle]) {
            // Get by Name
            needle = dataIndex.Name[needle][0];
            if (hssdp) {
                // Get by Name and Datapoint
                if (dataObjects[needle].DPs) {
                    return dataObjects[needle].DPs[hssdp];
                } else {
                    return false;
                }
            }
        } else if (dataIndex.Address[needle]) {
            needle = dataIndex.Address[needle][0];
            if (hssdp) {
                // Get by Channel-Address and Datapoint
                if (dataObjects[needle].DPs && dataObjects[needle].DPs[hssdp]) {
                    needle = dataObjects[needle].DPs[hssdp];
                }
            }
        } else if (needle.toString().match(/[a-zA-Z-]+\.[0-9A-Za-z-]+:[0-9]+\.[A-Z_]+/)) {
            // Get by full BidCos-Address
            addrArr = needle.split(".");
            if (dataIndex.Address[addrArr[1]]) {
                needle = dataObjects[dataIndex.Address[addrArr[1]]].DPs[addArr[2]];
            }
        } else {
            return false;
        }
    }
    return needle;
}

process.on('SIGINT', function () {
    scriptEngine.stop();
});

process.on('SIGTERM', function () {
    scriptEngine.stop();
});

try {
    var script = scriptEngine.fs.readFileSync(__dirname+"/scripts/global.js");
    scriptEngine.logger.info("script-engine executing global.js");
    eval(script.toString());
} catch (e) {
    scriptEngine.logger.warn("script-engine global.js: "+e);
}

scriptEngine.init();
