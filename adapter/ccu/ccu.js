/**
 *      CCU Adapter
 *
 *      Socket.IO based HomeMatic Interface
 *
 *      Copyright (c) 2013 http://hobbyquaker.github.io
 *
 *      CC BY-NC 3.0
 *
 *      Kommerzielle Nutzung nicht gestattet!
 *
 */

// Keep WebStorm satisfied
if (typeof __dirname == "undefined") {
    var __dirname = "";
}

var c =         require(__dirname+'/../../www/lib/js/sysConst.js'),
    logger =    require(__dirname+'/../../logger.js'),
    binrpc =    require(__dirname+"/binrpc.js"),
    rega =      require(__dirname+"/rega.js"),
    request =   require('request'),
    io =        require('socket.io-client'),
    pollTimer,
    ccuReachable = false,
    ccuRegaUp    = false,
    initsDone    = false,
    lastEvents   = {},
    socket,
    stringTable  = null,
    settings = {},
    regahss = null;

var homematic,
    datapoints  = [],
    regaObjects = {},
    regaIndex   = {
        Name:           {},
        Address:        {},
        ENUM_ROOMS:     [],
        ENUM_FUNCTIONS: [],
        FAVORITE:       [],
        DEVICE:         [],
        CHANNEL:        [],
        HSSDP:          [],
        VARDP:          [],
        ALDP:           [],
        ALARMDP:        [],
        PROGRAM:        []
    },
    regaReady = false;
var ignoreNextUpdate = [];
var stats = {
    cuxd:  0,
    wired: 0,
    rf:    0
};

// Connect to server
// 4 arguments will be sent by server to adapter: serverPort, serverIsSec, serverIp and adapterId
logger.info ('ccu adapter  connecting to ioBroker');
socket = io.connect(process.env.serverIp || "127.0.0.1", {
    port:   process.env.serverPort  || 8081,
    secure: process.env.serverIsSec || false
});

/** @namespace settings.adapters.ccu */
function onConnect (socket) {
    logger.info("ccu adapter  connected to ioBroker");
    socket.emit ("getAdapterSettings", process.env.adapterId, function (data) {
        settings = data;
        if (!settings) {
            process.exit();
        }
        /** @namespace settings.regahss */
        /** @namespace settings.binrpc */
        /** @namespace settings.binrpc.checkEvents */
        /** @namespace settings.ccuIp */
        /** @namespace settings.stringTableLanguage */
        settings.regahss.metaScripts = [
            "favorites",
            "variables",
            "programs",
            "rooms",
            "functions",
            "devices",
            "channels",
            "datapoints",
            "alarms"
        ];

        settings.binrpc.inits = [];
        settings.stringTableLanguage = settings.stringTableLanguage || "de";

        ccuInit ();
    });
}

socket.on('connect', function () {
    onConnect(this);
});

socket.on('reconnect', function () {
    logger.info("ccu adapter   reconnect");
    socket.emit ("getAdapterSettings", process.env.adapterId, function (data) {
        settings = data;
        if (!settings) {
            process.exit();
        }
        // Send new data to ioBroker
        updateDataTree();
        updateDataPoints();

        regaReady = true;
        socket.emit("setStatus", "ccuRegaData", regaReady);

        if (rebuild) {
            logger.info("rega          data succesfully reloaded");
            socket.emit("reloadDataReady", process.env.adapterId);
        }
    });
});

socket.on('reloadData', function () {
    regaReady = false;
    socket.emit("setStatus", "ccuRegaData", regaReady);
    clearRegaData();
    loadRegaData(0, null, true);
});

socket.on('restartRPC', function () {
    initRpc();
});

