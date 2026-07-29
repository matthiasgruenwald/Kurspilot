#!/bin/bash
set -e

PLUGIN_DIR="$(cd "$(dirname "$0")/.." && pwd)/Plugin/src/local_coursepilot"

rsync -av --delete \
  -e "ssh -i ~/.ssh/id_moodle_deploy" \
  "$PLUGIN_DIR/" \
  moodle-deploy@1.2.3.31:/opt/moodle/local/coursepilot/

ssh -i ~/.ssh/id_moodle_deploy moodle-deploy@1.2.3.31 \
  "docker exec moodle-docker-webserver-1 php /var/www/html/admin/cli/upgrade.php --non-interactive"

echo "Deploy abgeschlossen."
