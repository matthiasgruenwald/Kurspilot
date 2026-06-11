# Issue tracker: GitHub

Issues und PRDs liegen als GitHub Issues im Fork `matthiasgruenwald/MoodleIGSMcp` (origin). `gh` CLI fuer alle Operationen nutzen.

## Conventions

- **Issue anlegen**: `gh issue create --title "..." --body "..."`. Heredoc fuer mehrzeilige Bodies.
- **Issue lesen**: `gh issue view <number> --comments`.
- **Issues listen**: `gh issue list --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'` mit passenden `--label`/`--state` Filtern.
- **Kommentieren**: `gh issue comment <number> --body "..."`
- **Labels setzen/entfernen**: `gh issue edit <number> --add-label "..."` / `--remove-label "..."`
- **Schliessen**: `gh issue close <number> --comment "..."`

`gh` erkennt das Repo automatisch ueber `git remote -v` (origin).

## "publish to the issue tracker"

GitHub Issue im origin-Repo anlegen.

## "fetch the relevant ticket"

`gh issue view <number> --comments`
