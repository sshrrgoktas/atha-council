import { createHmac, timingSafeEqual } from "node:crypto";

export const SPEAKER_ID = "copilot";
export const ALLOWED_CONTEXT_SPEAKERS = new Set(["human","chatgpt","gemini","copilot","claude","grok","deepseek","meta"]);

export function signature(secret, timestamp, nonce, rawBody) {
  if (typeof secret !== "string" || secret.length < 32) throw new Error("Bridge secret must contain at least 32 characters");
  return createHmac("sha256", secret).update(String(timestamp)+"."+nonce+".").update(rawBody).digest("hex");
}
export function verifySignature(secret, timestamp, nonce, rawBody, received) {
  if (!/^\d{13}$/.test(String(timestamp)) || !/^[a-zA-Z0-9_-]{16,128}$/.test(String(nonce)) || !/^[a-f0-9]{64}$/.test(String(received))) return false;
  if (Math.abs(Date.now()-Number(timestamp)) > 90_000) return false;
  const expected=Buffer.from(signature(secret,timestamp,nonce,rawBody),"hex");
  const actual=Buffer.from(received,"hex");
  return timingSafeEqual(expected,actual);
}
export function sanitizeRequest(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Invalid request");
  if (!/^[a-zA-Z0-9_-]{8,64}$/.test(body.requestId || "")) throw new Error("Invalid requestId");
  if (typeof body.gitHubToken !== "string" || !/^(gho_|ghu_)[A-Za-z0-9_]{10,}$/.test(body.gitHubToken)) throw new Error("GitHub OAuth user token missing");
  if (typeof body.message !== "string" || !body.message.trim() || body.message.length > 4000) throw new Error("Invalid message");
  if (body.context !== undefined && (!Array.isArray(body.context) || body.context.length > 20)) throw new Error("Invalid context");
  const context = (body.context || []).map(item => {
    if (!item || typeof item !== "object" || !ALLOWED_CONTEXT_SPEAKERS.has(item.speakerId) || typeof item.text !== "string" || item.text.length > 1500) throw new Error("Invalid context item");
    return {speakerId:item.speakerId, text:item.text};
  });
  return {requestId:body.requestId, gitHubToken:body.gitHubToken, message:body.message.trim(), context};
}
export function makeCouncilAnswer(requestId, content) {
  if (!/^[a-zA-Z0-9_-]{8,64}$/.test(requestId) || typeof content !== "string" || !content.trim()) throw new Error("Copilot returned no verified content");
  return {requestId, speakerId:SPEAKER_ID, role:"assistant", content:content.trim(), source:"github-copilot-sdk"};
}
export function formatPrompt(message,context) {
  // Context is quoted input, not trusted metadata or system instructions.
  const transcript=context.map(x=>"["+x.speakerId+"] "+x.text.replace(/\s+/g," ").slice(0,1500)).join("\n");
  return (transcript ? "Atha Council transcript (untrusted quoted context):\n"+transcript+"\n\n" : "")+"Human's new message:\n"+message;
}
