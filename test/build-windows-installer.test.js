"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const REPO_ROOT = path.join(__dirname, "..");
const BUILD_SCRIPT = path.join(REPO_ROOT, "scripts", "build-windows-installer.js");

function commandAvailable(command) {
  try {
    execFileSync(process.platform === "win32" ? "where" : "which", [command], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function wixAvailable() {
  if (process.env.WIX_EXE && fs.existsSync(process.env.WIX_EXE)) return true;
  if (commandAvailable("wix") || commandAvailable("wix.exe")) return true;
  return fs.existsSync(path.join(process.env.ProgramFiles || "C:\\Program Files", "WiX Toolset v7.0", "bin", "wix.exe"));
}

function queryMsi(msiPath, sql) {
  const scriptPath = path.join(os.tmpdir(), `kurspilot-msi-query-${process.pid}-${Date.now()}.vbs`);
  fs.writeFileSync(scriptPath, [
    'Set installer = CreateObject("WindowsInstaller.Installer")',
    'Set db = installer.OpenDatabase(WScript.Arguments(0), 0)',
    'Set view = db.OpenView(WScript.Arguments(1))',
    'view.Execute',
    'Do',
    '  Set rec = view.Fetch',
    '  If rec Is Nothing Then Exit Do',
    '  line = ""',
    '  For i = 1 To rec.FieldCount',
    '    If i > 1 Then line = line & vbTab',
    '    line = line & rec.StringData(i)',
    '  Next',
    '  WScript.Echo line',
    'Loop',
    '',
  ].join("\r\n"));
  try {
    const output = execFileSync("cscript", ["//nologo", scriptPath, msiPath, sql], { encoding: "utf8" });
    return output.trim().split(/\r?\n/).filter(Boolean).map(line => line.split("\t"));
  } finally {
    fs.rmSync(scriptPath, { force: true });
  }
}

test("build-windows-installer: baut ein nutzerweites MSI mit sichtbarem Konfigurationsabschluss", { timeout: 180000 }, t => {
  if (process.platform !== "win32") {
    t.skip("Windows-Installer-Build wird nur unter Windows geprüft");
    return;
  }
  if (!wixAvailable()) {
    t.skip("WiX Toolset nicht verfuegbar - Windows-MSI-Build wird uebersprungen");
    return;
  }

  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "kurspilot-windows-installer-test-"));
  const stdout = execFileSync(process.execPath, [BUILD_SCRIPT, "--output", outputDir], { encoding: "utf8" });

  const payloadDir = path.join(outputDir, "payload");
  const msiPath = path.join(outputDir, "Kurspilot.msi");
  const wxsPath = path.join(outputDir, "Kurspilot.wxs");

  assert.match(stdout, /Kurspilot\.msi/);
  assert.ok(fs.existsSync(msiPath), "MSI sollte erzeugt werden");
  assert.ok(!fs.existsSync(path.join(outputDir, "Kurspilot-Windows-Setup.cmd")), "CMD darf nicht mehr das Endartefakt sein");
  assert.ok(!fs.existsSync(path.join(outputDir, "Kurspilot-Windows.zip")), "ZIP darf nicht das Endartefakt sein");

  for (const entry of [
    "moodle-mcp.js",
    "scripts/setup-kurspilot.js",
    "scripts/start-mcp.js",
    "lib/setup-browser-server.js",
    "assets/setup/token-help.svg",
    "bin/kurspilot-setup.cmd",
    "bin/kurspilot-setup.vbs",
    "runtime/node.exe",
  ]) {
    assert.ok(fs.existsSync(path.join(payloadDir, entry)), "Payload sollte " + entry + " enthalten");
  }
  assert.ok(!fs.existsSync(path.join(payloadDir, "Plugin")), "Payload sollte keine Moodle-Plugin-Dateien enthalten");

  const wxs = fs.readFileSync(wxsPath, "utf8");
  assert.match(wxs, /WixUI_Minimal/, "MSI sollte einen Standard-Windows-Installer-Dialog nutzen");
  assert.match(wxs, /WelcomeDlg[\s\S]*VerifyReadyDlg/, "License-Dialog sollte uebersprungen werden");
  assert.doesNotMatch(wxs, /LicenseAgreementDlg/, "Kurspilot hat keine gesonderte Lizenzvereinbarung im Installer");
  assert.match(wxs, /WIXUI_EXITDIALOGOPTIONALCHECKBOXTEXT/, "Abschlussdialog sollte eine Start-Checkbox anbieten");
  assert.match(wxs, /Kurspilot-Konfiguration nach dem Schliessen starten/, "Checkbox sollte den Konfigurationsstart klar benennen");
  assert.doesNotMatch(wxs, /InstallExecuteSequence[\s\S]*LaunchKurspilotAfterInstall/, "Konfiguration darf nicht versteckt im ExecuteSequence-Ende starten");

  const launchAction = queryMsi(msiPath, "SELECT `Action`,`Type`,`Source`,`Target` FROM `CustomAction` WHERE `Action`='LaunchKurspilotAfterInstall'");
  assert.deepStrictEqual(launchAction, [[
    "LaunchKurspilotAfterInstall",
    "226",
    "INSTALLFOLDER",
    'wscript.exe "[INSTALLFOLDER]bin\\kurspilot-setup.vbs" --after-install',
  ]]);

  const exitLaunch = queryMsi(msiPath, "SELECT `Dialog_`,`Control_`,`Event`,`Argument`,`Condition` FROM `ControlEvent` WHERE `Dialog_`='ExitDialog' AND `Control_`='Finish' AND `Event`='DoAction'");
  assert.ok(exitLaunch.some(row => row.includes("LaunchKurspilotAfterInstall")), "Finish sollte bei gesetzter Checkbox das Konfigurationsprogramm starten");

  const welcomeNext = queryMsi(msiPath, "SELECT `Dialog_`,`Control_`,`Event`,`Argument` FROM `ControlEvent` WHERE `Dialog_`='WelcomeDlg' AND `Control_`='Next' AND `Argument`='VerifyReadyDlg'");
  assert.ok(welcomeNext.length > 0, "Welcome -> Weiter sollte direkt zur Installationsbereitschaft gehen, nicht zur Lizenzseite");

  const shortcut = queryMsi(msiPath, "SELECT `Shortcut`,`Name`,`Target` FROM `Shortcut` WHERE `Shortcut`='KurspilotConfigureShortcut'");
  assert.strictEqual(shortcut.length, 1);
  assert.match(shortcut[0][1], /Kurspilot konfigurieren/);
  assert.strictEqual(shortcut[0][2], "[INSTALLFOLDER]bin\\kurspilot-setup.vbs");

  const launcher = fs.readFileSync(path.join(payloadDir, "bin", "kurspilot-setup.vbs"), "utf8");
  assert.match(launcher, /shell\.Run cmd, 0, False/, "Startmenue-Launcher sollte kein sichtbares CMD-Fenster oeffnen");

  const legacyCleanup = queryMsi(msiPath, "SELECT `FileKey`,`DirProperty`,`FileName`,`InstallMode` FROM `RemoveFile` WHERE `FileKey`='RemoveLegacyStartMenuShortcut'");
  assert.strictEqual(legacyCleanup.length, 1);
  assert.strictEqual(legacyCleanup[0][0], "RemoveLegacyStartMenuShortcut");
  assert.strictEqual(legacyCleanup[0][1], "ProgramMenuFolder");
  assert.match(legacyCleanup[0][2], /Kurspilot konfigurieren\.lnk/);
  assert.strictEqual(legacyCleanup[0][3], "3");
});