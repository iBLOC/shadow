#!/usr/bin/env python3
"""Run ONE τ²-bench task through the tau2 harness (shadow-benchmark adapter).

Spawned by `bench tau2` once per (task, repeat) inside the pinned tau2
checkout's uv venv. Emits one JSON result object to --out.

Modes
-----
--agent-mode replay    Oracle: replays evaluation_criteria.actions one tool
                       call per turn, then states every communicate_info
                       string and a ###STOP### marker. Zero LLM calls.
--agent-mode llm       tau2's registered `llm_agent` driven by a litellm
                       model id (e.g. openai/deepseek-chat).
--user-mode scripted   Oracle: canned non-empty user messages, never stops.
--user-mode llm        tau2's registered `user_simulator`.

API keys are read from the environment by NAME (--api-key-env); key values
never appear in argv, in the emitted JSON, or in the trajectory dump.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
import traceback
from pathlib import Path

STOP_TOKEN = "###STOP###"


def parse_args(argv):
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--suite", required=True, help="suite JSON embedding raw tau2 task records")
    p.add_argument("--task-id", required=True)
    p.add_argument("--domain", default="airline")
    p.add_argument("--agent-mode", choices=["replay", "llm"], default="replay")
    p.add_argument("--user-mode", choices=["scripted", "llm"], default="scripted")
    p.add_argument("--model", default=None, help="litellm model id for the agent")
    p.add_argument("--api-base", default=None, help="OpenAI-compatible API base for the agent")
    p.add_argument("--api-key-env", default=None, help="env var NAME holding the agent API key")
    p.add_argument("--user-model", default=None, help="litellm model id for the user simulator (default: --model)")
    p.add_argument("--user-api-base", default=None)
    p.add_argument("--user-api-key-env", default=None)
    p.add_argument("--max-steps", type=int, default=40)
    p.add_argument("--seed", type=int, default=0)
    p.add_argument(
        "--shadow-addendum",
        action="store_true",
        help=(
            "Append the shadow operational-discipline addendum to the "
            "agent system prompt (write-tool discipline). Default off: "
            "official-semantics runs stay verbatim."
        ),
    )
    p.add_argument("--out", required=True, help="path to write the result JSON")
    p.add_argument("--save-dir", default=None, help="optional dir for the full trajectory JSON")
    return p.parse_args(argv)


def load_task_record(suite_path: str, task_id: str) -> dict:
    data = json.loads(Path(suite_path).read_text(encoding="utf-8"))
    for record in data.get("tasks", []):
        if str(record.get("id")) == str(task_id):
            return record
    raise SystemExit(f"task {task_id!r} not found in {suite_path}")


# --- run-fact extraction -------------------------------------------------
#
# The reward alone is not auditable: a reviewer needs to see what the
# agent actually said, which tools it called, and what the provider
# charged. The simulation's message list carries all three, so we
# distil it into four fields the Rust side stores in the run report.

# Messages that hand the conversation off instead of answering. The
# last such message is what the user literally received, but it
# carries no task content — the informative reply is the one before
# it. Detected by phrase so the rule stays domain-neutral.
HANDOFF_PHRASES = (
    "transfer to a human",
    "transferred to a human",
    "human agent",
    "live agent",
    "end of conversation",
)


def _is_handoff(text: str) -> bool:
    lowered = text.strip().lower()
    if not lowered:
        return False
    return any(phrase in lowered for phrase in HANDOFF_PHRASES)


def _text_of(message) -> str:
    """Best-effort plain text of a tau2 message."""
    content = getattr(message, "content", None)
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts = []
        for block in content:
            if isinstance(block, str):
                parts.append(block)
            elif isinstance(block, dict):
                text = block.get("text") or block.get("content")
                if isinstance(text, str):
                    parts.append(text)
        return "\n".join(parts)
    return ""


def extract_run_facts(simulation) -> dict:
    """Distil the simulation transcript into report-facing facts.

    Returns a dict with:
      answer      — the last assistant message that carries text
      tool_calls  — number of tool calls issued by the assistant
      usage       — summed provider token usage (when the provider reports it)
      steps       — per-turn trace (assistant text + tool calls)
    """
    messages = list(getattr(simulation, "messages", None) or [])
    answer = ""
    last_reply = ""
    tool_calls = 0
    usage = {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}
    usage_seen = False
    steps = []

    for msg in messages:
        role = str(getattr(msg, "role", "") or "")
        text = _text_of(msg)
        calls = list(getattr(msg, "tool_calls", None) or [])
        for call in calls:
            tool_calls += 1
            steps.append(
                {
                    "type": "tool_call",
                    "name": str(getattr(call, "name", "") or ""),
                    "arguments": getattr(call, "arguments", None) or {},
                }
            )
        if text:
            steps.append({"type": "message", "role": role, "text": text})
        if role == "assistant":
            if text:
                last_reply = text
                # A handoff message is not the answer — keep the last
                # reply that actually carried content.
                if not _is_handoff(text):
                    answer = text
            msg_usage = getattr(msg, "usage", None)
            if isinstance(msg_usage, dict):
                usage_seen = True
                for field in usage:
                    value = msg_usage.get(field)
                    if isinstance(value, (int, float)):
                        usage[field] += int(value)

    if not answer:
        answer = last_reply

    return {
        "answer": answer,
        "last_reply": last_reply,
        "tool_calls": tool_calls,
        "usage": usage if usage_seen else None,
        "steps": steps,
    }


# --- oracle participants -------------------------------------------------


def build_replay_agent_class():
    from tau2.agent.llm_agent import LLMAgent
    from tau2.data_model.message import AssistantMessage, MultiToolMessage, ToolCall

    class ReplayAgent(LLMAgent):
        """Deterministic oracle agent: replays the task's golden actions,
        then states every communicate_info string and stops. Subclasses
        LLMAgent only to satisfy the half-duplex agent contract — the LLM
        is never invoked (llm="dummy")."""

        def __init__(self, tools, domain_policy, task=None, **_kw):
            super().__init__(tools=tools, domain_policy=domain_policy, llm="dummy", llm_args={})
            criteria = getattr(task, "evaluation_criteria", None) if task is not None else None
            self._actions = list(getattr(criteria, "actions", None) or [])
            self._communicate = list(getattr(criteria, "communicate_info", None) or [])
            self._replayed = 0

        @classmethod
        def is_stop(cls, message) -> bool:
            content = getattr(message, "content", None)
            return bool(content) and STOP_TOKEN in content

        def _generate_next_message(self, message, state):
            if isinstance(message, MultiToolMessage):
                state.messages.extend(message.tool_messages)
            elif message is not None:
                state.messages.append(message)
            if self._replayed < len(self._actions):
                action = self._actions[self._replayed]
                self._replayed += 1
                return AssistantMessage(
                    role="assistant",
                    tool_calls=[
                        ToolCall(
                            id=f"replay_{self._replayed}",
                            name=action.name,
                            arguments=dict(action.arguments),
                            requestor=action.requestor,
                        )
                    ],
                )
            lines = [str(info) for info in self._communicate]
            lines.append(STOP_TOKEN)
            return AssistantMessage(role="assistant", content="\n".join(lines))

    return ReplayAgent


def build_scripted_user_class(first_message: str):
    from tau2.data_model.message import UserMessage
    from tau2.user.user_simulator import UserSimulator
    from tau2.user.user_simulator_base import UserState

    class ScriptedUser(UserSimulator):
        """Deterministic oracle user: states the scenario once, then short
        acknowledgements. Never emits a stop sentinel — the agent's
        ###STOP### message ends the conversation (AGENT_STOP)."""

        def __init__(self, tools=None, instructions=None, llm=None, llm_args=None, persona_config=None):
            super().__init__(
                llm="dummy",
                instructions=instructions,
                tools=tools,
                llm_args={},
                persona_config=persona_config,
            )
            self._turn = 0

        def get_init_state(self, message_history=None):
            return UserState(system_messages=[], messages=list(message_history or []))

        def set_seed(self, seed):
            pass

        def generate_next_message(self, message, state):
            self._turn += 1
            content = first_message if self._turn == 1 else "Thanks, that's all I needed."
            msg = UserMessage(role="user", content=content)
            state.messages.append(msg)
            return msg, state

    return ScriptedUser


