@echo on
goto check_Permissions

:check_Permissions
    echo Administrative permissions required. Detecting permissions...

    net session >nul 2>&1
    if %errorLevel% == 0 (
        echo Success: Administrative permissions confirmed.
    ) else (
        echo Failure: You have no administration rights.
		goto end
    )

:install
set IOBROKER_DIR=%programfiles(x86)%\ioBroker\
mkdir "%IOBROKER_DIR%"
xcopy v0.10.26 "%IOBROKER_DIR%" /E /Q /Y
xcopy data "%IOBROKER_DIR%" /E /Q /Y
copy *.js "%IOBROKER_DIR%"
pushd "%IOBROKER_DIR%"
node install.js
popd

rem sc create ioBroker binPath= "\"%IOBROKER_DIR%node.exe\" main.js" DisplayName= "ioBroker" start= auto
rem sc failure ioBroker command= "\"%IOBROKER_DIR%node.exe\" main.js"
rem netsh.exe advfirewall firewall add rule name="Node In" program="%IOBROKER_DIR%node.exe" dir=in action=allow enable=yes
rem netsh.exe advfirewall firewall add rule name="Node Out" program="%IOBROKER_DIR%node.exe" dir=out action=allow enable=yes
rem net start ioBroker
	
:end