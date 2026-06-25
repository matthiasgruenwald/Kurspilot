'use strict';

/**
 * Moodle REST API Client (Issue #89: Core-MCP-Extraktion).
 *
 * Geteilte Hilfsfunktion fuer alle MCP-Einstiegspunkte (moodle-mcp.js,
 * moodle-mcp-core.js), die Moodle-Webservices per local_aicoursecreator
 * aufrufen. Reine Verschiebung aus moodle-mcp.js, keine Verhaltensaenderung.
 */

function createMoodleClient(moodleUrl, moodleToken) {
  async function callMoodle(wsfunction, params = {}) {
    const body = new URLSearchParams({
      wstoken: moodleToken,
      wsfunction,
      moodlewsrestformat: "json",
      ...params,
    });

    const res = await fetch(`${moodleUrl}/webservice/rest/server.php`, {
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
