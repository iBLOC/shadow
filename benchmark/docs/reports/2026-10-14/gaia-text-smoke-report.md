# Benchmark report — gaia-text-smoke

generated: unix-1791961451 · repeat: 1 (pass^k = all repeats pass)

## Summary

| agent | passed | failed | skipped | pass-rate | pass^k | median s |
|---|---|---|---|---|---|---|
| glm-53-agentic | 5 | 5 | 0 | 50% | 50% | 768.75 |
| kimi-k3-agentic | 8 | 2 | 0 | 80% | 80% | 225.45 |
| qwen37-flash-agentic | 4 | 6 | 0 | 40% | 40% | 299.80 |
| qwen38-max-agentic | 7 | 3 | 0 | 70% | 70% | 355.85 |

## Task matrix

| task | qwen38-max-agentic | kimi-k3-agentic | glm-53-agentic | qwen37-flash-agentic |
|---|---|---|---|---|
| 04a04a9b-226c-43fd-b319-d5e89743676f | ✓ | ✓ | ✗ | ✗ |
| 14569e28-c88c-43e4-8c32-097d35b9a67d | ✓ | ✓ | ✗ | ✓ |
| 17b5a6a3-bc87-42e8-b0fb-6ab0781ef2cc | ✓ | ✓ | ✓ | ✗ |
| 3627a8be-a77f-41bb-b807-7e1bd4c0ebdf | ✗ | ✓ | ✗ | ✓ |
| 5d0080cb-90d7-4712-bc33-848150e917d3 | ✓ | ✓ | ✗ | ✗ |
| 8e867cd7-cff9-4e6c-867a-ff5ddc2550be | ✓ | ✓ | ✓ | ✗ |
| a1e91b78-d3d8-4675-bb8d-62741b4b68a6 | ✗ | ✗ | ✓ | ✓ |
| c61d22de-5f6c-4958-a7f6-5e9707bd3466 | ✓ | ✗ | ✗ | ✗ |
| e1fc63a2-da7a-432f-be78-7c4a95598703 | ✓ | ✓ | ✓ | ✗ |
| ec09fa32-d03f-4bf8-84b0-1f16922c3ae4 | ✗ | ✓ | ✓ | ✓ |

## Failure details

- **qwen38-max-agentic / 3627a8be-a77f-41bb-b807-7e1bd4c0ebdf** (rep0): agent 'qwen38-max-agentic' failed: task timed out after 900s
- **qwen38-max-agentic / ec09fa32-d03f-4bf8-84b0-1f16922c3ae4** (rep0): agent 'qwen38-max-agentic' failed: task timed out after 900s
- **qwen38-max-agentic / a1e91b78-d3d8-4675-bb8d-62741b4b68a6** (rep0): agent 'qwen38-max-agentic' failed: task timed out after 900s
- **kimi-k3-agentic / c61d22de-5f6c-4958-a7f6-5e9707bd3466** (rep0): gaia mismatch: expected "egalitarian", got "Identified the June 2022 AI-regulation paper as arXiv:2207.01510. Its figure labels one axis “Utilitarian” versus “Egalitarian.” The August 11, 2016 Physics and Society article arXiv:1608.03637 describes “egalitarian societies” (and a transition from egalitarian to hierarchical societies)."
- **kimi-k3-agentic / a1e91b78-d3d8-4675-bb8d-62741b4b68a6** (rep0): gaia mismatch: expected "3", got "Let me confirm the clip's content via web articles about this viral moment."
- **glm-53-agentic / c61d22de-5f6c-4958-a7f6-5e9707bd3466** (rep0): gaia mismatch: expected "egalitarian", got "egalitarianism"
- **glm-53-agentic / 04a04a9b-226c-43fd-b319-d5e89743676f** (rep0): agent 'glm-53-agentic' failed: task timed out after 900s
- **glm-53-agentic / 14569e28-c88c-43e4-8c32-097d35b9a67d** (rep0): agent 'glm-53-agentic' failed: task timed out after 900s
- **glm-53-agentic / 3627a8be-a77f-41bb-b807-7e1bd4c0ebdf** (rep0): agent 'glm-53-agentic' failed: task timed out after 900s
- **glm-53-agentic / 5d0080cb-90d7-4712-bc33-848150e917d3** (rep0): gaia mismatch: expected "0.1777", got "Found the paper's PDF URL via OpenAlex. Let me download it."
- **qwen37-flash-agentic / c61d22de-5f6c-4958-a7f6-5e9707bd3466** (rep0): gaia mismatch: expected "egalitarian", got ""
- **qwen37-flash-agentic / 17b5a6a3-bc87-42e8-b0fb-6ab0781ef2cc** (rep0): gaia mismatch: expected "34689", got ""
- **qwen37-flash-agentic / 04a04a9b-226c-43fd-b319-d5e89743676f** (rep0): gaia mismatch: expected "41", got ""
- **qwen37-flash-agentic / e1fc63a2-da7a-432f-be78-7c4a95598703** (rep0): gaia mismatch: expected "17", got ""
- **qwen37-flash-agentic / 8e867cd7-cff9-4e6c-867a-ff5ddc2550be** (rep0): agent 'qwen37-flash-agentic' failed: request: error sending request for url (https://maas.qianwenaiapi.com/compatible-mode/v1/chat/completions)
- **qwen37-flash-agentic / 5d0080cb-90d7-4712-bc33-848150e917d3** (rep0): gaia mismatch: expected "0.1777", got ""
