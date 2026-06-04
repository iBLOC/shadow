# Shadow Dev Orchestrator

This directory contains scripts that span the whole Shadow platform (Prefrontal + Shadow-Desktop + Shadow-Mobile), not just one repo. Each script is also mirrored at `/home/ibloc/Projects/scripts/` so it lives outside any individual git repo.

## start-dev.sh

Bring up the full Shadow stack on a single machine:

```bash
./start-dev.sh                # Prefrontal (:8082) + Tauri Desktop (:1420)
./start-dev.sh --mobile       # also attach the first adb device
./start-dev.sh --web          # use the Vite SPA build instead of Tauri
./start-dev.sh --prefrontal-only
./start-dev.sh --desktop-only
./start-dev.sh --status       # show process + port state
./start-dev.sh --stop         # stop everything
./start-dev.sh --clean        # stop + remove /tmp/shadow-dev
```

Logs go to `/tmp/shadow-dev/{prefrontal,desktop,mobile}.log`. Each child is
tracked by a PID file under `/tmp/shadow-dev/pids/` so `--stop` can reap the
whole tree without leaking.

See `./start-dev.sh --help` for all options and environment overrides.
