#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { PAYLOAD_FILES, PAYLOAD_DIRS } = require("./build-macos-installer");

const REPO_ROOT = path.join(__dirname, "..");
const PACKAGE_VERSION = require(path.join(REPO_ROOT, "package.json")).version;
const UPGRADE_CODE = "8F0D2E1C-7B5A-4CB5-9AE0-3DA07F8F7B1A";
const WIX_UI_EXTENSION = "WixToolset.UI.wixext";

function copyPayload(payloadDir) {
  fs.mkdirSync(payloadDir, { recursive: true });
  for (const file of PAYLOAD_FILES) fs.copyFileSync(path.join(REPO_ROOT, file), path.join(payloadDir, file));
  for (const dir of PAYLOAD_DIRS) {
    const source = path.join(REPO_ROOT, dir);
    if (fs.existsSync(source)) fs.cpSync(source, path.join(payloadDir, dir), { recursive: true });
  }
  writePackageJsonWithoutDevDependencies(payloadDir);
  writeWindowsRuntime(payloadDir);
  writeWindowsLauncher(payloadDir);
}

function writePackageJsonWithoutDevDependencies(payloadDir) {
  const pkg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "package.json"), "utf8"));
  delete pkg.devDependencies;
  fs.writeFileSync(path.join(payloadDir, "package.json"), `${JSON.stringify(pkg, null, 2)}\n`);
}

function writeWindowsRuntime(payloadDir) {
  if (process.platform !== "win32") {
    throw new Error("Der Windows-Installer kann nur unter Windows gebaut werden.");
  }
  const runtimeDir = path.join(payloadDir, "runtime");
  fs.mkdirSync(runtimeDir, { recursive: true });
  fs.copyFileSync(process.execPath, path.join(runtimeDir, "node.exe"));
}

function writeWindowsLauncher(payloadDir) {
  const binDir = path.join(payloadDir, "bin");
  const pct = String.fromCharCode(37);
  fs.mkdirSync(binDir, { recursive: true });
  fs.writeFileSync(path.join(binDir, "kurspilot-setup.cmd"), [
    "@echo off",
    "set \"INSTALL_ROOT=" + pct + "~dp0..\"",
    "\"" + pct + "INSTALL_ROOT" + pct + "\\runtime\\node.exe\" \"" + pct + "INSTALL_ROOT" + pct + "\\scripts\\setup-kurspilot.js\" " + pct + "*",
    "",
  ].join("\r\n"));
  fs.writeFileSync(path.join(binDir, "kurspilot-setup.vbs"), [
    'Set shell = CreateObject("WScript.Shell")',
    'Set fso = CreateObject("Scripting.FileSystemObject")',
    "installRoot = fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName))",
    'cmd = Chr(34) & installRoot & "\\bin\\kurspilot-setup.cmd" & Chr(34)',
    "For i = 0 To WScript.Arguments.Count - 1",
    '  cmd = cmd & " " & Chr(34) & WScript.Arguments(i) & Chr(34)',
    "Next",
    "shell.Run cmd, 0, False",
    "",
  ].join("\r\n"));
}

