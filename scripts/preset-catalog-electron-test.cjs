"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");

const port = Number(process.argv[2] || 9245);
const reportPath = path.resolve(
  process.argv[3] || "test-results/phase2/preset-catalog-electron.json"
);

class CdpClient {
  constructor(url) {
    this.socket = new WebSocket(url);
    this.nextId = 1;
    this.pending = new Map();
  }

  async open() {
    await new Promise((resolve, reject) => {
      this.socket.addEventListener("open", resolve, { once: true });
      this.socket.addEventListener("error", reject, { once: true });
    });
    this.socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      if (!message.id) return;
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message));
      else pending.resolve(message.result);
    });
  }

  async evaluate(expression) {
    const id = this.nextId++;
    const response = new Promise((resolve, reject) =>
      this.pending.set(id, { resolve, reject })
    );
    this.socket.send(
      JSON.stringify({
        id,
        method: "Runtime.evaluate",
        params: {
          expression,
          awaitPromise: true,
          returnByValue: true,
          userGesture: true
        }
      })
    );
    const result = await response;
    if (result.exceptionDetails) {
      throw new Error(
        result.exceptionDetails.exception?.description ||
          result.exceptionDetails.text
      );
    }
    return result.result.value;
  }

  close() {
    this.socket.close();
  }
}

async function main() {
  const targets = await fetch(`http://127.0.0.1:${port}/json`).then((response) =>
    response.json()
  );
  const target = targets.find(
    (entry) => entry.type === "page" && entry.url.includes("index.html")
  );
  if (!target) throw new Error("Pagina Electron del catalogo non trovata.");

  const client = new CdpClient(target.webSocketDebuggerUrl);
  await client.open();
  try {
    const result = await client.evaluate(`(async () => {
      const deadline = Date.now() + 10000;
      while (Date.now() < deadline) {
        const cards = document.querySelectorAll("[data-package-id]");
        if (cards.length > 0) break;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      const view = await window.avs.presetCatalogList();
      const card = document.querySelector("[data-package-id]");
      return {
        titlePresent: document.body.innerText.includes("Catalogo ufficiale"),
        personalWarningPresent:
          document.body.innerText.includes("responsabile dei diritti"),
        packageCount: view.packages.length,
        packageId: view.packages[0]?.id || "",
        sourceHttps: view.packages[0]?.sourceUrl.startsWith("https://") || false,
        license: view.packages[0]?.license || "",
        cardPresent: Boolean(card),
        actions: card
          ? Array.from(card.querySelectorAll("button")).map((button) =>
              button.textContent.trim()
            )
          : [],
        licenseTextLength: view.packages[0]
          ? (await window.avs.presetCatalogReadLicense(view.packages[0].id)).length
          : 0
      };
    })()`);

    if (
      !result.titlePresent ||
      !result.personalWarningPresent ||
      result.packageCount !== 1 ||
      !result.cardPresent ||
      !result.sourceHttps ||
      result.licenseTextLength < 1000
    ) {
      throw new Error(`Catalogo Electron incompleto: ${JSON.stringify(result)}`);
    }
    await fs.writeFile(
      reportPath,
      `${JSON.stringify({ generatedAt: new Date().toISOString(), ...result }, null, 2)}\n`
    );
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } finally {
    client.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
