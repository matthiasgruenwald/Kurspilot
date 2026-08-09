'use strict';

/**
 * Moodle REST API Client (Issue #89: Core-MCP-Extraktion).
 *
 * Geteilte Hilfsfunktion fuer alle MCP-Einstiegspunkte (moodle-mcp.js,
 * moodle-mcp-core.js), die Moodle-Webservices per local_coursepilot
 * aufrufen. Reine Verschiebung aus moodle-mcp.js, keine Verhaltensaenderung.
 */

const { normalizeMoodleUrl } = require('../scripts/moodle-credentials');

function createMoodleClient(moodleUrl, moodleToken) {
  // Issue #242: letzte Sicherung an der HTTP-Grenze - egal ob die URL aus dem
  // Zugangsdaten-Speicher, MOODLE_URL oder argv kommt, fetch braucht ein
  // Protokoll. Ein vorhandenes Protokoll (auch http://) bleibt unangetastet.
  const baseUrl = normalizeMoodleUrl(moodleUrl);
  async function callMoodle(wsfunction, params = {}) {
    const body = new URLSearchParams({
      wstoken: moodleToken,
      wsfunction,
      moodlewsrestformat: "json",
      ...params,
    });

    const res = await fetch(`${baseUrl}/webservice/rest/server.php`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });

    const data = await res.json();

    if (data && data.exception) {
      throw new Error(`Moodle Fehler: ${data.message} (${data.errorcode})`);
    }
    return data;
  }

  return { callMoodle };
}

module.exports = { createMoodleClient };