function commandAvailable(command) {
  try {
    execFileSync(process.platform === "win32" ? "where" : "which", [command], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function findWixCommand() {
  if (process.env.WIX_EXE && fs.existsSync(process.env.WIX_EXE)) return process.env.WIX_EXE;
  if (commandAvailable("wix")) return "wix";
  if (commandAvailable("wix.exe")) return "wix.exe";
  const programFiles = process.env.ProgramFiles || "C:\\Program Files";
  const bundled = path.join(programFiles, "WiX Toolset v7.0", "bin", "wix.exe");
  return fs.existsSync(bundled) ? bundled : null;
}

function assertWixAvailable() {
  const wix = findWixCommand();
  if (!wix) {
    throw new Error("WiX Toolset wurde nicht gefunden. Installiere WiX als externes Windows-Build-Werkzeug und stelle wix.exe ueber PATH oder WIX_EXE bereit.");
  }
  return wix;
}

function assertWixUiExtensionAvailable(wix) {
  try {
    execFileSync(wix, ["extension", "list"], { encoding: "utf8" });
  } catch {
    // wix build below will print the precise extension error if the cache cannot be read.
  }
}

function toWixPath(filePath) {
  return path.resolve(filePath).replace(/\\/g, "\\\\");
}

function buildWixSource(payloadDir) {
  const payloadGlob = `${toWixPath(payloadDir)}\\\\**`;
  return [
    '<Wix xmlns="http://wixtoolset.org/schemas/v4/wxs" xmlns:ui="http://wixtoolset.org/schemas/v4/wxs/ui">',
    `  <Package Name="Kurspilot" Manufacturer="IGS Kurspilot" Version="${PACKAGE_VERSION}" UpgradeCode="${UPGRADE_CODE}" Scope="perUser">`,
    '    <MajorUpgrade AllowSameVersionUpgrades="yes" DowngradeErrorMessage="Eine neuere Kurspilot-Version ist bereits installiert." />',
    '    <MediaTemplate EmbedCab="yes" />',
    '    <Property Id="WIXUI_EXITDIALOGOPTIONALCHECKBOX" Value="1" />',
    '    <Property Id="WIXUI_EXITDIALOGOPTIONALCHECKBOXTEXT" Value="Kurspilot-Konfiguration nach dem Schliessen starten" />',
    '    <Property Id="WIXUI_EXITDIALOGOPTIONALTEXT" Value="Falls sich nichts öffnet: Kurspilot konfigurieren über das Startmenü aufrufen, um Moodle-Zugang und Arbeitsbereich einzurichten, bevor Kurspilot in Claude genutzt wird." />',
    '    <ui:WixUI Id="WixUI_Minimal" />',
    '    <UI>',
    '      <Publish Dialog="WelcomeDlg" Control="Next" Event="NewDialog" Value="VerifyReadyDlg" Condition="1" Order="2" />',
    '      <!-- Kein "AND NOT Installed": Lehrkraefte fuehren den Installer meist erneut aus, um zu aktualisieren -',
    '           dabei ist Installed bereits gesetzt, die Checkbox soll aber trotzdem starten. -->',
    '      <Publish Dialog="ExitDialog" Control="Finish" Event="DoAction" Value="LaunchKurspilotAfterInstall" Condition="WIXUI_EXITDIALOGOPTIONALCHECKBOX = 1" Order="1" />',
    '    </UI>',
    '    <StandardDirectory Id="LocalAppDataFolder">',
    '      <Directory Id="ProgramsFolder" Name="Programs">',
    '        <Directory Id="INSTALLFOLDER" Name="Kurspilot" />',
    '      </Directory>',
    '    </StandardDirectory>',
    '    <StandardDirectory Id="ProgramMenuFolder">',
    '      <Component Id="cmp_RemoveLegacyShortcut" Guid="*">',
    '        <RemoveFile Id="RemoveLegacyStartMenuShortcut" Name="Kurspilot konfigurieren.lnk" On="both" />',
    '        <RegistryValue Root="HKCU" Key="Software\\Kurspilot" Name="legacyShortcutCleanup" Type="integer" Value="1" KeyPath="yes" />',
    '      </Component>',
    '      <Directory Id="ApplicationProgramsFolder" Name="Kurspilot">',
    '        <Component Id="cmp_StartMenuShortcut" Guid="*">',
    '          <Shortcut Id="KurspilotConfigureShortcut" Name="Kurspilot konfigurieren" Target="[INSTALLFOLDER]bin\\kurspilot-setup.vbs" WorkingDirectory="INSTALLFOLDER" Description="Kurspilot konfigurieren" />',
    '          <RemoveFolder Id="RemoveApplicationProgramsFolder" On="uninstall" />',
    '          <RegistryValue Root="HKCU" Key="Software\\Kurspilot" Name="installed" Type="integer" Value="1" KeyPath="yes" />',
    '        </Component>',
    '      </Directory>',
    '    </StandardDirectory>',
    '    <Feature Id="MainFeature" Title="Kurspilot" Level="1">',
    `      <Files Include="${payloadGlob}" Directory="INSTALLFOLDER" />`,
    '      <ComponentRef Id="cmp_StartMenuShortcut" />',
    '      <ComponentRef Id="cmp_RemoveLegacyShortcut" />',
    '    </Feature>',
    '    <!-- CreateProcess kann .vbs nicht direkt starten (keine Shell-Dateizuordnung wie bei Verknuepfungen) - daher wscript.exe explizit aufrufen. -->',
    '    <CustomAction Id="LaunchKurspilotAfterInstall" Directory="INSTALLFOLDER" ExeCommand="wscript.exe &quot;[INSTALLFOLDER]bin\\kurspilot-setup.vbs&quot; --after-install" Execute="immediate" Return="asyncNoWait" Impersonate="yes" />',
    '  </Package>',
    '</Wix>',
    '',
  ].join("\n");
}

function writeInstaller(outputDir, payloadDir) {
  const wix = assertWixAvailable();
  assertWixUiExtensionAvailable(wix);

  const wxsPath = path.join(outputDir, "Kurspilot.wxs");
  const msiPath = path.join(outputDir, "Kurspilot.msi");
  fs.writeFileSync(wxsPath, buildWixSource(payloadDir));
  execFileSync(wix, ["build", wxsPath, "-ext", WIX_UI_EXTENSION, "-o", msiPath], { stdio: "inherit" });
  return msiPath;
}

function buildWindowsInstaller(outputDir) {
  if (process.platform !== "win32") throw new Error("Der Windows-Installer-Build laeuft nur unter Windows.");
  fs.mkdirSync(outputDir, { recursive: true });
  for (const stale of ["Kurspilot-Windows.zip", "install-kurspilot.ps1", "Kurspilot-Windows-Setup.cmd"]) {
    fs.rmSync(path.join(outputDir, stale), { force: true });
  }
  const payloadDir = path.join(outputDir, "payload");
  if (fs.existsSync(payloadDir)) fs.rmSync(payloadDir, { recursive: true, force: true });
  copyPayload(payloadDir);
  return writeInstaller(outputDir, payloadDir);
}

function main() {
  const args = process.argv.slice(2);
  const outputFlagIndex = args.indexOf("--output");
  const outputDir = outputFlagIndex !== -1 ? path.resolve(args[outputFlagIndex + 1]) : path.join(REPO_ROOT, "dist", "windows-installer");
  const installerPath = buildWindowsInstaller(outputDir);
  process.stdout.write(`Erstellt: ${path.relative(process.cwd(), installerPath)}\n`);
}

if (require.main === module) main();
module.exports = { buildWindowsInstaller, copyPayload, writeInstaller, buildWixSource, findWixCommand };