socket.on('event', function (id, val) {
    // Execute only if ack == false
    if (val.ack) {
        return;
    }
    id = id & c.cObjectsMask;
    // If id is alarm
    // TODO if the detection of alarm valid
    if (regaObjects[id].TypeName == "ALARMDP") {
        logger.verbose("adapter CCU   alarmReceipt "+id+" "+regaObjects[id].Name);
        regahss.script("dom.GetObject("+id+").AlReceipt();");
        return;
    }
    if (regaObjects[id].TypeName == "PROGRAM") {
        programExecute (id);
        return;
    };

    // Bidcos or Rega?
    /*
     if (ctrlIndex.HSSDP.indexOf(id) != -1) {
     // Set State via xmlrpc_bin
     var name = ctrlObjects[id].Name;
     var parts = name.split(".");
     var iface = parts[0],
     port = homematic.ifacePorts[iface],
     channel = parts[1],
     dp = parts[2];
     // TODO BINRPC FLOAT....?
     homematic.request(port, "setValue", [channel, dp, val.toString()]);
     logger.info("BINRPC setValue "+channel+dp+" "+val);
     } else { */
    // Set State via ReGa
    var xval;
    if (typeof val == "string") {
        xval = "'" + val.replace(/'/g, '"') + "'";
    } else {
        xval = val;
    }
    var script = "Write(dom.GetObject("+id+").State("+xval+"));";

    regahss.script(script, function (data) {
        //logger.verbose("rega      <-- "+data);
        /*if (callback) {
         callback(data);
         }*/
    });

    //}

    // Bei Update von Thermostaten den nächsten Event von SET_TEMPERATURE und CONTROL_MODE ignorieren!
    if (regaObjects[id] && regaObjects[id].Name) {

        if (regaObjects[id].Name.match(/SET_TEMPERATURE$/) || regaObjects[id].Name.match(/MANU_MODE$/) || regaObjects[id].Name.match(/SETPOINT$/)) {
            var parent   = regaObjects[regaObjects[id].Parent];
            var setTemp  = parent.DPs["SET_TEMPERATURE"];
            var ctrlMode = parent.DPs["CONTROL_MODE"];
            if (ignoreNextUpdate.indexOf(setTemp) == -1) {
                ignoreNextUpdate.push(setTemp);
            }
            if (ignoreNextUpdate.indexOf(ctrlMode) == -1) {
                ignoreNextUpdate.push(ctrlMode);
            }
            logger.verbose("adapter CCU   ignoring next update for "+JSON.stringify(ignoreNextUpdate));
        }
    }
});

socket.on('runScript', function (script, callback) {
    logger.verbose("socket.io <-- script");
    regahss.script(script, function (data) {
        if (callback) {
            callback(data);
        }
    });
});

socket.on('getAdapterId', function (callback) {
    if (callback) {
        callback (process.env.adapterId);
    }
});

socket.on('disconnect', function () {
    logger.info("adapter CCU   disconnected from ioBroker");
});

function ccuInit () {
    if (settings.binrpc.rfdEnabled) {
        settings.binrpc.inits.push({id:settings.binrpc.rfdId, port:settings.binrpc.rfdPort});
    }
    if (settings.binrpc.hs485dEnabled) {
        settings.binrpc.inits.push({id:settings.binrpc.hs485dId, port:settings.binrpc.hs485dPort});
    }
    if (settings.binrpc.cuxdEnabled) {
        settings.binrpc.inits.push({id:settings.binrpc.cuxdId, port:settings.binrpc.cuxdPort});
    }
    if (settings.binrpc.checkEvents && settings.binrpc.checkEvents.enabled) {
        setInterval(function () {
            if (initsDone && ccuRegaUp) {
                var now = Math.floor((new Date()).getTime() / 1000);
                /** @namespace settings.binrpc.checkEvents.testAfter */
                var check = now - settings.binrpc.checkEvents.testAfter;
                /** @namespace settings.binrpc.checkEvents.reinitAfter */
                var reinit = now - settings.binrpc.checkEvents.reinitAfter;

                for (var i = 0; i < settings.binrpc.inits.length; i++) {
                    var init = settings.binrpc.inits[i];
                    if (lastEvents[init.id] < reinit) {

                        if (settings.binrpc.checkEvents.testTrigger[init.id]) {
                            logger.warn("binrpc    --> re-init "+init.id);

                            homematic.request(init.port, "init", ["xmlrpc_bin://"+settings.binrpc.listenIp+":"+settings.binrpc.listenPort,init.id], function(data, name) {
                                if (data === "") {
                                    logger.info("binrpc    <-- init on "+name+" successful");
                                    lastEvents[init.id] = Math.floor((new Date()).getTime() / 1000);
                                } else {
                                    logger.error("binrpc    <-- init on "+name+" failure");
                                }
                            });

                        } else {
                            logger.warn("binrpc        checkEvent.trigger undefined for "+init.id);
                        }

                    } else if (lastEvents[init.id] < check) {
                        logger.verbose("binrpc        checking init "+init.id);
                        if (settings.binrpc.checkEvents.testTrigger[init.id]) {
                            var id = regaIndex.Name[settings.binrpc.checkEvents.testTrigger[init.id]][0];
                            regahss.script("dom.GetObject("+id+").State(true);");
                        } else {
                            logger.warn("binrpc        checkEvent.trigger undefined for "+init.id);
                        }
                    } else {
                        logger.verbose("binrpc        init "+init.id+" ok - last event "+(now-lastEvents[init.id])+"s ago");
                    }
                }
            }

            updateStatus();

        }, (settings.binrpc.checkEvents.interval * 1000));
    }

    if (regahss) {
        regahss = null;
    } else {
        if (settings.stats) {
            setInterval(function () {
                socket.emit ("setStats", stats);
            }, settings.statsIntervalMinutes * 60000);
        }
    }

    regahss = new rega({
        ccuIp: settings.ccuIp,
        ready: function(err) {
            if (err == "ReGaHSS down") {
                logger.error("rega          ReGaHSS down");
                ccuReachable = true;
                ccuRegaUp    = false;
                socket.emit ("setStatus", {ccuReachable: ccuReachable, ccuRegaUp: ccuRegaUp});
                tryReconnect();
            } else if (err == "CCU unreachable") {
                logger.error("adapter CCU   CCU unreachable");
                ccuReachable = false;
                ccuRegaUp    = false;
                socket.emit ("setStatus", {ccuReachable: ccuReachable, ccuRegaUp: ccuRegaUp});
                tryReconnect();
            } else {
                logger.info("rega          ReGaHSS up");
                ccuReachable = true;
                ccuRegaUp    = true;

                regahss.loadStringTable(settings.stringTableLanguage, function (data) {
                    stringTable = data;
                    regahss.checkTime(loadRegaData);
                });

                socket.emit ("setStatus", {ccuReachable: ccuReachable, ccuRegaUp:ccuRegaUp});
            }
        }
    });

}

function updateStatus () {
    socket.emit("updateStatus");
}

function tryReconnect() {
    if (regahss && regahss.options && regahss.options.ccuIp) {
        logger.info("adapter CCU   trying to reconnect to CCU");
        request('http://'+regahss.options.ccuIp+'/ise/checkrega.cgi', function (error, response, body) {
            if (!error && response.statusCode == 200) {
                if (body == "OK") {
                    logger.info("adapter CCU   ReGaHSS up");
                    ccuReachable = true;
                    ccuRegaUp    = true;
                    socket.emit ("setStatus", {ccuReachable: ccuReachable, ccuRegaUp: ccuRegaUp});
                    reconnect();
                } else {
                    logger.error("adapter CCU   ReGaHSS down");
                    ccuRegaUp = false;
                    socket.emit ("setStatus", "ccuRegaUp", ccuRegaUp);
                    setTimeout(tryReconnect, 10000);
                }
            } else {
                logger.error("adapter CCU   CCU unreachable");
                ccuRegaUp    = false;
                ccuReachable = false;
                socket.emit ("setStatus", {ccuReachable: ccuReachable, ccuRegaUp: ccuRegaUp});
                setTimeout(tryReconnect, 10000);

            }
        });
    }

}

function reconnect() {

    regahss.loadStringTable(settings.stringTableLanguage, function (data) {
        socket.emit("setStringtable", data);
    });

    if (initsDone) {
        initsDone = false;
        homematic.stopInits();
    }

    regaReady = false;

    socket.emit("setStatus", {initsDone: initsDone, ccuRegaData: regaReady});
    clearRegaData();
    setTimeout(function () {
        regahss.checkTime(function () {
            loadRegaData(0, null, null, true);
        });
    }, 2500);
}

function formatTimestamp() {
    var timestamp = new Date();
    return timestamp.getFullYear() + '-' +
        ("0" + (timestamp.getMonth() + 1).toString(10)).slice(-2) + '-' +
        ("0" + (timestamp.getDate()).toString(10)).slice(-2) + ' ' +
        ("0" + (timestamp.getHours()).toString(10)).slice(-2) + ':' +
        ("0" + (timestamp.getMinutes()).toString(10)).slice(-2) + ':' +
        ("0" + (timestamp.getSeconds()).toString(10)).slice(-2);
}

function pollRega() {
    regahss.runScriptFile("polling", function (data) {
        if (!data) {
            ccuRegaUp = false;
            socket.emit ("setStatus", "ccuRegaUp", ccuRegaUp);
            tryReconnect();
            return false;
        }
        var _data = JSON.parse(data);
        var newDatapoints = [];
        var val;

        for (var id in _data) {
            if (typeof _data[id][0] == "string") {
                val = unescape(_data[id][0]);
            } else {
                val = _data[id][0];
            }

            // Hat sich die Anzahl der Servicemeldungen geändert?
            if (id == 41 && datapoints[41] && datapoints[41].val != val) {
                pollServiceMsgs();
            }
            newDatapoints[id] = {val: _data[id][0], ts: formatTimestamp(), ack: true, lc: _data[id][1]};
            datapoints[id] = newDatapoints[id];
        }

        if (newDatapoints.length > 0) {
            socket.emit ("setPointValues", newDatapoints);
        }
        pollTimer = setTimeout(pollRega, settings.regahss.pollDataInterval);
    });
}

function pollServiceMsgs() {
    logger.info("adapter CCU   polling service messages");
    regahss.runScriptFile("alarms", function (data) {
        if (!data) {
            ccuRegaUp = false;
            socket.emit ("setStatus", "ccuRegaUp", ccuRegaUp);
            tryReconnect();
            return false;
        }
        var data = JSON.parse(data);
        var newDatapoints = [];
        for (id in data) {
            var ts = Math.round((new Date()).getTime() / 1000);
            newDatapoints[id] = {val: data[id].AlState, ts: data[id].LastTriggerTime, ack: true, lc: data[id].AlOccurrenceTime};
            datapoints[id] = newDatapoints[id];
        }
        socket.emit ("setPointValues", newDatapoints);
    });
}

function getImage(type) {
    if (this.images == null) {
        this.deviceImgPath = 'img/devices/50/';
        // Devices -> Images
        this.images =  {
            'HM-LC-Dim1TPBU-FM': 'PushButton-2ch-wm_thumb.png',
            'HM-LC-Sw1PBU-FM':   'PushButton-2ch-wm_thumb.png',
            'HM-LC-Bl1PBU-FM':   'PushButton-2ch-wm_thumb.png',
            'HM-LC-Sw1-PB-FM':   'PushButton-2ch-wm_thumb.png',
            'HM-PB-2-WM':        'PushButton-2ch-wm_thumb.png',
            'HM-LC-Sw2-PB-FM':   'PushButton-4ch-wm_thumb.png',
            'HM-PB-4-WM':        'PushButton-4ch-wm_thumb.png',
            'HM-LC-Dim1L-Pl':    'OM55_DimmerSwitch_thumb.png',
            'HM-LC-Dim1T-Pl':    'OM55_DimmerSwitch_thumb.png',
            'HM-LC-Sw1-Pl':      'OM55_DimmerSwitch_thumb.png',
            'HM-LC-Dim1L-Pl-2':  'OM55_DimmerSwitch_thumb.png',
            'HM-LC-Sw1-Pl-OM54': 'OM55_DimmerSwitch_thumb.png',
            'HM-Sys-sRP-Pl':     'OM55_DimmerSwitch_thumb.png',
            'HM-LC-Dim1T-Pl-2':  'OM55_DimmerSwitch_thumb.png',
            'HM-LC-Sw1-Pl-2':    'OM55_DimmerSwitch_thumb.png',
            'HM-LC-Sw1-Ba-PCB':  '88_hm-lc-sw4-ba-pcb_thumb.png',
            'HM-Sen-RD-O':       '87_hm-sen-rd-o_thumb.png',
            'HM-RC-Sec4-2':      '86_hm-rc-sec4-2_thumb.png',
            'HM-PB-6-WM55':      '86_hm-pb-6-wm55_thumb.png',
            'HM-RC-Key4-2':      '85_hm-rc-key4-2_thumb.png',
            'HM-RC-4-2':         '84_hm-rc-4-2_thumb.png',
            'HM-CC-RT-DN':       '83_hm-cc-rt-dn_thumb.png',
            'HM-Sen-Wa-Od':      '82_hm-sen-wa-od_thumb.png',
            'HM-Sen-WA-OD':      '82_hm-sen-wa-od_thumb.png',
            'HM-Dis-TD-T':       '81_hm-dis-td-t_thumb.png',
            'HM-Sen-MDIR-O':     '80_hm-sen-mdir-o_thumb.png',
            'HM-OU-LED16':       '78_hm-ou-led16_thumb.png',
            'HM-LC-Sw1-Ba-PCB':  '77_hm-lc-sw1-ba-pcb_thumb.png',
            'HM-LC-Sw4-WM':      '76_hm-lc-sw4-wm_thumb.png',
            'HM-PB-2-WM55':      '75_hm-pb-2-wm55_thumb.png',
            'atent':             '73_hm-atent_thumb.png',
            'HM-RC-BRC-H':       '72_hm-rc-brc-h_thumb.png',
            'HMW-IO-12-Sw14-DR': '71_hmw-io-12-sw14-dr_thumb.png',
            'HM-PB-4Dis-WM':     '70_hm-pb-4dis-wm_thumb.png',
            'HM-LC-Sw2-DR':      '69_hm-lc-sw2-dr_thumb.png',
            'HM-LC-Sw4-DR':      '68_hm-lc-sw4-dr_thumb.png',
            'HM-SCI-3-FM':       '67_hm-sci-3-fm_thumb.png',
            'HM-LC-Dim1T-CV':    '66_hm-lc-dim1t-cv_thumb.png',
            'HM-LC-Dim1T-FM':    '65_hm-lc-dim1t-fm_thumb.png',
            'HM-LC-Dim2T-SM':    '64_hm-lc-dim2T-sm_thumb.png',
            'HM-LC-Bl1-pb-FM':   '61_hm-lc-bl1-pb-fm_thumb.png',
            'HM-LC-Bi1-pb-FM':   '61_hm-lc-bi1-pb-fm_thumb.png',
            'HM-OU-CF-Pl':       '60_hm-ou-cf-pl_thumb.png',
            'HM-OU-CFM-Pl':      '60_hm-ou-cf-pl_thumb.png',
            'HMW-IO-12-FM':      '59_hmw-io-12-fm_thumb.png',
            'HMW-Sen-SC-12-FM':  '58_hmw-sen-sc-12-fm_thumb.png',
            'HM-CC-SCD':         '57_hm-cc-scd_thumb.png',
            'HMW-Sen-SC-12-DR':  '56_hmw-sen-sc-12-dr_thumb.png',
            'HM-Sec-SFA-SM':     '55_hm-sec-sfa-sm_thumb.png',
            'HM-LC-ddc1':        '54a_lc-ddc1_thumb.png',
            'HM-LC-ddc1-PCB':    '54_hm-lc-ddc1-pcb_thumb.png',
            'HM-Sen-MDIR-SM':    '53_hm-sen-mdir-sm_thumb.png',
            'HM-Sec-SD-Team':    '52_hm-sec-sd-team_thumb.png',
            'HM-Sec-SD':         '51_hm-sec-sd_thumb.png',
            'HM-Sec-MDIR':       '50_hm-sec-mdir_thumb.png',
            'HM-Sec-WDS':        '49_hm-sec-wds_thumb.png',
            'HM-Sen-EP':         '48_hm-sen-ep_thumb.png',
            'HM-Sec-TiS':        '47_hm-sec-tis_thumb.png',
            'HM-LC-Sw4-PCB':     '46_hm-lc-sw4-pcb_thumb.png',
            'HM-LC-Dim2L-SM':    '45_hm-lc-dim2l-sm_thumb.png',
            'HM-EM-CCM':         '44_hm-em-ccm_thumb.png',
            'HM-CC-VD':          '43_hm-cc-vd_thumb.png',
            'HM-CC-TC':          '42_hm-cc-tc_thumb.png',
            'HM-Swi-3-FM':       '39_hm-swi-3-fm_thumb.png',
            'HM-PBI-4-FM':       '38_hm-pbi-4-fm_thumb.png',
            'HMW-Sys-PS7-DR':    '36_hmw-sys-ps7-dr_thumb.png',
            'HMW-Sys-TM-DR':     '35_hmw-sys-tm-dr_thumb.png',
            'HMW-Sys-TM':        '34_hmw-sys-tm_thumb.png',
            'HMW-Sec-TR-FM':     '33_hmw-sec-tr-fm_thumb.png',
            'HMW-WSTH-SM':       '32_hmw-wsth-sm_thumb.png',
            'HMW-WSE-SM':        '31_hmw-wse-sm_thumb.png',
            'HMW-IO-12-Sw7-DR':  '30_hmw-io-12-sw7-dr_thumb.png',
            'HMW-IO-4-FM':       '29_hmw-io-4-fm_thumb.png',
            'HMW-LC-Dim1L-DR':   '28_hmw-lc-dim1l-dr_thumb.png',
            'HMW-LC-Bl1-DR':     '27_hmw-lc-bl1-dr_thumb.png',
            'HMW-LC-Sw2-DR':     '26_hmw-lc-sw2-dr_thumb.png',
            'HM-EM-CMM':         '25_hm-em-cmm_thumb.png',
            'HM-CCU-1':          '24_hm-cen-3-1_thumb.png',
            'HM-RCV-50':         '24_hm-cen-3-1_thumb.png',
            'HMW-RCV-50':        '24_hm-cen-3-1_thumb.png',
            'HM-RC-Key3':        '23_hm-rc-key3-b_thumb.png',
            'HM-RC-Key3-B':      '23_hm-rc-key3-b_thumb.png',
            'HM-RC-Sec3':        '22_hm-rc-sec3-b_thumb.png',
            'HM-RC-Sec3-B':      '22_hm-rc-sec3-b_thumb.png',
            'HM-RC-P1':          '21_hm-rc-p1_thumb.png',
            'HM-RC-19':          '20_hm-rc-19_thumb.png',
            'HM-RC-19-B':        '20_hm-rc-19_thumb.png',
            'HM-RC-19-SW':       '20_hm-rc-19_thumb.png',
            'HM-RC-12':          '19_hm-rc-12_thumb.png',
            'HM-RC-12-B':        '19_hm-rc-12_thumb.png',
            'HM-RC-4':           '18_hm-rc-4_thumb.png',
            'HM-RC-4-B':         '18_hm-rc-4_thumb.png',
            'HM-Sec-RHS':        '17_hm-sec-rhs_thumb.png',
            'HM-Sec-SC':         '16_hm-sec-sc_thumb.png',
            'HM-Sec-Win':        '15_hm-sec-win_thumb.png',
            'HM-Sec-Key':        '14_hm-sec-key_thumb.png',
            'HM-Sec-Key-S':      '14_hm-sec-key_thumb.png',
            'HM-WS550STH-I':     '13_hm-ws550sth-i_thumb.png',
            'HM-WDS40-TH-I':     '13_hm-ws550sth-i_thumb.png',
            'HM-WS550-US':       '9_hm-ws550-us_thumb.png',
            'WS550':             '9_hm-ws550-us_thumb.png',
            'HM-WDC7000':        '9_hm-ws550-us_thumb.png',
            'HM-LC-Sw1-SM':      '8_hm-lc-sw1-sm_thumb.png',
            'HM-LC-Bl1-FM':      '7_hm-lc-bl1-fm_thumb.png',
            'HM-LC-Bl1-SM':      '6_hm-lc-bl1-sm_thumb.png',
            'HM-LC-Sw2-FM':      '5_hm-lc-sw2-fm_thumb.png',
            'HM-LC-Sw1-FM':      '4_hm-lc-sw1-fm_thumb.png',
            'HM-LC-Sw4-SM':      '3_hm-lc-sw4-sm_thumb.png',
            'HM-LC-Dim1L-CV':    '2_hm-lc-dim1l-cv_thumb.png',
            'HM-LC-Dim1PWM-CV':  '2_hm-lc-dim1l-cv_thumb.png',
            'HM-WS550ST-IO':     'IP65_G201_thumb.png',
            'HM-WDS30-T-O':      'IP65_G201_thumb.png',
            'HM-WDS100-C6-O':    'WeatherCombiSensor_thumb.png',
            'HM-WDS10-TH-O':     'TH_CS_thumb.png',
            'HM-WS550STH-O':     'TH_CS_thumb.png',
            'HM-WDS30-OT2-SM':   'IP65_G201_thumb.png',
            'SONOS_ROOT':        'sonos.png',
            'PING':              'pc.png',
            'Alarm':             'alarm.png'
        };
    }
    if (this.images[type]) {
        return this.deviceImgPath + this.images[type];
    } else {
        return "";
    }
}

function updateDataTree () {
    // create data
    var dataTree = {};
    for (var id in regaObjects) {
        if (regaObjects[id].TypeName.indexOf ("ENUM_") != -1 ||
            regaObjects[id].TypeName == "FAVORITE") {
            continue;
        }
        var idNum = parseInt(id);
        if (idNum == 14399) {
            var g = 0;
        }

        dataTree [idNum] = {};
        dataTree [idNum].name = regaObjects[id].Name;
        // Alarm variable or variable
        if (regaObjects[id].TypeName == "VARDP") {
            dataTree [idNum].type        = c.cObjTypePoint;
            dataTree [idNum].description = regaObjects[id].DPInfo;
            dataTree [idNum].specType    = "Variable";
        }
        else
        if (regaObjects[id].TypeName == "DEVICE") {
            dataTree [idNum].type        = c.cObjTypeDevice;
            dataTree [idNum].specType    = regaObjects[id].HssType;
            dataTree [idNum].image       = getImage (regaObjects[id].HssType);
            dataTree [idNum].address     = regaObjects[id].Address;
            dataTree [idNum].objects     = regaObjects[id].Channels;
        }
        else
        if (regaObjects[id].TypeName == "CHANNEL") {
            dataTree [idNum].parent      = regaObjects[id].Parent;
            dataTree [idNum].type        = c.cObjTypeChannel;
            dataTree [idNum].specType    = regaObjects[id].HssType;
            dataTree [idNum].address     = regaObjects[id].Address;
            dataTree [idNum].objects     = [];
            for (var i in regaObjects[id].DPs) {
                dataTree [idNum].objects.push(regaObjects[id].DPs[i]);
            }
            for (var i in regaObjects[id].ALDPs) {
                dataTree [idNum].objects.push(regaObjects[id].ALDPs[i]);
            }
        }
        else
        if (regaObjects[id].TypeName == "HSSDP") {
            dataTree [idNum].parent      = regaObjects[id].Parent;
            dataTree [idNum].type        = c.cObjTypePoint;
            dataTree [idNum].specType    = "Datapoint";
            dataTree [idNum].address     = regaObjects[id].Address;
        }
        else
        if (regaObjects[id].TypeName == "ALARMDP") {
            dataTree [idNum].parent      = regaObjects[id].Parent;
            dataTree [idNum].type        = c.cObjTypePoint;
            dataTree [idNum].specType    = "Alarms";
            dataTree [idNum].address     = regaObjects[id].Address;
        }
        else
        if (regaObjects[id].TypeName == "PROGRAM") {
            dataTree [idNum].type        = c.cObjTypePoint;
            dataTree [idNum].specType    = "Programm";
            dataTree [idNum].description = regaObjects[id].DPInfo;
        }
        else {
            logger.warn("Unknown type of CCU object " + regaObjects[id].TypeName);
        }

        // Find out rooms, functions, favorites
        // ENUM_FUNCTIONS, FAVORITE, ENUM_ROOMS
        if (regaIndex['ENUM_FUNCTIONS']) {
            for (var t = 0, len = regaIndex['ENUM_FUNCTIONS'].length; t < len; t++) {
                if (regaObjects[regaIndex['ENUM_FUNCTIONS'][t]].Channels.indexOf (idNum) != -1) {
                    if (!dataTree [idNum].role) {
                        dataTree [idNum].role = [];
                    }
                    dataTree [idNum].role.push(regaObjects[regaIndex['ENUM_FUNCTIONS'][t]].Name);
                }
            }
        }
        if (regaIndex['FAVORITE']) {
            for (var t = 0, len = regaIndex['FAVORITE'].length; t < len; t++) {
                if (regaObjects[regaIndex['FAVORITE'][t]].Channels.indexOf (idNum) != -1) {
                    if (!dataTree [idNum].favorite) {
                        dataTree [idNum].favorite = [];
                    }
                    dataTree [idNum].favorite.push(regaObjects[regaIndex['FAVORITE'][t]].Name);
                }
            }
        }
        if (regaIndex['ENUM_ROOMS']) {
            for (var t = 0, len = regaIndex['ENUM_ROOMS'].length; t < len; t++) {
                if (regaObjects[regaIndex['ENUM_ROOMS'][t]].Channels.indexOf (idNum) != -1) {
                    if (!dataTree[idNum].location) {
                        dataTree [idNum].location = [];
                    }
                    dataTree[idNum].location.push(regaObjects[regaIndex['ENUM_ROOMS'][t]].Name);
                }
            }
        }
    }

    socket.emit ("addObjects", dataTree);
}

function updateDataPoints () {
    socket.emit ("setPointValues", datapoints);
}

function loadRegaData(index, err, rebuild, triggerReload) {
    if (!index) { index = 0; }

    var type = settings.regahss.metaScripts[index];
    logger.info("rega          fetching "+type);
    regahss.runScriptFile(type, function (_data) {
        var data = JSON.parse(_data);
        logger.info("adapter CCU   indexing "+type);
        var timestamp = formatTimestamp();
        for (var id in data) {
            var idInt = parseInt(id, 10);

            // Decode HomeMatic Script "WriteURL"
            for (var key in data[id]) {
                // Nur Strings und auf keinen Fall Kanal- oder Datenpunkt-Arrays
                if (typeof data[id][key] == "string" && key !== "Channels" && key !== "DPs") {
                    data[id][key] = unescape(data[id][key]);
                }
                // Decode data point name
                if (key == "DPs") {
                    for (var subkey in data[id][key]) {
                        var val = data[id][key][subkey];
                        delete data[id][key][subkey];
                        data[id][key][unescape(subkey)] = val;
                    }
                }
            }
            var TypeName;
            // Create Index
            if (type == "alarms") {
                TypeName = "ALDP";
            } else {
                TypeName = data[id].TypeName;
            }
            // Typen-Index (einfach ein Array der IDs)
            if (!regaIndex[TypeName]) {
                regaIndex[TypeName] = [];
            }
            regaIndex[TypeName].push(idInt);
            // Namens-Index
            regaIndex.Name[data[id].Name] = [idInt, TypeName, data[id].Parent];
            // ggf. Adressen-Index
            if (data[id].Address) {
                regaIndex.Address[data[id].Address] = [idInt, TypeName, data[id].Parent];
            }

            // ggf. Werte setzen
            if (type == "variables") {
                datapoints[id] = {val: data[id].Value, ts: data[id].Timestamp, ack: true, lc: data[id].Timestamp};
                // Werte aus data Objekt entfernen
                delete data[id].Value;
                delete data[id].Timestamp;
            }
            if (type == "datapoints") {
                datapoints[id] = {val: data[id].Value, ts: timestamp, ack: true, lc: data[id].Timestamp};
                // Werte aus data Objekt entfernen
                delete data[id].Value;
                delete data[id].Timestamp;
            }
            if (type == "alarms") {

                if (regaObjects[data[id].Parent]) {
                    // ggf Kanal ergänzen
                    if (!regaObjects[data[id].Parent].ALDPs) {
                        regaObjects[data[id].Parent].ALDPs = {};
                    }
                    var tmpType = data[id].Name.split(".");
                    tmpType = tmpType[1];
                    regaObjects[data[id].Parent].ALDPs[tmpType] = parseInt(id, 10);
                }

                // Wert setzen
                datapoints[id] = {val: data[id].AlState, ts: data[id].LastTriggerTime, ack: true, lc: data[id].AlOccurrenceTime};
                // Werte aus data Objekt entfernen
                delete data[id].AlState;
                delete data[id].LastTriggerTime;
                delete data[id].AlOccurrenceTime;
            }

            if (data[id].ValueUnit && data[id].ValueUnit == "�C") {
                data[id].ValueUnit = "°C";
            }

            // Meta-Daten setzen
            regaObjects[id] = data[id];
        }

        index += 1;
        if (index < settings.regahss.metaScripts.length) {
            loadRegaData(index, null, rebuild);
        } else {

            // Send new data to ioBroker
            updateDataTree   ();
            updateDataPoints ();

            regaReady = true;
            socket.emit ("setStatus", "ccuRegaData", regaReady);

            if (rebuild) {
                logger.info("rega          data succesfully reloaded");
                socket.emit("reloadDataReady", process.env.adapterId);
            } else {
                logger.info("rega          data succesfully loaded");
                if (settings.regahss.pollData) {
                    pollRega();
                }
                initRpc();

                if (triggerReload) {
                    socket.emit("reloadDataReady", process.env.adapterId);
                }
            }
        }
    });

}

function initRpc() {

    for (var i = 0; i < settings.binrpc.inits.length; i++) {
        lastEvents[settings.binrpc.inits[i].id] = Math.floor((new Date()).getTime() / 1000);
    }

    if (!homematic) {
        if (!settings.binrpc.listenIp || !settings.binrpc.listenPort) {
            logger.error ('binrp         Invalid settings for CCU adapter: IP - "'+settings.binrpc.listenIp+'":"'+settings.binrpc.listenPort+'"');
            return;
        }

        homematic = new binrpc({
            ccuIp:      settings.ccuIp,
            listenIp:   settings.binrpc.listenIp,
            listenPort: settings.binrpc.listenPort,
            inits:      settings.binrpc.inits,
            methods: {
                event: function (obj) {

                    if (!regaReady) { return; }

                    var timestamp = formatTimestamp();

                    var bidcos;
                    switch (obj[0]) {
                        case "io_cuxd":
                        case "CUxD":
                            lastEvents.io_cuxd = Math.floor((new Date()).getTime() / 1000);
                            stats.cuxd += 1;
                            bidcos = "CUxD." + obj[1] + "." + obj[2];
                            break;
                        case "io_rf":
                            lastEvents.io_rf = Math.floor((new Date()).getTime() / 1000);
                            stats.rf += 1;
                            bidcos = "BidCos-RF." + obj[1] + "." + obj[2];
                            break;
                        case "io_wired":
                            lastEvents.io_wired = Math.floor((new Date()).getTime() / 1000);
                            stats.wired += 1;
                            bidcos = "BidCos-Wired." + obj[1] + "." + obj[2];
                            break;
                        default:
                        //
                            break;
                    }

                    if (settings.regahss.pollDataTriggerEnabled && bidcos == settings.regahss.pollDataTrigger) {
                        clearTimeout(pollTimer);
                        pollRega();
                    }

                    // STATE korrigieren
                    if (obj[2] == "STATE") {
                        if (obj[3] === "1" || obj[3] === 1) {
                            obj[3] = true;
                        } else if (obj[3] === "0" || obj[3] === 0) {
                            obj[3] = false;
                        }
                    }

                    // Get ReGa id
                    var regaObj = regaIndex.Name[bidcos];

                    if (regaObj && regaObj[0] && ignoreNextUpdate.indexOf(regaObj[0]) != -1) {
                        logger.verbose("adapter CCU   ignoring event dp "+regaObj[0]);
                        ignoreNextUpdate.splice(ignoreNextUpdate.indexOf(regaObj[0]), 1);
                        return;
                    }

                    if (regaObj && regaObj[0]) {
                        var id = regaObj[0];
                        var val = obj[3];
                        logger.verbose("socket.io --> broadcast event "+JSON.stringify([id, val, timestamp, true]));

                        if (datapoints[id]) {
                            if (datapoints[id].val != val) {
                                // value changed
                                datapoints[id] = {val: val, ts: timestamp, ack: true, lc: timestamp};
                            } else {
                                // no change - keep LastChange
                                datapoints[id] = {val: val, ts: timestamp, ack: true, lc: datapoints[id].lc};
                            }
                        } else {
                            datapoints[id] = {val: val, ts: timestamp, ack: true, lc: timestamp};
                        }
                        if (regaReady) {
                            socket.emit ("setPointValue", id, val, timestamp, true);
                        }
                    }

                    return "";
                }
            }
        });
    } else {
        homematic.init();
    }
    initsDone = true;
    socket.emit ("setStatus", "initsDone", initsDone);
}

function programExecute(id, callback) {
    logger.verbose("socket.io <-- programExecute");
    regahss.script("Write(dom.GetObject("+id+").ProgramExecute());", function (data) {
        if (callback) { callback(data); }
    });
}

function clearRegaData() {
    for (var obj in regaObjects) {
        delete regaObjects[obj];
    }
    for (var item in regaIndex.Name) {
        delete regaIndex.Name[item];
    }
    for (var item in regaIndex.Address) {
        delete regaIndex.Address[item];
    }

    regaIndex.HSSDP = null; // Command for garbage collector
    regaIndex.HSSDP = [];

    regaIndex.ALDP = null; // Command for garbage collector
    regaIndex.ALDP = [];

    regaIndex.ALARMDP = null; // Command for garbage collector
    regaIndex.ALARMDP = [];

    regaIndex.VARDP = null; // Command for garbage collector
    regaIndex.VARDP = [];

    regaIndex.FAVORITE = null; // Command for garbage collector
    regaIndex.FAVORITE = [];

    regaIndex.ENUM_ROOMS = null; // Command for garbage collector
    regaIndex.ENUM_ROOMS = [];

    regaIndex.ENUM_FUNCTIONS = null; // Command for garbage collector
    regaIndex.ENUM_FUNCTIONS = [];

    regaIndex.DEVICE  = null; // Command for garbage collector
    regaIndex.DEVICE  = [];

    regaIndex.CHANNEL = null; // Command for garbage collector
    regaIndex.CHANNEL = [];

    regaIndex.PROGRAM = null; // Command for garbage collector
    regaIndex.PROGRAM = [];
}

process.on('SIGINT', function () {
    stop();
});

process.on('SIGTERM', function () {
    stop();
});

function stop() {
    if (homematic && initsDone) {
        homematic.stopInits();
    }

    setTimeout(quit, 500);
}

var quitCounter = 0;

function quit() {
    logger.verbose("adapter CCU   quit");
    if (regahss.pendingRequests > 0) {
        quitCounter += 1;
        if (quitCounter > 20) {
            logger.verbose("rega          waited too long ... killing process");
            setTimeout(function () {
                process.exit(0);
            }, 250);
        }
        logger.verbose("rega          waiting for pending ReGa request...");
        setTimeout(quit, 500);

    } else {
        logger.info("adapter CCU   terminating");
        setTimeout(function () {
            process.exit(0);
        }, 250);
    }
}