'use strict';
/*
  Verbindung zwischen großem Bildschirm und Handys.

  Normalfall: Supabase Realtime "Broadcast" über die Zugangsdaten aus
  ../config.js. Es wird nichts in der Datenbank gespeichert, die Nachrichten
  laufen nur live durch einen Kanal pro Raumcode.

  Testmodus: Mit ?lokal in der Adresse laufen die Nachrichten per
  BroadcastChannel zwischen Tabs im selben Browser. So lässt sich alles an
  einem Computer ausprobieren, ganz ohne Server.
*/
const Net = (() => {
  const params = new URLSearchParams(location.search);
  const forceLocal = params.has('lokal');
  const cfg = () => window.HEART_CONFIG || {};

  function available() {
    const c = cfg();
    return forceLocal || Boolean(c.supabaseUrl && c.supabaseAnonKey && 'WebSocket' in window);
  }

  function connect(room, onMessage, onStatus) {
    const topic = 'kopfnuss-' + room;
    return forceLocal ? local(topic, onMessage, onStatus) : supabase(topic, onMessage, onStatus);
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

  return { connect, available, forceLocal };
})();
