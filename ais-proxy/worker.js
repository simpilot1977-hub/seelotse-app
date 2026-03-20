/**
 * Cloudflare Worker: AIS-Proxy für Seelotse-App
 * Leitet Browser-WebSocket-Verbindungen an aisstream.io weiter.
 * aisstream.io blockiert direkte Browser-Verbindungen (CORS).
 */

const AIS_WS_URL  = 'wss://stream.aisstream.io/v0/stream';
const AIS_API_KEY = 'cef13862ef8e366459beaafc142f50bc4ab60d77';
const BOUNDING_BOX = [[53.4, 8.0], [54.1, 10.2]];

export default {
  async fetch(request, env, ctx) {
    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Upgrade, Connection',
        },
      });
    }

    // Status-Endpunkt (HTTP)
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response(JSON.stringify({ status: 'ok', service: 'AIS-Proxy Seelotse' }), {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    // WebSocket-Verbindung aufbauen
    const [browserSide, workerSide] = Object.values(new WebSocketPair());
    workerSide.accept();

    // Outbound-Verbindung zu aisstream.io
    let aisWs;
    try {
      aisWs = new WebSocket(AIS_WS_URL);
    } catch (e) {
      console.error('[ais-proxy] WebSocket-Erstellung fehlgeschlagen:', e.message);
      workerSide.close(1011, 'Verbindungsfehler');
      return new Response(null, { status: 101, webSocket: browserSide });
    }

    // Promise das aufgelöst wird wenn eine Seite die Verbindung schliesst
    // ctx.waitUntil hält den Worker am Leben solange die WS-Verbindungen aktiv sind
    let msgCount = 0;
    const done = new Promise((resolve) => {
      // aisstream.io verbunden → Subscription senden
      aisWs.addEventListener('open', () => {
        console.log('[ais-proxy] aisstream.io OPEN — sende Subscription');
        try {
          const sub = JSON.stringify({
            APIKey: AIS_API_KEY,
            BoundingBoxes: [BOUNDING_BOX],
            FilterMessageTypes: ['PositionReport', 'ShipStaticData', 'ExtendedClassBPositionReport'],
          });
          aisWs.send(sub);
          console.log('[ais-proxy] Subscription gesendet:', sub.substring(0, 80));
        } catch (e) { console.error('[ais-proxy] Subscription Fehler:', e.message); }
      });

      // aisstream.io → Browser weiterleiten
      aisWs.addEventListener('message', event => {
        msgCount++;
        if (msgCount <= 3) console.log('[ais-proxy] AIS msg #' + msgCount + ':', String(event.data).substring(0, 100));
        try {
          if (workerSide.readyState === 1) workerSide.send(event.data);
        } catch {}
      });

      aisWs.addEventListener('error', (e) => {
        console.error('[ais-proxy] aisstream.io ERROR:', e.message || JSON.stringify(e));
        try { workerSide.close(1011, 'aisstream.io Fehler'); } catch {}
        resolve();
      });

      aisWs.addEventListener('close', (e) => {
        console.log('[ais-proxy] aisstream.io CLOSE code=' + e.code + ' reason=' + e.reason + ' msgs=' + msgCount);
        try { workerSide.close(1000); } catch {}
        resolve();
      });

      // Browser → aisstream.io (falls der Browser Nachrichten sendet)
      workerSide.addEventListener('message', event => {
        try {
          if (aisWs.readyState === 1) aisWs.send(event.data);
        } catch {}
      });

      workerSide.addEventListener('close', () => {
        console.log('[ais-proxy] Browser CLOSE — schließe aisstream.io. msgs=' + msgCount);
        try { aisWs.close(); } catch {}
        resolve();
      });
    });

    // Worker am Leben halten solange WebSocket-Verbindungen aktiv sind
    ctx.waitUntil(done);

    return new Response(null, {
      status: 101,
      webSocket: browserSide,
      headers: { 'Access-Control-Allow-Origin': '*' },
    });
  },
};
