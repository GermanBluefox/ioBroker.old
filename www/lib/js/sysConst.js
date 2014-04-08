
// Constants of object types
var cObjTypeDevice  = 1;
var cObjTypeChannel = 2;
var cObjTypePoint   = 3;

// Constants reserved adapters
var cSystem          = 1;
var cScript          = 2;
var cWebServer       = 3
var cUserAdapter     = 10;
var cSettingsAdapter = 0xFFE;

// Variables in cSystem
var cSystemLanguage    = 1;
var cSystemReady       = 2;

var cAdapterMask  = 0xFFF;
var cAdapterShift = 20; // Bits
var cObjectsMask  = 0xFFFFF;


var cAdapterId    = 0;
var cObjectId     = 1;
var cCombyId      = 2;

if (typeof module !== "undefined" && typeof module.exports != "undefined") {
    module.exports = {
        cObjTypeDevice     :cObjTypeDevice       ,
        cObjTypeChannel    :cObjTypeChannel      ,
        cObjTypePoint      :cObjTypePoint        ,

        cSystem            :cSystem              ,
        cScript            :cScript              ,
        cWebServer         :cWebServer           ,
        cUserAdapter       :cUserAdapter         ,

        cSystemLanguage    :cSystemLanguage      ,
        cSystemReady       :cSystemReady         ,

        cAdapterMask       :cAdapterMask         ,
        cAdapterShift      :cAdapterShift        ,
        cObjectsMask       :cObjectsMask         ,

        cAdapterId         :cAdapterId           ,
        cObjectId          :cObjectId            ,
        cCombyId           :cCombyId

    };
}