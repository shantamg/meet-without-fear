# Real LLM Policy

Completion requires bounded gold-loop passes with `MOCK_LLM=false`.

Mocked runs may be used for local plumbing checks, focused debugging, or regression development, but they cannot satisfy clean-pass completion criteria.

If real LLM access, credentials, quota, or cost blocks reruns, route the blocker to `human_decision` and stop before claiming completion.
