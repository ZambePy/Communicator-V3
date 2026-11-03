@echo off
cd /d "%~dp0.."
call npm run publicar
rem Sem --sim: o publicador mostra o que vai subir e pergunta antes. A
rem mensagem vem de scripts/publicar/estaVersao.mjs.
pause
