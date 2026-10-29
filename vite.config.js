import { defineConfig } from 'vite';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  server: {
    host: true,
    port: 5173,
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
      'Pragma': 'no-cache',
      'Expires': '0'
    }
  },
  plugins: [
    {
      name: 'map-save-api',
      configureServer(server) {
        server.middlewares.use('/api/save-map', (req, res) => {
          if (req.method === 'POST') {
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', () => {
              try {
                const { mapStrings } = JSON.parse(body);
                if (!Array.isArray(mapStrings)) {
                  throw new Error('mapStrings must be an array of strings');
                }

                const filePath = path.resolve(__dirname, 'src/tilemapData.js');
                let content = fs.readFileSync(filePath, 'utf-8');

                const formattedArray = JSON.stringify(mapStrings, null, 2);
                content = content.replace(
                  /export const TILE_MAP = (?:generateCleanSkeldMap\(\)|\[[\s\S]*?\]);/,
                  `export const TILE_MAP = ${formattedArray};`
                );

                fs.writeFileSync(filePath, content, 'utf-8');
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ 
                  success: true, 
                  message: '성공: 맵이 src/tilemapData.js 파일에 영구 저장되었습니다!' 
                }));
              } catch (err) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: err.message }));
              }
            });
          }
        });
      }
    }
  ]
});

