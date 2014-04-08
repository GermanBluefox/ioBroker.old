/**
 *      ioBroker Script Engine
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

var metaObjects = [],// Object tree
    metaIndex   = {},// Mapping
    dataValues  = [];// Values of the objects

var fs      = require('fs'),
    request = require("request"),
    wol     = require('wake_on_lan'),
    c       = require(__dirname+'/www/lib/js/sysConst.js');


var scriptEngine = {
    util:           require('util'),
    logger:         require(__dirname+'/logger.js'),
    io:             require('socket.io-client'),
    scheduler:      require('node-schedule'),
    suncalc:        require('suncalc'),
    fs:             fs,
    socket:         {},
    subscribers:    [],
    schedules:      [],

    init: function () {
        var that = this;

        // Connect to server
        if (process.env.serverPort) {
            that.socket = io.connect(process.env.serverIp || "127.0.0.1", {
                port:   process.env.serverPort  || 8081,
                secure: process.env.serverIsSec || false
            });
        } else {
            process.exit();
        }
        
        that.socket.on('connect', function () {
            that.logger.info("script-engine connected to ioBroker");
        });

        that.socket.on('getAdapterId', function (callback) {
            if (callback) {
                callback (process.env.adapterId);
            }
        });

        that.socket.on('disconnect', function () {
            that.logger.info("script-engine disconnected from ioBroker");
        });

        // Fetch Data
        that.socket.emit('getIndex', function(index) {
            that.logger.info("script-engine fetched metaIndex")
            metaIndex = index;

            that.socket.emit('getObjects', function(objects) {
                that.logger.info("script-engine fetched metaObjects")
                metaObjects = objects;

                that.socket.emit('getPointValues', function(dps) {
                    that.logger.info("script-engine fetched dataValues")
                    dataValues = dps;
                    that.initEventHandler();
                    that.startEngine();
                });
            });
        });
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

            if (metaObjects[id[0/*cAdapterId*/]] && metaObjects[id[0/*cAdapterId*/]][id[1]]) {
                adapterId = id[0/*cAdapterId*/];
                adapterType = metaIndex.adapterInfo[adapterId].type;
                name    = metaObjects[id[0/*cAdapterId*/]][id[1]].name;
                parent  = metaObjects[id[0/*cAdapterId*/]][id[1]].parent;
                adapter = metaIndex.adapter[id[0/*cAdapterId*/]];
            }

            if (parent && metaObjects[id[0/*cAdapterId*/]][parent]) {
                if (metaObjects[id[0/*cAdapterId*/]][parent].type == cObjTypeChannel) {
                    channelName = metaObjects[id[0/*cAdapterId*/]][parent].name;
                    channelType = metaObjects[id[0/*cAdapterId*/]][parent].specType;

                    var device = metaObjects[id[0/*cAdapterId*/]][parent].parent;
                    if (device) {
                        deviceName = (metaObjects[id[0/*cAdapterId*/]][device] ? metaObjects[id[0/*cAdapterId*/]][device].name     : undefined);
                        deviceType = (metaObjects[id[0/*cAdapterId*/]][device] ? metaObjects[id[0/*cAdapterId*/]][device].specType : undefined);
                    }
                }
                else
                if (metaObjects[parent].type == cObjTypeDevice) {
                    // Device
                    var device = metaObjects[id[0/*cAdapterId*/]][parent].parent;
                    if (device) {
                        deviceName = (metaObjects[id[0/*cAdapterId*/]][device] ? metaObjects[id[0/*cAdapterId*/]][device].name     : undefined);
                        deviceType = (metaObjects[id[0/*cAdapterId*/]][device] ? metaObjects[id[0/*cAdapterId*/]][device].specType : undefined);
                    }
                }
                var ii = id[1];
                // Find locations
                while (ii) {
                    if (metaObjects[id[0/*cAdapterId*/]][ii].location) {
                        if (typeof metaObjects[id[0/*cAdapterId*/]][ii].location == "array") {
                            for (var k = 0, len = metaObjects[id[0/*cAdapterId*/]][ii].location.length; k < len; k++) {
                                if (metaObjects[id[0/*cAdapterId*/]][ii].location[k]) {
                                    locations.push (metaObjects[id[0/*cAdapterId*/]][ii].location[k]);
                                }
                            }
                        }
                        else
                            locations.push (metaObjects[id[0]][ii].location);
                        break;
                    }
                    ii = metaObjects[id[0/*cAdapterId*/]][ii].parent;
                }
                // Fund roles
                ii = id[1];
                while (ii) {
                    if (metaObjects[id[0/*cAdapterId*/]][ii].role) {
                        if (typeof metaObjects[id[0/*cAdapterId*/]][ii].role == "array") {
                            for (var k = 0, len = metaObjects[id[0/*cAdapterId*/]][ii].role.length; k < len; k++) {
                                if (metaObjects[id[0/*cAdapterId*/]][ii].role[k]) {
                                    roles.push (metaObjects[id[0/*cAdapterId*/]][ii].role[k]);
                                }
                            }
                        }
                        else
                            roles.push (metaObjects[id[0/*cAdapterId*/]][ii].role);
                        break;
                    }
                    ii = metaObjects[id[0]][ii].parent;
                }
            }
            else {
                log("script-engine error: parent " + parent + " of " + metaObjects[id[0/*cAdapterId*/]][id[1]].name + "does not exist");
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

function getAdapterId (adapter) {
    var adapterId;
    if (typeof adapter == 'string' && adapter.length > 1) {
        if (adapter[0] >= '0' && adapter[0] <= '9') {
            adapterId = parseInt (adapter);
        } else {
            adapterId = metaIndex.adapter[adapter];
        }
    } else {
        adapterId = adapter;
    }
    return adapterId;
}

function setValue (adapter, id, val, ack, callback) {
    var adapterId = getAdapterId(adapter);
    if (adapterId) {
        scriptEngine.socket.emit("setPointValue", (adapterId << c.cAdapterShift | id), val, null, ack || false, function (obj) {
            if (callback) {
                callback(obj);
            }
        });
    }
}
// depricated
var setState = setValue;
function getValue (adapter, id, dpType) {
    var adapterId = getAdapterId(adapter);
    var dp = dataValues[adapterId][findDatapoint(adapterId, id, dpType)];
    if (dp) {
        return dp.val;
    } else {
        return null;
    }
}
// depricated
var getState = getValue;

function getTimestamp(adapterId, id) {
    return dataValues[adapterId][id].ts;
}
// depricated => use setValue ('ccu', id, true);
function executeProgram(id, callback) {
    setValue('ccu', id, true, false, callback);
}

function execCmd(cmd, callback) {
    scriptEngine.socket.emit("execCmd", function(err, stdout, stdin) {
        if (callback) {
            callback(err, stdout, stdin);
        }
    })
}

function toAdapter(cmd, arg, callback) {
    scriptEngine.socket.emit("toAdapter", cmd, arg, function(data) {
        if (callback) {
            callback(data);
        }
    });
}
// depricated => use setValue ('ccu', id, true);
function alarmReceipt (id) {
    setValue ('ccu', id, true);
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

// for backward compatibility
function pushover(obj) {
    toAdapter ('pushover', 'send', obj);
}

// for backward compatibility
function email(obj) {
    toAdapter('email', 'send', obj);
}

function findDatapoint (adapterId, needle, hssdp) {
    if (dataValues[adapterId][needle] === undefined) {
        if (metaIndex.name[adapterId][needle]) {
            // Get by Name
            needle = metaIndex.name[adapterId][needle];
            if (hssdp) {
                // Get by Name and Datapoint
                if (metaObjects[adapterId][needle].DPs) {
                    return metaObjects[adapterId][needle].DPs[hssdp];
                } else {
                    return false;
                }
            }
        } else if (metaIndex.address[adapterId][needle]) {
            needle = metaIndex.address[adapterId][needle][0];
            if (hssdp) {
                // Get by Channel-Address and Datapoint
                if (metaObjects[adapterId][needle].DPs && metaObjects[adapterId][needle].DPs[hssdp]) {
                    needle = metaObjects[adapterId][needle].DPs[hssdp];
                }
            }
        } else if (needle.toString().match(/[a-zA-Z-]+\.[0-9A-Za-z-]+:[0-9]+\.[A-Z_]+/)) {
            // Get by full BidCos-Address
            addrArr = needle.split(".");
            if (metaIndex.address[adapterId][addrArr[1]]) {
                needle = metaObjects[metaIndex.address[adapterId][addrArr[1]]].DPs[addArr[2]];
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
