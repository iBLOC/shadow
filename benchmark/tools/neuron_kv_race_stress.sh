#!/bin/bash
# KV-cache inheritance stress against the local embedded neuron
# (127.0.0.1:8085, fully-literal target).
#
# History: written to chase `shape mismatch in broadcast_add,
# lhs: [1,14,77,135], rhs: [1,1,77,77]`. Concurrent mode never
# reproduced it — the model lock serializes generations, so the
# concurrent window this script targets does not exist. The failure
# WAS reproduced by plain SEQUENTIAL requests (long generation, then
# the sql prompt) on the pre-fix neuron, and was fixed by neuron
# 2bce199 (reset inside the generation critical section). Kept as a
# regression probe: run against :8085 and expect 0 mismatches.
#
# Usage: neuron_kv_race_stress.sh <model_id> <rounds>
MODEL="$1"; ROUNDS="${2:-8}"
mismatch=0
for i in $(seq 1 "$ROUNDS"); do
  BODY_A="{\"model\":\"$MODEL\",\"messages\":[{\"role\":\"user\",\"content\":\"Given the table users(id, name, age), write a SQL query to select all users older than 18. Reply with the SQL only.\"}],\"max_tokens\":64,\"stream\":false}"
  BODY_B="{\"model\":\"$MODEL\",\"messages\":[{\"role\":\"user\",\"content\":\"Reply with the single word: PONG.\"}],\"max_tokens\":8,\"stream\":false}"
  curl -s -m 600 -X POST http://127.0.0.1:8085/v1/chat/completions -H "Content-Type: application/json" -d "$BODY_A" -o /tmp/kv_a.json &
  PA=$!
  curl -s -m 600 -X POST http://127.0.0.1:8085/v1/chat/completions -H "Content-Type: application/json" -d "$BODY_B" -o /tmp/kv_b.json &
  PB=$!
  wait $PA $PB
  for f in /tmp/kv_a.json /tmp/kv_b.json; do
    if grep -q "shape mismatch" "$f" 2>/dev/null; then
      mismatch=$((mismatch+1))
      echo "round $i $f: SHAPE MISMATCH -> $(head -c 200 "$f")"
    fi
  done
  echo "round $i done: A=$(head -c 60 /tmp/kv_a.json) B=$(head -c 60 /tmp/kv_b.json)"
done
echo "=== shape-mismatch count: $mismatch / $ROUNDS rounds ==="
