@echo off
cd /d "%~dp0.."
call npm run publicar -- --sim --mensagem "Site: passo para download pausado no botao do APK; app do cuidador: APK so arm64 (44,8 MB) e script que troca o APK do release; teste do aviso de bloqueio com mais folga"
pause
