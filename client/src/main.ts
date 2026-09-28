import { connect } from "./net/connection";

const status = document.getElementById("status");

function setStatus(text: string) {
  if (status) status.textContent = text;
}

try {
  const room = await connect();
  console.log(`connected: ${room.sessionId}`);
  setStatus(`connected: ${room.sessionId}`);
  room.onLeave(() => setStatus("disconnected"));
} catch (err) {
  console.error("connection failed", err);
  setStatus("connection failed — is the server running?");
}
