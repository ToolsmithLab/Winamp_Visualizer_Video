"use strict";

const port = Number(process.argv[2] || 9361);
const expression =
  process.argv[3] ||
  `({
    snapshot: window.__avsRuntimeTest?.snapshot(),
    video: window.__avsRuntimeTest?.videoLayerState(),
    progress: window.__avsRuntimeTest?.exportProgressHistory()
  })`;

async function main() {
  const targets = await (
    await fetch(`http://127.0.0.1:${port}/json/list`)
  ).json();
  const page = targets.find((target) => target.type === "page");
  if (!page) throw new Error("Pagina CDP non trovata.");
  const socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  const response = await new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("Timeout risposta CDP.")),
      30_000
    );
    socket.addEventListener(
      "message",
      (event) => {
        const message = JSON.parse(String(event.data));
        if (message.id !== 1) return;
        clearTimeout(timer);
        resolve(message);
      }
    );
    socket.send(
      JSON.stringify({
        id: 1,
        method: "Runtime.evaluate",
        params: {
          expression,
          returnByValue: true,
          awaitPromise: true
        }
      })
    );
  });
  socket.close();
  if (response.error || response.result?.exceptionDetails) {
    throw new Error(
      JSON.stringify(response.error || response.result.exceptionDetails)
    );
  }
  console.log(JSON.stringify(response.result.result.value, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
