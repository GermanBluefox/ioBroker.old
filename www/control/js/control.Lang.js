// Translated words
var ccuWords = {
    "YES"               : {"en": "YES",                  "de": "JA",                  "ru": "ДА"},
    "NO"                : {"en": "NO",                   "de": "NEIN",                "ru": "НЕТ"},
    "TRUE"              : {"en": "TRUE",                 "de": "TRUE",                "ru": "ДА"},
    "false"             : {"en": "false",                "de": "false",               "ru": "нет"},
    "ioBroker"          : {"en": "ioBroker",             "de": "ioBroker",            "ru": "ioBroker"},
    "Addons"            : {"en": "Addons",               "de": "Addons",              "ru": "Дополнения"},
    "Adapter"           : {"en": "Adapter",              "de": "Adapter",             "ru": "Драйвера"},
    "Data"              : {"en": "Data",                 "de": "Daten",               "ru": "Данные"},
    "Info"              : {"en": "Info",                 "de": "Info",                "ru": "Информация"},
    "Control"           : {"en": "Control",              "de": "Steuerung",           "ru": "Контроль"},
    "Settings"          : {"en": "Settings",             "de": "Einstellungen",       "ru": "Настройки"},
    "ioBroker installed Version:" : {"en": "ioBroker installed Version:", "de": "Installierte ioBroker Version:", "ru": "Локальная версия ioBroker"},
    "ioBroker available Version:" : {"en": "ioBroker available Version:", "de": "Verfügbare ioBroker Version:", "ru": "Доступная версия ioBroker"},
    "update"            : {"en": "update",               "de": "update",              "ru": "обновить"},
    "check"             : {"en": "check",                "de": "prüfen",              "ru": "проверить"},
    "CCU reachable:"    : {"en": "CCU reachable:",       "de": "CCU erreichbar:",     "ru": "CCU полключена:"},
    "ReGa Up:"          : {"en": "ReGa Up:",             "de": "ReGa erreichbar:",    "ru": "ReGa запущена:"},
    "ReGa Data loaded:" : {"en": "ReGa Data loaded:",    "de": "ReGa-Data geladen:",  "ru": "Данные ReGa загружены:"},
    "RPC Inits:"        : {"en": "RPC Inits:",           "de": "RPC Inits:",          "ru": "RPC Inits:"},
    "Geographical position"  : {"en": "Geographical position:", "de": "Geografische Position", "ru": "Географическое положение:"},
    "logging enabled:"  : {"en": "logging enabled:",     "de": "Logging aktiviert:",  "ru": "Протоколлирование:"},
    "Last ReGa poll:"   : {"en": "Last ReGa poll:",      "de": "Letzte ReGa-Anfrage:","ru": "Последний ReGa запрос:"},
    "Last rf event:"    : {"en": "Last rf event:",       "de": "Letzte rf-Ereignis:", "ru": "Последнее rf событие:"},
    "Last hs485 event:" : {"en": "Last hs485 event:",    "de": "Letzte hs485-Ereignis:","ru": "Последнее hs485 событие:"},
    "Last CUx event:"   : {"en": "Last CUx event:",      "de": "Letzte CUx-Ereignis:","ru": "Последнее CUxD событие:"},
    "restart ioBroker"    : {"en": "restart ioBroker",       "de": "Neustart ioBroker",     "ru": "Перезапуск ioBroker"},
    "refresh Addons"    : {"en": "refresh Addons",       "de": "Addons neu laden",    "ru": "Перезагрузить дополнения"},
    "reload adapter data"  : {"en": "reload CCU data",      "de": "CCU-Daten neu laden", "ru": "Считать ReGa-данные заново"},
    "create Backup"     : {"en": "create Backup",        "de": "Backup erzeugen",     "ru": "Создать резервную копию"},
    "create Backup with Logs" : {"en": "create Backup with Logs", "de": "Backup mit Logs erzeugen",     "ru": "Создать резервную копию c историей"},
    "restart all adapters" : {"en": "restart all adapters",    "de": "RPC inits neu starten", "ru": "Перезапуск RPC inits"},
    "apply Backup"      : {"en": "apply Backup",         "de": "Backup anwenden",     "ru": "Применить резервную копию"},
    "restart script-engine" : {"en": "restart script-engine","de": "Script-Engine neu starten", "ru": "Перезапустить Script-Engine"},
    "save changes"      : {"en": "save changes",         "de": "Änderungen speichern", "ru": "Сохранить изменения"},
    "Base configuration": {"en": "Base configuration",   "de": "Basiskonfiguration",  "ru": "Основные настройки"},
    "Stats"             : {"en": "Stats",                "de": "Statistik",           "ru": "Статистика"},
    "Enabled"           : {"en": "Enabled",              "de": "Ein",                 "ru": "Включено"},
    "Interval (minutes)": {"en": "Interval (minutes)",   "de": "Intervall (Minuten)", "ru": "Интервал (минуты)"},
    "Logging"           : {"en": "Logging",              "de": "Protokollierung",     "ru": "Протокол"},
    "Write Interval (s)": {"en": "Write Interval (s)",   "de": "Schreibintervall (s)","ru": "Интервал записи (сек)"},
    "Script-Engine"     : {"en": "Script-Engine",        "de": "Script-Engine",       "ru": "Script-Engine"},
    "Longitude"         : {"en": "Longitude",            "de": "Längengrad",          "ru": "Градус долготы"},
    "Latitude"          : {"en": "Latitude",             "de": "Breitengrad",         "ru": "Градус широты"},
    "Webserver"         : {"en": "Webserver",            "de": "Web-Server",          "ru": "Web Сервер"},
    "HTTP"              : {"en": "HTTP",                 "de": "HTTP",                "ru": "HTTP"},
    "Port"              : {"en": "Port",                 "de": "Port",                "ru": "Порт"},
    "Authentication"    : {"en": "Authentication",       "de": "Authentifizierung",   "ru": "Аутентификация"},
    "HTTPS"             : {"en": "HTTPS",                "de": "HTTPS",               "ru": "HTTPS"},
    "Common"            : {"en": "Common",               "de": "Hauptsteuerung",      "ru": "Главные"},
    "CCU"               : {"en": "CCU",                  "de": "CCU",                 "ru": "CCU"},
    "Backup"            : {"en": "Backup",               "de": "Backup",              "ru": "Резервные копии"},
    "Username"          : {"en": "User name",            "de": "Benutzername",        "ru": "Имя пользователя"},
    "Password"          : {"en": "Password",             "de": "Kennwort",            "ru": "Пароль"},
    "Cache"             : {"en": "Cache",                "de": "Cache",               "ru": "Кэширование"},
    "install addon"     : {"en": "install addon",        "de": "Addon installieren",  "ru": "Установить дополнение"},
    "...loading"        : {"en": "...loading",           "de": "...lade",             "ru": "...загрузка"},
    "adapter configuration" : {"en": "adapter configuration","de": "Adapter-Konfiguration", "ru": "Настройки драйвера"},
    "Save"              : {"en": "Save",                 "de": "Speichern",           "ru": "Сохранить"},
    "Save and close"    : {"en": "Save and close",       "de": "Speichern und schließen", "ru": "Сохранить и выйти"},
    "Discard changes and close": {"en": "Discard changes and close","de": "Änderungen verwerfen und schließen", "ru": "Выйти без сохранения"},
    "regaObjects"       : {"en": "regaObjects",          "de": "regaObjects",         "ru": "regaObjects"},
    "regaIndex"         : {"en": "regaIndex",            "de": "regaIndex",           "ru": "regaIndex"},
    "datapoints"        : {"en": "datapoints",           "de": "Datenpunkte",         "ru": "Значения"},
    "events"            : {"en": "events",               "de": "Ereignisse",          "ru": "События"},
    "Events"            : {"en": "Events",               "de": "Ereignisse",          "ru": "События"},
    "stringtable"       : {"en": "stringtable",          "de": "Text-Tabelle",        "ru": "Текст"},
    "datastore"         : {"en": "datastore",            "de": "datastore",           "ru": "datastore"},
    "refresh"           : {"en": "refresh",              "de": "Neu laden",           "ru": "Обновить"},
    "delete"            : {"en": "delete",               "de": "löschen",             "ru": "удалить"},
    "anonymize"         : {"en": "anonymize",            "de": "anonymisieren",       "ru": "Убрать персональную информацию"},
    "save changes"      : {"en": "save changes",         "de": "Änderungen speichern","ru": "Сохранить изменения"},
    "install"           : {"en": "install",              "de": "Installieren",        "ru": "Установить"},
    "Add adapter:"      : {"en": "Add adapter:",          "de": "Adapter hinzufügen:",  "ru": "Добавить драйвер:"},
    "ioBroker is reloading all CCU data. Please be patient. This page will be automatically reloaded when finished.": {
        "en": "ioBroker is reloading all CCU data. Please be patient. This page will be automatically reloaded when finished.",
        "de": "ioBroker lädt alle Daten aus CCU neu. Bitte warten. Die Seite wird automatisch neu geladen, wenn Ladeforgang abgeschlossen wird.",
        "ru": "ioBroker загружает все данные из CCU. Запаситесь терпением. Страница автоматически обновиться по окончании загрузки."
        },
    "ioBroker is restarting.": {"en": "ioBroker is restarting.", "de": "ioBroker startet neu. ",       "ru": "ioBroker перезапускается."},
    "name"              : {"en": "name",                  "de": "Name",               "ru": "Имя"},
    "enabled"           : {"en": "enabled",               "de": "Aktiviert",          "ru": "Активен"},
    "installed version" : {"en": "installed version",     "de": "Lokale Version",     "ru": "Локальная версия"},
    "available version" : {"en": "available version",     "de": "Verf. version",      "ru": "Доступная версия"},
    "homepage"          : {"en": "homepage",              "de": "Homepage",           "ru": "Домашняя страница"},
    "download"          : {"en": "download",              "de": "Laden",              "ru": "Загрузить"},
    "settings"          : {"en": "settings",              "de": "Einstellungen",      "ru": "Настройки"},
    "confed"            : {"en": "confed",                "de": "Konf.",              "ru": "СконФ."},
    "mode"              : {"en": "mode",                  "de": "Modus",              "ru": "Режим"},
    "period"            : {"en": "period",                "de": "Period",             "ru": "Период"},
    "Install Addon"     : {"en": "Install Addon",         "de": "Addon installieren", "ru": "Установить дополнение"},
    "reload"            : {"en": "reload",                "de": "neu laden",          "ru": "обновить"},
    "configure"         : {"en": "configure",             "de": "konfigurieren",      "ru": "настроить"},
    "periodical"        : {"en": "periodical",            "de": "periodisch",         "ru": "периодичный"},
    "Timestamp"         : {"en": "Timestamp",             "de": "Zeitstempel",        "ru": "Время"},
    "Severity"          : {"en": "Severity",              "de": "Stufe",              "ru": "Приоритет"},
    "Message"           : {"en": "Message",               "de": "Meldung",            "ru": "Сообщение"},
    "adapter"           : {"en": "Adapter",               "de": "Adapter",            "ru": "Драйвер"},
    "objectId"          : {"en": "ObjectID",              "de": "ObjektID",           "ru": "ID узла"},
    "TypeName"          : {"en": "TypeName",              "de": "Typname",            "ru": "Тип"},
    "Name"              : {"en": "Name",                  "de": "Name",               "ru": "Имя"},
    "Parent Name"       : {"en": "Parent Name",           "de": "Kanal",              "ru": "Имя родителя"},
    "Value"             : {"en": "Value",                 "de": "Wert",               "ru": "Значение"},
    "ack"               : {"en": "ack",                   "de": "Best.",              "ru": "Подтв."},
    "lastChange"        : {"en": "lastChange",            "de": "Letzte Änderung",    "ru": "Последнее изменение"},
    "eventCount"        : {"en": "eventCount",            "de": "Anzahl Meldungen",   "ru": "Кол-во сообщений"},
    "Error"             : {"en": "Error",                 "de": "Fehler",             "ru": "Ошибка"},
    "File saved."       : {"en": "File saved.",           "de": "Datei gespeichert",  "ru": "Файл сохранён."},
    "ioBroker disconnected":{"en": "ioBroker disconnected",   "de": "Verbindung zu ioBroker getrennt", "ru": "Связь с ioBroker прервана"},
    "install started"   : {"en": "install started",       "de": "Installation ist gestartet","ru": "Установка начата"},
    "Delete adapter?"   : {"en": "Delete adapter?",       "de": "Adapter löschen?",   "ru": "Удалить драйвер?"},
    "Delete"            : {"en": "Delete",                "de": "Löschen",            "ru": "Удалить"},
    "Cancel"            : {"en": "Cancel",                "de": "Abbrechen",          "ru": "Отмена"},
    "connections"       : {"en": "Connections",           "de": "Verbindungen",       "ru": "Подключения"},
    "Connections"       : {"en": "Connections",           "de": "Verbindungen",       "ru": "Подключения"},
    "Self name"         : {"en": "Client name",           "de": "Clientname",         "ru": "Имя подключения"},
    "AdapterID"         : {"en": "Adapter ID",            "de": "Adapter ID",         "ru": "ID драйвера"},
    "SocketID"          : {"en": "Socket ID",             "de": "Socket ID",          "ru": "ID сокета"},
    "Connect on"          : {"en": "Connect on",          "de": "Anschlußzeit",       "ru": "Время соединения"},
    "ioBroker settings saved. Please restart ioBroker" : {
        "en": "ioBroker settings saved. Please restart ioBroker",
        "de": "ioBroker Einstellungen gespeichert. Bitte ioBroker neu starten",
        "ru": "Настройки ioBroker сохранены. Перезапустите ioBroker"
        },
    "Error: invalid JSON" : {"en": "Error: invalid JSON", "de": "Fehler: ungültiges JSON","ru": "Ошибка: неправильный формат JSON"},
    " adapter settings saved. Please restart ioBroker" : {
        "en": " adapter settings saved. Please reload adapter",
        "de": " Adpater-Einstellungen gespeichert. Bitte Adapter neu laden",
        "ru": ": настройки сохранены. Перезапустите ioBroker или драйвер"
        },
    "Apply backup started. Please be patient..." : {
        "en": "Apply backup started. Please be patient...",                 
        "de": "Apply backup started. Please be patient...",             
        "ru": "Резервная копия распаковывается. Подождтите..."
        },
    "Apply backup done. Restart ioBroker" : {
        "en": "Apply backup done. Restart ioBroker",
        "de": "Sicherung eingespielt. Bitte ioBroker neu starten.",
        "ru": "Резервная копия распакована. Перезапустите ioBroker"
        },
    "Error: Backup failed." : {
        "en": "Error: Backup failed.",                 
        "de": "Fehler: Sicherheitskopie konnte nicht erzeugt werden",             
        "ru": "Ошибка: создание резервной копии не удалось."
        },
    "Backup started. Please be patient..." : {
        "en": "Backup started. Please be patient...",                 
        "de": "Sicherung wird erstellt. Bitte warten...",
        "ru": "Создание резервной копии запущено. Подождтите..."
        },
    "Update started. Please be patient..." : {
        "en": "Update started. Please be patient...",                 
        "de": "Update gestartet. Bitte warten...",
        "ru": "Обновление начато. Подождтите..."
        },
    "Update done. Restarting..." : {
        "en": "Update done. Restarting...",                 
        "de": "Update beendet. Neustart...",             
        "ru": "Обновление завершено. Перезагрузка..."
        },
    "Error: update failed." : {
        "en": "Error: update failed.",                 
        "de": "Fehler: update konnte nicht durchgeführt werden.",             
        "ru": "Ошибка: обновление не удалось."
        },
    "This adapter will be deleted and settings cannot be recovered.<br>Are you sure?" : {
        "en": "This adapter will be deleted and settings cannot be recovered.<br>Are you sure?",
        "de": "Dieser Adapter wird gelöscht und die Einstellungen werden verlohren.<br>Sind Sie sicher?",
        "ru": "Этот драйвер будет удален и настройки для него будут потеряны.<br>Вы уверены?"
    }
};
