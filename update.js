var request = require("request");
var logger  = require(__dirname+'/logger.js');
var fs      = require("fs");
var AdmZip  = require("adm-zip");
    ncp     = require('ncp').ncp;

ncp.limit = 16;

logger.info("update-ioBroker started");

var path    = process.argv[2] || "https://github.com/hobbyquaker/ioBroker/archive/master.zip";
var tmpFile;
var tmpDir;

var parts = path.split('/');
tmpFile = parts[parts.length - 1];
parts = tmpFile.split('.');
parts.splice(parts.length - 1, 1);
tmpDir = parts.join('.');

// Check if file must be downloaded
if (path.substring(0,6) == 'https:' || path.substring(0,5) == 'http:') {
    logger.info("update-ioBroker download "+path);
    request(path).pipe(fs.createWriteStream(tmpFile)).on("close", function () {
        unzipPacket(__dirname + '/tmp/' + tmpFile, tmpDir);
    });
} else {
    unzipPacket(path, tmpDir);
}

function unzipPacket(fileName, destName) {
    logger.info("update-ioBroker unzip "+fileName);
    var zip = new AdmZip(fileName);
    zip.extractAllTo(__dirname+"/tmp/" + destName, true);

    logger.info("update-ioBroker unzip done");
}

// Find out what is it
if (fs.existsSync(__dirname+'/tmp/'+tmpDir+'/io-adapter.json')) {
    updateAdapter(__dirname+'/tmp/'+tmpDir);
} else
if (fs.existsSync(__dirname+'/tmp/'+tmpDir+'/io-core.json')) {
    updateCore(__dirname+'/tmp/'+tmpDir);
} else
if (fs.existsSync(__dirname+'/tmp/'+tmpDir+'/io-addon.json')) {
    updateAddon(__dirname+'/tmp/'+tmpDir);
}

// Download and Unzip
// reading archives
function updateCore (source) {
    var destination = __dirname;

    logger.info("update-ioBroker copying "+source+" to "+destination);

    ncp(source, destination, function (err) {
        if (err) {
            logger.error(err);
            return;
        }

        setTimeout(function () {
            // Delete directory in TMP
            logger.info('update-ioBroker delete tmp folder '+source);
            deleteFolderRecursive(source);
            logger.info('update-ioBroker done');
            process.exit(0);
        }, 2000);

    });
}

// Download and Unzip
// reading archives
function updateAddon (source) {
    var params = null;
    try {
        var contents = fs.readFileSync(source + '/io-addon.json');
        params = JSON.parse(contents);
    } catch(e) {
        logger.error('update-ioBroker: cannot parse io-addon.json (' + e.message + ')');
        return;
    }
    if (!params) {
        logger.error('update-ioBroker: cannot parse io-addon.json');
        return;
    }
    if (!params.dirname && !params.name) {
        logger.error('update-ioBroker: invalid io-addon.json - No name or dirname found');
        return;
    }

    var destination = __dirname+"/www/"+(params.dirname || params.name);

    logger.info("update-addon  copying "+source+" to "+destination);

    ncp(source, destination, function (err) {
        if (err) {
            logger.error(err);
            return;
        }

        setTimeout(function () {
            // Delete directory in TMP
            logger.info('update-addon  delete tmp folder '+source);
            deleteFolderRecursive(source);
            logger.info('update-addon  done');
            process.exit(0);
        }, 2000);
    });
}
// Download and Unzip
// reading archives
function updateAdapter (source) {
    var params = null;
    try {
        var contents = fs.readFileSync(source + '/io-adapter.json');
        params = JSON.parse(contents);
    } catch(e) {
        logger.error('update-ioBroker: cannot parse io-adapter.json (' + e.message + ')');
        return;
    }
    if (!params) {
        logger.error('update-ioBroker: cannot parse io-adapter.json');
        return;
    }
    var name = (params.dirname || params.name);
    if (!name) {
        logger.error('update-ioBroker: invalid io-adapter.json - No name or dirname found');
        return;
    }

    var destination = __dirname+"/adapter/"+name;

    logger.info("update-addon  copying "+source+" to "+destination);

    //Check if css exists
    if (fs.existsSync(source+'/css')) {
        if (!fs.existsSync(__dirname+'/www/css')) {
            fs.mkdirSync(__dirname+'/www/css');
        }
        ncp(source+'/css', __dirname+'/www/css/'+name, function (err) {
            setTimeout(function () {
                // Delete directory in TMP
                deleteFolderRecursive(source+'/css');
            }, 100);
        });
    }
    if (fs.existsSync(source+'/img')) {
        if (!fs.existsSync(__dirname+'/www/img')) {
            fs.mkdirSync(__dirname+'/www/img');
        }

        ncp(source+'/img', __dirname+'/www/img/'+name, function (err) {
            setTimeout(function () {
                // Delete directory in TMP
                deleteFolderRecursive(source+'/img');
            }, 100);
        });
    }

    setTimeout(function () {
        ncp(source, destination, function (err) {
            if (err) {
                logger.error(err);
                return;
            }

            setTimeout(function () {
                // Delete directory in TMP
                logger.info('update-adapter  delete tmp folder '+source);
                deleteFolderRecursive(source);
                logger.info('update-adapter  done');
                process.exit(0);
            }, 2000);
        });
    }, 1000);
}
var deleteFolderRecursive = function(path) {
    if( fs.existsSync(path) ) {
        fs.readdirSync(path).forEach(function(file,index){
            var curPath = path + "/" + file;
            if(fs.statSync(curPath).isDirectory()) { // recurse
                deleteFolderRecursive(curPath);
            } else { // delete file
                fs.unlinkSync(curPath);
            }
        });
        fs.rmdirSync(path);
    }
};
