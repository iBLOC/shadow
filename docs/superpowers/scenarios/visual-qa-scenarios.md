# Visual-QA Scenarios

> Consolidated end-to-end user scenarios for the entire visual-QA
> pipeline (Spec #1-#6). Each scenario has a stable ID, a one-line
> title, the human action, the expected system behavior, and pointers
> to the implementing spec(s).
>
> **Use this doc** to run the system end-to-end. Each scenario lists
> the curl / Playwright commands you need to reproduce it on a
> running shadow-desktop + cortex + mage-vl stack.

## Scenarios at a glance

| ID | Title | Implementing specs |
|---|---|---|
| VQA-01 | Single-frame Q&A | #1 + #2 + #3 |
| VQA-02 | Multi-device clarification | #1 + #2 |
| VQA-03 | No-source error | #1 + #2 |
| VQA-04 | Peer cross-cortex visual Q&A | #1 + #2 + #3 |
| VQA-05 | Tool framework dispatch | #4 + #5 |
| VQA-06 | Continuous video conversation | #6 |

---

## VQA-01 — Single-frame Q&A

**User action**: Select 1 webcam in Settings → Video Sources → return to
chat → send "看看前面有什么".

**Expected behavior**:
- cortex's prefrontal classifies the message as `Intent::VisualQA`
- One active video source on this device → direct route
- Capture one frame (per Spec #3 capability)
- mage_vl returns text
- Chat reply shows the mage_vl answer

**Manual reproduction**:
```bash
# Prereqs: shadow-desktop running, cortex sidecar running, mage-vl shards
# at NEURE_MAGE_VL_SHARD_DIR, 1 webcam plugged in

# 1. Configure the source via desktop UI
#    (Settings → Video Sources → select camera → Add)
# OR via cortex directly:
curl -X PUT http://localhost:60080/api/cortex/video-sources \
  -H "X-Cortex-Admin-Token: $CORTEX_TOKEN" \
  -H "If-Match: *" \
  -H "Content-Type: application/json" \
  -d @single-source.json   # see Spec #1 for shape

# 2. Chat
curl -X POST http://localhost:60080/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "ibloc-cortex",
    "messages": [{"role": "user", "content": "看看前面有什么"}]
  }'

# 3. Expect: reply contains the mage_vl description of one frame
#    (NOT a clarification chip — there's only 1 source)
```

**Behind the scenes**:
- Spec #2 `visual_qa_router` → 1 candidate → direct route
- Spec #3 `VisualQALobe` → `ToolRegistry::invoke_value("capture_frame", ...)`
- Spec #3 desktop Tauri → WebRTC frame grab → JPEG base64
- Spec #3 embedded neure mage_vl → reply text

---

## VQA-02 — Multi-device clarification

**User action**: 2 devices each have 1 webcam configured → ask "看看".

**Expected behavior**:
- cortex A's `visual_qa_router` finds 2 candidates (1 local, 1 peer)
- Chat reply includes clarification chips: "Which device?"
- User clicks "ibloc-desktop" → re-sends with source_hint
- Direct route to chosen device; mage_vl reply

**Manual reproduction**:
```bash
# Prereqs: 2 devices, each with 1 webcam configured and registered
# via Spec #1, both running cortex sidecars

# On device A:
curl -X POST http://localhost:60080/v1/chat/completions \
  -d '{"model":"ibloc-cortex","messages":[{"role":"user","content":"看看"}]}'

# Expect: reply has content "你有摄像头在多台设备上。..." AND a metadata
# field `shadow.clarification.kind = "visual_qa_source_selection"` with
# a `candidates` array listing both devices.

# User clicks the chip → re-send with source_hint:
curl -X POST http://localhost:60080/v1/chat/completions \
  -d '{
    "model":"ibloc-cortex",
    "messages":[{"role":"user","content":"看看"}]
    // Note: shadow-desktop injects the source_hint into the next message
    // via Intent::VisualQA { source_hint: "ibloc-desktop" }
  }'

# Expect: direct route to device A's local camera; reply text
```

---

## VQA-03 — No-source error

**User action**: No video sources configured → ask "看看".

**Expected behavior**:
- cortex A's `visual_qa_router` finds 0 candidates
- Chat reply: "我这边没看到任何已配置的摄像头，请先在 Settings → Video Sources 配置一台"

**Manual reproduction**:
```bash
# Ensure no video sources configured
curl -X DELETE http://localhost:60080/api/cortex/video-sources \
  -H "X-Cortex-Admin-Token: $CORTEX_TOKEN" \
  # (NOTE: Spec #1 only has PUT; no DELETE route. This scenario requires
  #  manually clearing the table OR using the desktop UI to remove all)

# Or: start fresh with no sources at all

curl -X POST http://localhost:60080/v1/chat/completions \
  -d '{"model":"ibloc-cortex","messages":[{"role":"user","content":"看看"}]}'

# Expect: friendly error reply, no A2A call dispatched
```

---

## VQA-04 — Peer cross-cortex visual Q&A

**User action**: Device A has no camera; peer device B has 1 → ask "看看" from A.

**Expected behavior**:
- cortex A has 0 local + 1 peer active source (per Spec #2 peer broadcast)
- Direct route to peer B (only 1 candidate after broadcast aggregation)
- cortex A → A2A `tasks/send` → cortex B → visual_qa skill → mage_vl
- Reply flows back to A

**Manual reproduction**:
```bash
# Prereqs: 2 devices A and B; B has webcam; A has none.
# They discover each other via mds_discovery (default; no config needed).

# On A:
curl -X POST http://localhost:60080/v1/chat/completions \
  -d '{"model":"ibloc-cortex","messages":[{"role":"user","content":"看看"}]}'

# Expect: reply comes from B's mage_vl (same wire shape as VQA-01).
# cortex A's logs show:
#   - Intent::VisualQA classified
#   - candidate list = [B]
#   - A2A POST http://B:60080/a2a/tasks/send { skill_id: "visual_qa", ... }
#   - reply text
```

---

## VQA-05 — Tool framework dispatch

**User action**: Various scenarios that exercise the Spec #4 + #5 tool framework end-to-end:
- 5a: OpenAI-style chat calls `capture_frame` (builtin tool) → provider
- 5b: Wasm-isolated custom tool (Spec #5) registered → invoked through normal flow

**Expected behavior**:
- All tools share one ToolRegistry
- agent_assignments restrict which agent sees which tool
- Wasm-isolated tools run in their own InstanceManager with resource quota

**Manual reproduction (5a — builtin)**:
```bash
# Configure source via Spec #1
# Then exercise the flow:
curl -X POST http://localhost:60080/api/flows/<flow_id>/run \
  -H "X-Cortex-Admin-Token: $CORTEX_TOKEN" \
  -d '{"input": {...}}'

# Or use the LlmNodeAdapter to let the LLM call capture_frame via tool_calls
curl -X POST http://localhost:60080/v1/chat/completions \
  -d '{
    "model": "ibloc-cortex",
    "messages": [
      {"role": "user", "content": "用 capture_frame 看看桌面上有什么"}
    ]
  }'
# Expect: LLM emits tool_call, cortex dispatches through ToolRegistry,
# mage_vl returns description, LLM synthesizes final reply.
```

**Manual reproduction (5b — wasm tool)**:
```bash
# Build the echo_tool sample (see Spec #5 CI step)
cd cortex/tests/fixtures/wasm/echo_tool
cargo build --release --target wasm32-unknown-unknown
# → echo_tool.wasm

# Register via REST:
WASM_B64=$(base64 -w 0 echo_tool.wasm)
MANIFEST='{"tools":[{"name":"echo","description":"Echo","args_schema":{...},"returns_schema":{...}}]}'

curl -X POST http://localhost:60080/api/cortex/tools/wasm/register \
  -H "X-Cortex-Admin-Token: $CORTEX_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"wasm_base64\":\"$WASM_B64\",\"manifest_json\":\"$(echo $MANIFEST | sed 's/"/\\"/g')\"}"

# Invoke through the normal /tools/invoke route:
curl -X POST http://localhost:60080/api/cortex/tools/invoke \
  -H "X-Cortex-Admin-Token: $CORTEX_TOKEN" \
  -d '{"tool":"echo","args":{"text":"hello"}}'

# Expect: { "result": { "echo": "echo: hello" } }
```

---

## VQA-06 — Continuous video conversation (Spec #6)

**User action**: Open Video Mode in shadow-desktop → wait 30 seconds →
chat "刚才在干什么?" (What was I doing just now?).

**Expected behavior**:
- Spec #6 spawns a `VideoCaptureLoop` in a `tokio::spawn` background task
- 0.5 fps capture; every 2s the last frame is run through mage_vl
- 15 descriptions written to `cortex_video_session_descriptions` over 30s
- User's question → temporal lobe assembles system prompt including
  recent 5 descriptions → LLM answers with awareness of recent activity

**Manual reproduction**:
```bash
# 1. Configure a source via Spec #1 (so we have a local camera).
# 2. Start a video session:
SESSION=$(curl -s -X POST http://localhost:60080/api/cortex/video-sessions \
  -H "X-Cortex-Admin-Token: $CORTEX_TOKEN" \
  -d '{
    "agent": "alice",
    "video_source_id": "vsrc_abc",
    "fps": 0.5,
    "window_seconds": 2
  }' | jq -r .id)
echo "Session: $SESSION"

# 3. Wait 30 seconds (do something on camera; the mage_vl loop
#    will describe what it sees every 2s).
sleep 30

# 4. Get the recent descriptions:
curl -s "http://localhost:60080/api/cortex/video-sessions/$SESSION/descriptions?limit=5" \
  -H "X-Cortex-Admin-Token: $CORTEX_TOKEN" | jq

# Expect: 15 entries (30s / 2s = 15), each with a 1-2 sentence description
# like "黑色耳机放在桌子上" or "用户手进入画面"

# 5. Ask a question that requires context:
curl -X POST http://localhost:60080/v1/chat/completions \
  -d '{
    "model":"ibloc-cortex",
    "messages":[{"role":"user","content":"刚才在干什么?"}]
  }'

# Expect: reply references the recent video context, e.g.
#   "你刚才把黑色耳机放在了桌子上。"

# 6. Stop the session:
curl -X POST "http://localhost:60080/api/cortex/video-sessions/$SESSION/stop" \
  -H "X-Cortex-Admin-Token: $CORTEX_TOKEN"

# 7. (Optional) Verify GC: descriptions older than 5 minutes get pruned
#    next GC tick. Check description count decreases.
```

**Behind the scenes**:
- Spec #6 `LobeSession::start()` spawns `VideoCaptureLoop::run()`
- Every `1/fps = 2s` → frame ticker fires → capture one frame via
  Spec #3 capability
- Every `window = 2s` → window checker fires → run mage_vl with
  the last frame + previous description → persist
- Spec #6 `TemporalLobe::assemble_system_prompt()` injects the
  last 5 descriptions into the system prompt
- LLM answers with the live video context as grounding

**Variations to test**:
- VQA-06a: Stop the session while it's running → expect graceful
  shutdown within 5s, session state = Completed
- VQA-06b: Unplug the camera mid-session → after 5 failed captures,
  session state = Failed
- VQA-06c: Start a second session for the same agent → 409 Conflict
- VQA-06d: Restart cortex mid-session → on next boot, the orphaned
  Active session is marked Failed (not auto-resumed)

---

## How to add a new scenario

When a new visual-QA feature lands (e.g. Spec #7 audio+video sync):

1. Pick a stable ID: `VQA-NN` where NN is the next number
2. Add a row to the **Scenarios at a glance** table
3. Add a full section following the pattern above:
   - User action
   - Expected behavior (incl. failure paths)
   - Manual reproduction (curl / playwright)
   - Behind the scenes (which specs are involved)
4. If variations exist (a/b/c), include them as **VQA-XXa/b/c**

This doc lives at `docs/superpowers/scenarios/visual-qa-scenarios.md`.
Update it whenever a new spec lands that introduces a new user-visible
flow.