def llm_args_for(api_base, api_key_env):
    args = {}
    if api_base:
        args["api_base"] = api_base
    if api_key_env:
        key = os.environ.get(api_key_env)
        if not key:
            raise SystemExit(f"env var {api_key_env} is not set")
        args["api_key"] = key
    return args


# --- shadow agent addendum ------------------------------------------------
#
# The upstream AGENT_INSTRUCTION says "each turn: message OR tool call"
# but never states the operational discipline that τ²'s DB reward
# measures: a state change the user asked for MUST be performed via the
# corresponding write tool, and the tool result must be seen before
# telling the user it is done. deepseek-chat failed 3/5 tasks with
# COMMUNICATE=1.0/DB=0.0 (promised the change, never executed it) —
# twice with an identical failure matrix. This addendum targets that
# failure mode only; the policy block, tools, user simulator and
# scoring stay exactly upstream. Off by default (`--shadow-addendum`)
# so official-semantics runs stay verbatim.

SHADOW_AGENT_ADDENDUM = """
<shadow-addendum>
Operational discipline (in addition to the policy above):
1. A change the user requested is NOT done until you have called the
   corresponding write tool (update_reservation, update_certificate,
   send_certificate, ...) AND seen its result. Never tell the user an
   action is complete based on your intention alone.
2. Before ending the conversation (###STOP###), check: has every
   requested change been executed via a tool call AND confirmed by its
   result? If not, execute it now.
3. Prefer acting over summarizing: if the next required step is a tool
   call, make the tool call instead of describing what you would do.
4. Every concrete figure a tool result produced — total prices, price
   differences, refund amounts, cancellation costs, certificate values,
   confirmation/cancellation IDs — MUST be stated to the user in a
   text message before you end. Before sending ###STOP###, re-read
   your tool results and check: did I actually tell the user these
   numbers? An action whose result the user never saw counts as
   unfinished communication.
</shadow-addendum>
"""


