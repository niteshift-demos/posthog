#!/usr/bin/env bash
# Host-level state the dev stack needs that a fresh or resumed sandbox does not have.
set -euo pipefail

# Host processes reach the dev containers by compose service name
# (docs/published/handbook/engineering/developing-locally.md).
aliases='127.0.0.1 db redis7 kafka clickhouse clickhouse-coordinator objectstorage seaweedfs temporal'
grep -qxF "$aliases" /etc/hosts || printf '%s\n' "$aliases" >> /etc/hosts

# The frontend watchers exhaust the default inotify budget and exit with ENOSPC.
sysctl -q -w fs.inotify.max_user_watches=1048576 fs.inotify.max_user_instances=8192
