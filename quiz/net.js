'use strict';
/*
  Verbindung zwischen großem Bildschirm und Handys.

  Normalfall: direkte Verbindung (WebRTC über PeerJS). Bildschirm und Handys
  finden sich einmal über den kostenlosen öffentlichen PeerJS-Vermittlungsdienst,
  danach laufen alle Nachrichten direkt zwischen den Geräten, im selben WLAN
  also gar nicht mehr übers Internet. Kein Konto, nichts einzurichten.
  Der Bildschirm meldet sich unter dem Namen "kopfnuss-<raumcode>" an, die
  Handys verbinden sich mit diesem Namen.

  Mit ?supabase in der Adresse läuft es stattdessen über Supabase Realtime
  (Zugangsdaten aus ../config.js).

  Testmodus: Mit ?lokal in der Adresse laufen die Nachrichten per
  BroadcastChannel zwischen Tabs im selben Browser, ganz ohne Server.

  connect(raum, beiNachricht, beiStatus, rolle): rolle ist 'host' (Bildschirm)
  oder 'client' (Handy). Status: connecting, open, reconnecting, error,
  taken (Raumcode schon vergeben), notfound (kein Bildschirm mit diesem Code).
*/
const Net = (() => {
  const params = new URLSearchParams(location.search);
  const forceLocal = params.has('lokal');
  const useSupabase = params.has('supabase');
  const cfg = () => window.HEART_CONFIG || {};
  const mode = forceLocal ? 'lokal' : useSupabase ? 'supabase' : 'direkt';

  function available() {
    const c = cfg();
    if (mode === 'lokal') return true;
    if (mode === 'supabase') return Boolean(c.supabaseUrl && c.supabaseAnonKey && 'WebSocket' in window);
    return Boolean(window.Peer && window.RTCPeerConnection);
  }

  function connect(room, onMessage, onStatus, role = 'client') {
    const topic = 'kopfnuss-' + room;
    if (mode === 'lokal') return local(topic, onMessage, onStatus);
    if (mode === 'supabase') return supabase(topic, onMessage, onStatus);
    return direct(topic.toLowerCase(), onMessage, onStatus, role);
  }

  /* Direkte Verbindung über WebRTC. Der Bildschirm hält eine Verbindung pro Handy. */
  function direct(hostId, onMessage, onStatus, role) {
    const none = { send() {}, close() {} };
    if (!window.Peer) { setTimeout(() => onStatus('error'), 0); return none; }
    const opts = Object.assign({
      debug: 0,
      config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:global.stun.twilio.com:3478' }] }
    }, window.KOPFNUSS_PEER || {});   // KOPFNUSS_PEER: eigener PeerJS-Server, z. B. zum Testen
    let peer = null, closed = false, retryTimer = 0, openTimer = 0, failures = 0;
    const conns = new Set();
    let hostConn = null;
    const status = s => { if (!closed) onStatus(s); };

    function retry(ms) {
      clearTimeout(retryTimer);
      retryTimer = setTimeout(() => { if (!closed) open(); }, ms);
    }

    function open() {
      if (peer && !peer.destroyed) { try { peer.destroy(); } catch { /* egal */ } }
      conns.clear(); hostConn = null;
      status(failures ? 'reconnecting' : 'connecting');
      try { peer = role === 'host' ? new window.Peer(hostId, opts) : new window.Peer(opts); } catch { failures++; status('error'); return retry(4000); }
      // Bildschirm: antwortet der Vermittlungsdienst nicht auf die Anmeldung, lieber einen neuen Raumcode würfeln
      clearTimeout(openTimer);
      if (role === 'host') { const mine = peer; openTimer = setTimeout(() => { if (peer === mine && !mine.open && !mine.destroyed) status('taken'); }, 8000); }

      peer.on('open', () => {
        clearTimeout(openTimer);
        if (role === 'host') { failures = 0; status('open'); }
        else dial();
      });
      peer.on('connection', c => {
        if (role !== 'host') return c.close();
        c.on('open', () => conns.add(c));
        c.on('data', d => onMessage(d));
        const drop = () => conns.delete(c);
        c.on('close', drop); c.on('error', drop);
      });
      peer.on('disconnected', () => {
        // Verbindung zum Vermittlungsdienst verloren. Bestehende Direktverbindungen laufen weiter.
        if (closed || peer.destroyed) return;
        status('reconnecting');
        setTimeout(() => { if (!closed && peer && !peer.destroyed && peer.disconnected) { try { peer.reconnect(); } catch { open(); } } }, 1500);
      });
      peer.on('error', e => {
        const type = e && e.type;
        if (type === 'unavailable-id') { status('taken'); return; }        // Raumcode ist schon vergeben
        if (type === 'peer-unavailable') { status('notfound'); return retry(3000); }   // Bildschirm noch nicht da
        if (type === 'browser-incompatible') { status('error'); return; }
        failures++;
        status(failures >= 3 ? 'error' : 'reconnecting');
        retry(Math.min(8000, 1200 * failures));
      });
    }

    function dial() {
      const c = peer.connect(hostId, { reliable: true, serialization: 'json' });
      hostConn = c;
      const lost = () => {
        if (hostConn !== c || closed) return;
        hostConn = null;
        failures++;
        status('reconnecting');
        retry(1500);
      };
      c.on('open', () => { failures = 0; status('open'); });
      c.on('data', d => onMessage(d));
      c.on('close', lost);
      c.on('error', lost);
    }

    open();
    return {
      send(m) {
        if (role === 'host') conns.forEach(c => { if (c.open) { try { c.send(m); } catch { /* egal */ } } });
        else if (hostConn && hostConn.open) { try { hostConn.send(m); } catch { /* egal */ } }
      },
      /* Handy kommt aus dem Standby zurück: ist die Verbindung weg, sofort neu aufbauen */
      wake() { if (!closed && role !== 'host' && !(hostConn && hostConn.open)) { failures = 0; open(); } },
      close() { closed = true; clearTimeout(retryTimer); clearTimeout(openTimer); try { peer && peer.destroy(); } catch { /* egal */ } }
    };
  }

  function local(topic, onMessage, onStatus) {
    let bc;
    try { bc = new BroadcastChannel(topic); } catch { setTimeout(() => onStatus('error'), 0); return { send() {}, close() {} }; }
    bc.onmessage = e => onMessage(e.data);
    setTimeout(() => onStatus('open'), 0);
    return { send: m => bc.postMessage(m), close: () => bc.close() };
  }

  /* Schlanker Client für das Realtime-Protokoll von Supabase (Phoenix-Kanäle). */
  function supabase(topic, onMessage, onStatus) {
    const c = cfg();
    if (!c.supabaseUrl || !c.supabaseAnonKey) { setTimeout(() => onStatus('error'), 0); return { send() {}, close() {} }; }
    const url = c.supabaseUrl.replace(/\/$/, '').replace(/^http/, 'ws') +
      '/realtime/v1/websocket?apikey=' + encodeURIComponent(c.supabaseAnonKey) + '&vsn=1.0.0';
    const full = 'realtime:' + topic;
    let ws = null, ref = 0, joinRef = null, joined = false, heartbeat = null, closed = false, failures = 0;
    const queue = [];

    const raw = m => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(m)); };

    function open() {
      onStatus(failures ? 'reconnecting' : 'connecting');
      try { ws = new WebSocket(url); } catch { return retry(); }
      ws.onopen = () => {
        joinRef = String(++ref);
        raw({
          topic: full, event: 'phx_join', ref: joinRef, join_ref: joinRef,
          payload: {
            config: { broadcast: { ack: false, self: false }, presence: { key: '' }, postgres_changes: [], private: false },
            access_token: c.supabaseAnonKey
          }
        });
        heartbeat = setInterval(() => raw({ topic: 'phoenix', event: 'heartbeat', payload: {}, ref: String(++ref) }), 25000);
      };
      ws.onmessage = e => {
        let m; try { m = JSON.parse(e.data); } catch { return; }
        if (m.event === 'phx_reply' && m.ref === joinRef) {
          if (m.payload && m.payload.status === 'ok') {
            joined = true; failures = 0; onStatus('open');
            queue.splice(0).forEach(send);
          } else { onStatus('error'); ws.close(); }
        } else if (m.event === 'broadcast' && m.payload && m.payload.event === 'msg') {
          onMessage(m.payload.payload);
        } else if ((m.event === 'phx_error' || m.event === 'phx_close') && m.topic === full) {
          ws.close();
        }
      };
      ws.onclose = () => { joined = false; clearInterval(heartbeat); if (!closed) retry(); };
      ws.onerror = () => { /* onclose folgt */ };
    }

    function retry() {
      failures++;
      onStatus(failures >= 3 ? 'error' : 'reconnecting');
      setTimeout(() => { if (!closed) open(); }, Math.min(8000, 700 * failures));
    }

    function send(msg) {
      if (!joined) { if (queue.length < 20) queue.push(msg); return; }
      raw({ topic: full, event: 'broadcast', ref: String(++ref), join_ref: joinRef, payload: { type: 'broadcast', event: 'msg', payload: msg } });
    }

    open();
    return { send, close() { closed = true; clearInterval(heartbeat); try { ws && ws.close(); } catch { /* egal */ } } };
  }

  return { connect, available, forceLocal, mode };
})();
