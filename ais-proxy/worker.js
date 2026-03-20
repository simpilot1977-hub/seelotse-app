/**
 * Cloudflare Worker: AIS-Proxy für Seelotse-App
 *
 * Dieser Worker leitet WebSocket-Verbindungen vom Browser an aisstream.io weiter,
 * da aisstream.io direkte Browser-Verbindungen aus Sicherheitsgründen blockiert.
 *
 * Deployment:
 *   1. https://dash.cloudflare.com → Workers & Pages → Create Application → Create Worker
 *   2. Diesen Code einfügen und "Save & Deploy" klicken
 *   3. Die Worker-URL (z.B. ais-proxy.IHR-NAME.workers.dev) in der App eintragen
 */

const AIS_WS_URL  = 'wss://stream.aisstream.io/v0/stream';
const AIS_API_KEY = 'cef13862ef8e366459beaafc142f50bc4ab60d77';

// Elbe Bounding Box: Elbe-Racon → Hamburg
const BOUNDING_BOX = [[53.4, 8.0], [54.1, 10.2]];

export default {
  async fetch(request) {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Upgrade, Connection',
        },
      });
    }

    // Status-Endpunkt
    if (url.pathname === '/' || url.pathname === '/status') {
      return new Response(JSON.stringify({ status: 'ok', service: 'AIS-Proxy Seelotse' }), {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    // WebSocket-Upgrade
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('WebSocket-Verbindung erwartet', { status: 426 });
    }

    const [browserSide, workerSide] = Object.values(new WebSocketPair());
    workerSide.accept();

    // Verbindung zu aisstream.io aufbauen
    let aisWs;
    try {
      aisWs = new WebSocket(AIS_WS_URL);
    } catch (e) {
      workerSide.close(1011, 'Fehler beim Verbinden mit aisstream.io');
      return new Response(null, { status: 101, webSocket: browserSide });
    }

    aisWs.addEventListener('open', () => {
      aisWs.send(JSON.stringify({
        APIKey: AIS_API_KEY,
        BoundingBoxes: [BOUNDING_BOX],
        FilterMessageTypes: ['PositionReport', 'ShipStaticAndVoyageRelatedData', 'ExtendedClassBPositionReport'],
      }));
    });

    // aisstream → Browser
    aisWs.addEventListener('message', event => {
      try {
        if (workerSide.readyState === WebSocket.READY_STATE_OPEN) {
          workerSide.send(event.data);
        }
      } catch {}
    });

    aisWs.addEventListener('error',  () => { try { workerSide.close(1011, 'aisstream Fehler'); } catch {} });
    aisWs.addEventListener('close',  () => { try { workerSide.close(); } catch {} });

    // Browser → aisstream (Steuernachrichten weiterleiten)
    workerSide.addEventListener('message', event => {
      try { if (aisWs.readyState === WebSocket.READY_STATE_OPEN) aisWs.send(event.data); } catch {}
    });
    workerSide.addEventListener('close', () => { try { aisWs.close(); } catch {} });
    workerSide.addEventListener('error', () => { try { aisWs.close(); } catch {} });

    return new Response(null, {
      status: 101,
      webSocket: browserSide,
      headers: { 'Access-Control-Allow-Origin': '*' },
    });
  },
};
