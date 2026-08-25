const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const app = fs.readFileSync(path.join(root, "src", "renderer", "app.ts"), "utf8");
const css = fs.readFileSync(path.join(root, "src", "renderer", "styles.css"), "utf8");
const preview = fs.readFileSync(
  path.join(root, "src", "renderer", "previewRenderer.ts"),
  "utf8"
);
const cover = fs.readFileSync(
  path.join(root, "src", "engine", "composition", "coverCommands.ts"),
  "utf8"
);

test("right stage 01 - workspace contiene stage e pannello Layer destro fisso", () => {
  const workspace = app.match(/<div class="stage-workspace">([\s\S]*?)<\/aside>\s*<\/div>/)?.[1];
  assert.ok(workspace);
  assert.match(workspace, /id="stage-viewport"/);
  assert.match(workspace, /id="video-stage-frame"/);
  assert.match(workspace, /class="simple-layer-selector"/);
  assert.match(css, /\.stage-workspace\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s*184px/);
  assert.match(css, /\.simple-layer-selector\s*\{[\s\S]*width:\s*184px/);
  assert.doesNotMatch(css, /\.stage-workspace\s*\{[^}]*flex-wrap/);
});

test("right stage 02 - waveform e transport seguono e non appartengono allo stage", () => {
  const stageWorkspaceEnd = app.indexOf("</aside>\n        </div>", app.indexOf('class="stage-workspace"'));
  const waveform = app.indexOf('class="simple-waveform"', stageWorkspaceEnd);
  const transport = app.indexOf('class="transport"', waveform);
  assert.ok(stageWorkspaceEnd > 0);
  assert.ok(waveform > stageWorkspaceEnd);
  assert.ok(transport > waveform);
  assert.match(css, /\.stage\s*\{[\s\S]*grid-template-rows:\s*48px minmax\(0,\s*1fr\) 52px 62px 22px/);
});

test("right stage 03 - stage ha bordo, margini e workspace distinto", () => {
  assert.match(css, /\.stage-workspace\s*\{[\s\S]*padding:\s*14px 18px/);
  assert.match(css, /\.stage-viewport\s*\{[\s\S]*place-items:\s*center/);
  assert.match(css, /\.video-stage-frame\s*\{[\s\S]*border:\s*2px solid/);
  assert.match(css, /\.video-stage-frame::after\s*\{[\s\S]*content:\s*"AREA VIDEO"/);
  assert.match(css, /\.stage-viewport\s*\{[\s\S]*overflow:\s*hidden/);
});

test("right stage 04 - quattro rapporti definiscono preview, HD e Full HD coerenti", () => {
  const expected = [
    ['"9:16"', "1080, height: 1920", "540, height: 960"],
    ['"1:1"', "1080, height: 1080", "720, height: 720"],
    ['"4:3"', "1440, height: 1080", "720, height: 540"],
    ['"16:9"', "1920, height: 1080", "960, height: 540"]
  ];
  for (const [format, full, previewSize] of expected) {
    const block = app.match(new RegExp(`${format}: \\{([\\s\\S]*?)\\n  \\}`))?.[1];
    assert.ok(block, `Formato mancante: ${format}`);
    assert.ok(block.includes(full), `Full HD errato: ${format}`);
    assert.ok(block.includes(previewSize), `Preview errata: ${format}`);
  }
  assert.match(app, /project\.canvas\.width = resolution\.width/);
  assert.match(app, /project\.exportSettings\.width = resolution\.width/);
  assert.match(app, /controls\.simpleExportRatio\.value = format/);
});

test("right stage 05 - resize conserva rapporto e non modifica coordinate progetto", () => {
  assert.match(app, /const fitWidth = Math\.min\(\s*availableWidth,\s*availableHeight \* definition\.ratio/);
  assert.match(app, /const fitHeight = fitWidth \/ definition\.ratio/);
  assert.match(app, /new ResizeObserver\(\(\) => syncStageLayout\(\)\)/);
  const layout = app.match(/function syncStageLayout\(\): void \{([\s\S]*?)\n\}/)?.[1] ?? "";
  assert.doesNotMatch(layout, /projectState\.update|transform\./);
});

test("right stage 06 - zoom editor non modifica formato, export o trasformazioni", () => {
  for (const id of [
    "preview-zoom-fit",
    "preview-zoom-100",
    "preview-zoom-out",
    "preview-zoom-in"
  ]) assert.ok(app.includes(`id="${id}"`));
  const zoom = app.match(/function setPreviewZoom\([\s\S]*?\n\}/)?.[0] ?? "";
  assert.match(zoom, /previewZoom =/);
  assert.match(zoom, /syncStageLayout\(\)/);
  assert.doesNotMatch(zoom, /projectState|exportSettings|transform/);
});

test("right stage 07 - layer attivo è esplicito e lock è attivo per default", () => {
  assert.match(app, /data-layer-state>ASSENTE/);
  assert.match(app, /\? "ATTIVO"/);
  assert.match(app, /id="simple-layer-selection-lock" type="checkbox" checked/);
  assert.match(preview, /private selectionLocked = true/);
  assert.match(preview, /if \(this\.selectionLocked\) \{\s*if \(!selectedContainsPoint\) return/);
});

test("right stage 08 - guide sono editor-only e disattivabili", () => {
  assert.match(app, /id="simple-stage-guides" type="checkbox" checked/);
  assert.match(preview, /private editorGuidesVisible = true/);
  assert.match(preview, /if \(!this\.editorGuidesVisible\) return/);
  assert.match(preview, /this\.context\.strokeRect\(/);
});

test("right stage 09 - cover adatta usa tutto lo stage e viene centrata", () => {
  assert.match(cover, /fittedCoverSize\([\s\S]*?1,\s*1\s*\)/);
  assert.match(cover, /loadCoverIntoProject[\s\S]*?fitCoverToCanvas\(project, image\);[\s\S]*?centerCover\(project\)/);
  assert.match(cover, /x:\s*0\.5,\s*y:\s*0\.5/);
});

test("right stage 10 - pannello resta a destra anche nei breakpoint stretti", () => {
  assert.match(css, /@media \(max-width: 1200px\)[\s\S]*?\.stage-workspace\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\) 172px/);
  assert.match(css, /@media \(max-width: 980px\)[\s\S]*?\.stage-workspace\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\) 160px/);
});
