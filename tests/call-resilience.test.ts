import test from "node:test";
import assert from "node:assert/strict";
import {MAX_RECONNECT_ATTEMPTS,RECONNECT_DELAYS_MS,reconnectDelayMs,mustReconnect,clampFloatingCall} from "../src/call-resilience";

test("reconnection delays rise smoothly and have a finite maximum",()=>{
 assert.equal(MAX_RECONNECT_ATTEMPTS,7);
 assert.equal(RECONNECT_DELAYS_MS.length,7);
 assert.equal(reconnectDelayMs(0),900);
 assert.equal(reconnectDelayMs(1),2200);
 assert.equal(reconnectDelayMs(4),10000);
 assert.equal(reconnectDelayMs(200),16000);
 assert.equal(reconnectDelayMs(-20),900);
});
test("restart only failed or disconnected WebRTC connections",()=>{
 assert.equal(mustReconnect("connected","connected"),false);
 assert.equal(mustReconnect("connecting","checking"),false);
 assert.equal(mustReconnect("disconnected","disconnected"),true);
 assert.equal(mustReconnect("failed","failed"),true);
 assert.equal(mustReconnect("connected","failed"),true);
});
test("floating call stays reachable even after screen resize or rotation",()=>{
 assert.deepEqual(clampFloatingCall(120,220,390,844,184,270),{x:120,y:220});
 assert.deepEqual(clampFloatingCall(-999,-999,390,844,184,270),{x:8,y:8});
 assert.deepEqual(clampFloatingCall(999,999,390,844,184,270),{x:198,y:566});
 assert.deepEqual(clampFloatingCall(999,999,250,320,184,270),{x:58,y:42});
});
