var request =   require("request"),
    logger =    require(__dirname+'/logger.js'),
    fs =        require("fs"),
    AdmZip =     require("adm-zip"),
    ncp =       require('ncp').ncp;

ncp.limit = 16;

logger.info("update-ioBroker started");

var url = "https://github.com/hobbyquaker/ioBroker/archive/master.zip",
    tmpDir = "ioBroker-master",
    tmpFile = __dirname+"/tmp/master.zip";

logger.info("update-ioBroker download and unzip "+url);

// Download and Unzip
// reading archives
request(url).pipe(fs.createWriteStream(tmpFile)).on("close", function () {

    var zip = new AdmZip(tmpFile);
    zip.extractAllTo(__dirname+"/tmp", true);

    logger.info("update-ioBroker unzip done");
    var source =        __dirname+"/tmp/"+tmpDir,
        destination =   __dirname;

    logger.info("update-ioBroker copying "+source+" to "+destination);

    ncp(source, destination, function (err) {
        if (err) {
            logger.error(err);
            return
        }

        setTimeout(function () {
            // Ordner im tmp Verzeichnis lÃ¶schen
            logger.info('update-ioBroker delete tmp folder '+__dirname+"/tmp/"+tmpDir);
            deleteFolderRecursive(__dirname+"/tmp/"+tmpDir);
            logger.info('update-ioBroker done');
            process.exit(0);
        }, 2000);

    });
});

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
