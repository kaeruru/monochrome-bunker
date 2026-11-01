@echo off
chcp 65001 >nul
title MONOCHROME // BUNKER (로컬 1ms 초저지연 서버)
echo ========================================================
echo     [MONOCHROME // BUNKER] 로컬 1ms 초저지연 협동 서버 구동
echo ========================================================
echo.
echo [1/2] 백엔드 전술 통신 서버(Node.js Port 3001) 백그라운드 시작...
start "MONOCHROME CO-OP SERVER [3001]" /min node server.js
echo.
echo [2/2] 프론트엔드 Vite 호스트 서버 구동...
echo.
echo * 같은 Wi-Fi에 연결된 태블릿/노트북/스마트폰에서 접속 가능합니다.
echo * 콘솔에 표시되는 Network 주소(예: http://192.168.0.x:5173)로 접속 시
echo   외부 클라우드 경유 없이 '1~3ms 초저지연(Zero Lag)'으로 동기화됩니다.
echo.
npm run dev -- --host
pause

