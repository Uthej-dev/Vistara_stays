#!/usr/bin/env bash
# Start (or stop) a local single-node MongoDB *replica set* used only by the test suite.
#
# Why a replica set? MongoDB transactions — which the booking engine relies on — only work on
# replica sets. Atlas is always a replica set; a plain local `mongod` is not.
# This runs on port 27018 with its own data folder, so it never touches any other local MongoDB.
#
# Usage:  ./scripts/test_mongo.sh start | stop | status
set -euo pipefail

PORT=27018
DIR="$(cd "$(dirname "$0")/.." && pwd)/.mongo-test"
URI="mongodb://localhost:${PORT}/?directConnection=true"

case "${1:-start}" in
  start)
    if mongosh --quiet "$URI" --eval 'db.runCommand({ping:1}).ok' >/dev/null 2>&1; then
      echo "Test MongoDB already running on port ${PORT}"
    else
      mkdir -p "$DIR/data"
      mongod --replSet rs0 --port "$PORT" --bind_ip 127.0.0.1 \
        --dbpath "$DIR/data" --logpath "$DIR/mongod.log" --fork >/dev/null
      echo "Started test MongoDB on port ${PORT}"
    fi
    # Initiate the replica set once (no-op if already initiated).
    mongosh --quiet "$URI" --eval "
      try { rs.status().ok } catch (e) {
        rs.initiate({_id: 'rs0', members: [{_id: 0, host: 'localhost:${PORT}'}]}).ok
      }" >/dev/null
    # Wait until this node is PRIMARY (can accept writes).
    for _ in $(seq 1 30); do
      if [ "$(mongosh --quiet "$URI" --eval 'db.hello().isWritablePrimary')" = "true" ]; then
        echo "Replica set rs0 ready: mongodb://localhost:${PORT}/?replicaSet=rs0"
        exit 0
      fi
      sleep 1
    done
    echo "Replica set did not become primary in time; see $DIR/mongod.log" >&2
    exit 1
    ;;
  stop)
    mongosh --quiet "$URI" --eval 'db.getSiblingDB("admin").shutdownServer()' >/dev/null 2>&1 || true
    echo "Stopped test MongoDB"
    ;;
  status)
    mongosh --quiet "$URI" --eval 'printjson({primary: db.hello().isWritablePrimary, setName: db.hello().setName})'
    ;;
  *)
    echo "Usage: $0 start|stop|status" >&2
    exit 2
    ;;
esac