def build_shadow_llm_agent_class():
    from tau2.agent.llm_agent import LLMAgent

    class ShadowLLMAgent(LLMAgent):
        """Upstream LLMAgent with the operational-discipline addendum
        appended to the system prompt. Everything else (policy, tools,
        message flow) is verbatim upstream."""

        def __init__(self, tools, domain_policy, **_kw):
            # The tau2 runner passes extra kwargs (task, audio_native_config,
            # ...) that the base LLMAgent does not take — absorb them all,
            # same as the replay agent.
            super().__init__(tools=tools, domain_policy=domain_policy, **{
                k: v for k, v in _kw.items()
                if k in ("llm", "llm_args")
            })

        @property
        def system_prompt(self) -> str:
            return super().system_prompt + "\n" + SHADOW_AGENT_ADDENDUM.strip()

    return ShadowLLMAgent


def main(argv):
    args = parse_args(argv)
    record = load_task_record(args.suite, args.task_id)

    from tau2.data_model.simulation import TextRunConfig
    from tau2.data_model.tasks import Task
    from tau2.evaluator.evaluator import EvaluationType
    from tau2.registry import registry
    from tau2.runner.batch import run_single_task

    task = Task.model_validate(record)

    agent_name = "llm_agent"
    if args.agent_mode == "replay":
        registry.register_agent_factory(build_replay_agent_class(), "shadow_replay_agent")
        agent_name = "shadow_replay_agent"
    elif getattr(args, "shadow_addendum", False):
        registry.register_agent_factory(build_shadow_llm_agent_class(), "shadow_llm_agent")
        agent_name = "shadow_llm_agent"

    user_name = "user_simulator"
    if args.user_mode == "scripted":
        scenario = record.get("user_scenario") or {}
        instructions = scenario.get("instructions") or {}
        first = str(instructions.get("reason_for_call") or "Hello, I need help with something.")
        registry.register_user(build_scripted_user_class(first), "shadow_scripted_user")
        user_name = "shadow_scripted_user"

    llm_args_agent = llm_args_for(args.api_base, args.api_key_env)
    llm_args_user = llm_args_for(args.user_api_base or args.api_base, args.user_api_key_env or args.api_key_env)

    config = TextRunConfig(
        domain=args.domain,
        agent=agent_name,
        user=user_name,
        llm_agent=args.model or "dummy",
        llm_args_agent=llm_args_agent,
        llm_user=args.user_model or args.model or "dummy",
        llm_args_user=llm_args_user,
        max_steps=args.max_steps,
    )

    started = time.time()
    try:
        simulation = run_single_task(
            config,
            task,
            seed=args.seed,
            evaluation_type=EvaluationType.ALL,
        )
    except Exception as exc:  # noqa: BLE001 — result JSON is the error channel
        result = {
            "task_id": str(args.task_id),
            "passed": False,
            "reward": 0.0,
            "termination_reason": "error",
            "detail": f"driver error: {exc}",
            "duration_secs": round(time.time() - started, 3),
            "error": f"{type(exc).__name__}: {exc}",
            "traceback": traceback.format_exc(limit=8),
            "answer": None,
            "last_reply": None,
            "tool_calls": 0,
            "usage": None,
            "steps": [],
        }
        Path(args.out).write_text(json.dumps(result, indent=2), encoding="utf-8")
        return 1

    def enum_val(x):
        return getattr(x, "value", x)

    reward_info = getattr(simulation, "reward_info", None)
    reward = float(getattr(reward_info, "reward", 0.0) or 0.0) if reward_info else 0.0
    basis = [str(enum_val(b)) for b in (getattr(reward_info, "reward_basis", None) or [])] if reward_info else []
    term = str(enum_val(getattr(simulation, "termination_reason", "unknown")))
    breakdown = getattr(reward_info, "reward_breakdown", None) if reward_info else None
    breakdown = {str(enum_val(k)): v for k, v in breakdown.items()} if breakdown else {}

    passed = reward >= 1.0 and term in ("agent_stop", "user_stop")
    detail = f"reward={reward} basis={'+'.join(basis) or 'none'} term={term}"
    if breakdown:
        detail += " breakdown=" + json.dumps(breakdown, sort_keys=True)

    if args.save_dir:
        save = Path(args.save_dir)
        save.mkdir(parents=True, exist_ok=True)
        trajectory = {
            "task_id": str(args.task_id),
            "termination_reason": term,
            "reward_info": reward_info.model_dump(mode="json") if reward_info else None,
            "messages": [m.model_dump(mode="json") for m in simulation.messages],
        }
        (save / f"task-{args.task_id}-trajectory.json").write_text(
            json.dumps(trajectory, indent=2, default=str), encoding="utf-8"
        )

    result = {
        "task_id": str(args.task_id),
        "passed": passed,
        "reward": reward,
        "termination_reason": term,
        "detail": detail,
        "duration_secs": round(time.time() - started, 3),
        "error": None,
    }
    result.update(extract_run_facts(simulation))
    Path(args.out).write_text(json.dumps(result, indent=2), encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
