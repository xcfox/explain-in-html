export function esc(s) {
  return String(s).replace(/[&<>"]/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[m]));
}

export function escapeScriptJson(data) {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
