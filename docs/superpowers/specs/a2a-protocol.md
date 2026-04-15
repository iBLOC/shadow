# Shadow A2A Protocol Specification

**版本：** 1.0
**日期：** 2026-03-21

## Overview

A2A (Agent-to-Agent) 协议用于 Shadow 与 Resonance 之间的通信。

## Message Envelope

All A2A messages share a common envelope:

```json
{
  "type": "string",
  "id": "uuid",
  "timestamp": "ISO8601",
  "payload": {}
}
```

## Message Types

### 1. Capability Register (Shadow → Resonance)

```json
{
  "type": "capability_register",
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "timestamp": "2026-03-21T10:00:00Z",
  "payload": {
    "shadow_id": "uuid",
    "device_type": "mobile|desktop",
    "instance_name": "my-shadow-phone",
    "capabilities": {
      "models": [
        {
          "id": "qwen2.5-3b",
          "provider": "mnn|candle-vllm",
          "context_length": 8192,
          "quantization": "q4km",
          "supports": ["chat", "reasoning"]
        }
      ],
      "skills": [
        {
          "id": "web_search",
          "name": "Web Search",
          "description": "Search the web for information"
        }
      ],
      "mcp_tools": [
        {
          "server": "filesystem",
          "tools": ["read", "write", "list"]
        }
      ]
    },
    "preferred_connection": {
      "protocol": "wss",
      "port": 8080
    }
  }
}
```

### 2. Model Scores Update (Resonance → Shadow)

```json
{
  "type": "model_scores",
  "id": "550e8400-e29b-41d4-a716-446655440001",
  "timestamp": "2026-03-21T10:00:00Z",
  "payload": {
    "scores": [
      {
        "model_id": "qwen2.5-3b",
        "benchmark_scores": {
          "reasoning": 85,
          "code": 78,
          "creativity": 82,
          "speed": 95
        },
        "overall_score": 84
      }
    ]
  }
}
```

### 3. Task Push (Resonance → Shadow)

```json
{
  "type": "task_push",
  "id": "550e8400-e29b-41d4-a716-446655440002",
  "timestamp": "2026-03-21T10:00:00Z",
  "payload": {
    "task_id": "uuid",
    "priority": "high|normal|low",
    "goal": "完成用户注册流程",
    "required_capabilities": {
      "min_model_score": 80,
      "preferred_models": ["qwen2.5-3b"],
      "required_skills": ["web_search"]
    },
    "context": {
      "user_id": "user_uuid",
      "session_id": "session_uuid",
      "metadata": {}
    },
    "deadline": "2026-03-21T12:00:00Z"
  }
}
```

### 4. Task Response (Shadow → Resonance)

```json
{
  "type": "task_response",
  "id": "550e8400-e29b-41d4-a716-446655440003",
  "timestamp": "2026-03-21T10:00:00Z",
  "payload": {
    "task_id": "uuid",
    "status": "accepted|rejected|deferred",
    "reason": "optional rejection reason",
    "selected_model": "qwen2.5-3b",
    "estimated_completion": "2026-03-21T10:30:00Z"
  }
}
```

### 5. Task Progress (Shadow → Resonance)

```json
{
  "type": "task_progress",
  "id": "550e8400-e29b-41d4-a716-446655440004",
  "timestamp": "2026-03-21T10:00:00Z",
  "payload": {
    "task_id": "uuid",
    "progress": 0.5,
    "current_step": "step 2 of 4",
    "message": "正在搜索相关信息..."
  }
}
```

### 6. Task Result (Shadow → Resonance)

```json
{
  "type": "task_result",
  "id": "550e8400-e29b-41d4-a716-446655440005",
  "timestamp": "2026-03-21T10:00:00Z",
  "payload": {
    "task_id": "uuid",
    "status": "completed|failed|cancelled",
    "result": {
      "summary": "任务完成摘要",
      "data": {}
    },
    "memory_summary": {
      "memories_created": 5,
      "entities_extracted": 3
    }
  }
}
```

### 7. Task Query (Shadow → Resonance)

```json
{
  "type": "task_query",
  "id": "550e8400-e29b-41d4-a716-446655440006",
  "timestamp": "2026-03-21T10:00:00Z",
  "payload": {
    "task_id": "uuid",
    "query_type": "status|history|result"
  }
}
```

### 8. Task Query Response (Resonance → Shadow)

```json
{
  "type": "task_query_response",
  "id": "550e8400-e29b-41d4-a716-446655440007",
  "timestamp": "2026-03-21T10:00:00Z",
  "payload": {
    "task_id": "uuid",
    "query_type": "status|history|result",
    "data": {}
  }
}
```

## Connection Protocol

### Connection Establishment

1. Shadow discovers Resonance via mDNS or configured address
2. Shadow initiates mTLS connection
3. TLS handshake includes certificate verification
4. Shadow sends `capability_register` message
5. Resonance sends `model_scores` message (initial sync)
6. Connection established for bidirectional messaging

### Message Flow

```
Shadow                                    Resonance
  |                                           |
  |-------- mTLS Connection (initiated) ------>|
  |                                           |
  |<------ TLS Handshake (mutual cert) ------->|
  |                                           |
  |-------- capability_register -------------->|
  |                                           |
  |<------- model_scores ----------------------|
  |                                           |
  |<========= WebSocket Channel ===============>|
  |                                           |
  |     (bidirectional messages)              |
  |                                           |
```

## WebSocket Protocol

Resonance provides a WebSocket endpoint at `/api/v1/shadow/ws` for Shadow connections.

### Server → Client Messages

| Type | Description |
|------|-------------|
| `model_scores` | Model benchmark score updates |
| `task_push` | New task to execute |
| `task_cancel` | Cancel an existing task |
| `ping` | Heartbeat request |

### Client → Server Messages

| Type | Description |
|------|-------------|
| `capability_register` | Register/update Shadow capabilities |
| `task_response` | Accept/reject/defer task |
| `task_progress` | Report task progress |
| `task_result` | Report task completion |
| `task_query` | Query task information |
| `pong` | Heartbeat response |

## Error Handling

```json
{
  "type": "error",
  "id": "uuid",
  "timestamp": "ISO8601",
  "payload": {
    "code": "CERTIFICATE_EXPIRED",
    "message": "Client certificate has expired",
    "details": {}
  }
}
```

## Security Considerations

- All connections must use TLS (mTLS recommended)
- Message integrity verified via TLS record layer
- Certificates must be issued by trusted CA
- Shadow instances must re-register on certificate renewal
