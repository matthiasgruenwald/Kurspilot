/**
 * kurspilot-sidecar.js
 *
 * Erzeugt personenbezogene Sidecar-Dateien getrennt von der teilbaren
 * Sachdatei (siehe docs/specs/0010, Abschnitt "Personenbezug und
 * Varianten"; CONTEXT.md, Begriff "Sidecar"). Ein Sidecar traegt
 * `kurspilot.personenbezug: true` in seinem eigenen Frontmatter und die
 * Sachdatei verweist sichtbar darauf.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const {
  buildFrontmatterBlock,
  readFrontmatterFile,
  todayIso,
  NOT_YET_PROVIDED,
} = require('./kurspilot-frontmatter');

function sidecarPathFor(mainFilePath) {
  const dir = path.dirname(mainFilePath);
  const ext = path.extname(mainFilePath);
  const stem = path.basename(mainFilePath, ext);
  return path.join(dir, `${stem}.personen${ext}`);
}

function ensureSidecarReference(mainFilePath, sidecarFileName) {
  const content = fs.readFileSync(mainFilePath, 'utf8');
  const marker = `Personenbezogene Ergaenzungen: siehe \`${sidecarFileName}\``;
  if (content.includes(marker)) {
    return;
  }
  const updated = `${content.replace(/\n+$/, '')}\n\n> ${marker}\n`;
  fs.writeFileSync(mainFilePath, updated, 'utf8');
}

/**
 * Legt ein personenbezogenes Sidecar neben `mainFilePath` an, z.B.
 * `CONTEXT.md` -> `CONTEXT.personen.md`. Uebernimmt type/title/about/
 * gradeLevel/weitergabe der Sachdatei als Ausgangspunkt (ueberschreibbar
 * ueber `fields.frontmatter`), setzt aber immer
 * `kurspilot.personenbezug: true`. Ueberschreibt kein vorhandenes
 * Sidecar.
 *
 * @param {string} mainFilePath Pfad zur teilbaren Sachdatei (muss Frontmatter besitzen)
 * @param {object} fields
 * @param {string} [fields.inhalt] Freitext-Koerper des Sidecars
 * @param {object} [fields.frontmatter] ueberschreibt einzelne Frontmatter-Felder
 * @returns {{sidecarPath: string, mainFilePath: string}}
 */
function createPersonenSidecar(mainFilePath, fields = {}) {
  const main = readFrontmatterFile(mainFilePath);
  const sidecarPath = sidecarPathFor(mainFilePath);

  if (fs.existsSync(sidecarPath)) {
    throw new Error(`Sidecar existiert bereits: ${sidecarPath}`);
  }

  const today = todayIso();
  const frontmatter = {
    type: main.data.type,
    title: `${main.data.title} (personenbezogen)`,
    tags: main.data.tags,
    status: main.data.status,
    created: today,
    updated: today,
    about: main.data.about,
    gradeLevel: main.data.gradeLevel || NOT_YET_PROVIDED,
    kurspilot: { personenbezug: true, weitergabe: 'nicht_weitergeben' },
    ...(fields.frontmatter || {}),
  };
  // Sicherheitsnetz: ein Override in fields.frontmatter.kurspilot darf nie
  // personenbezug auf false kippen - ein Sidecar ist per Definition
  // personenbezogen (siehe docs/specs/0010, "Personenbezug und Varianten").
  frontmatter.kurspilot = { ...frontmatter.kurspilot, personenbezug: true };

  const body = (fields.inhalt && fields.inhalt.trim())
    ? fields.inhalt.trim()
    : NOT_YET_PROVIDED;

  fs.writeFileSync(sidecarPath, `${buildFrontmatterBlock(frontmatter)}\n\n${body}\n`, 'utf8');
  ensureSidecarReference(mainFilePath, path.basename(sidecarPath));

  return { sidecarPath, mainFilePath };
}

module.exports = {
  createPersonenSidecar,
};
