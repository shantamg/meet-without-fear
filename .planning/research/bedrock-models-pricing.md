# AWS Bedrock: Anthropic Model Availability, Pricing & Speed

*Research Date: February 21, 2026*

## 1. Claude Sonnet 4.6 on Bedrock

**Status: Available** - launched on Bedrock simultaneously with Anthropic API on **February 17, 2026**.

| Field | Value |
|-------|-------|
| Model ID | `anthropic.claude-sonnet-4-6` |
| Release Date | February 17, 2026 |
| Context Window | 200K tokens (1M in beta) |
| Max Output | 16K tokens (standard) |
| Available Regions | 30+ regions including us-east-1, us-east-2, us-west-2, eu-central-1, ap-northeast-1, and many more |

## 2. All Available Anthropic Models on Bedrock

### Model IDs Reference

| Model | Bedrock Model ID | Status |
|-------|-------------------|--------|
| Claude Sonnet 4.6 | `anthropic.claude-sonnet-4-6` | Current |
| Claude Sonnet 4.5 | `anthropic.claude-sonnet-4-5-20250929-v1:0` | Current |
| Claude Sonnet 4 | `anthropic.claude-sonnet-4-20250514-v1:0` | Current |
| Claude Haiku 4.5 | `anthropic.claude-haiku-4-5-20251001-v1:0` | Current |
| Claude Opus 4.6 | `anthropic.claude-opus-4-6-v1` | Current |
| Claude Opus 4.5 | `anthropic.claude-opus-4-5-20251101-v1:0` | Current |
| Claude Opus 4.1 | `anthropic.claude-opus-4-1-20250805-v1:0` | Current (limited regions) |
| Claude 3.5 Haiku | `anthropic.claude-3-5-haiku-20241022-v1:0` | Legacy |
| Claude 3.5 Sonnet v2 | `anthropic.claude-3-5-sonnet-20241022-v2:0` | Extended Access (2x pricing!) |
| Claude 3 Haiku | `anthropic.claude-3-haiku-20240307-v1:0` | Legacy |

## 3. Pricing Comparison (Per Million Tokens)

### Standard On-Demand Pricing

| Model | Input | Output | Cache Write (5min) | Cache Read | Batch Input | Batch Output |
|-------|-------|--------|-------------------|------------|-------------|--------------|
| **Claude Sonnet 4.6** | $3.00 | $15.00 | $3.75 | $0.30 | $1.50 | $7.50 |
| **Claude Sonnet 4.5** | $3.00 | $15.00 | $3.75 | $0.30 | $1.50 | $7.50 |
| **Claude Sonnet 4** | $3.00 | $15.00 | $3.75 | $0.30 | $1.50 | $7.50 |
| **Claude Haiku 4.5** | $1.00 | $5.00 | $1.25 | $0.10 | $0.50 | $2.50 |
| Claude 3.5 Haiku | $0.80 | $4.00 | $1.00 | $0.08 | $0.40 | $2.00 |
| Claude Opus 4.6 | $5.00 | $25.00 | $6.25 | $0.50 | $2.50 | $12.50 |
| Claude Opus 4.5 | $5.00 | $25.00 | $6.25 | $0.50 | $2.50 | $12.50 |
| Claude 3.5 Sonnet v2 | **$6.00** | **$30.00** | $7.50 | $0.60 | $3.00 | $15.00 |

### Cache Pricing Multipliers (All Models)

| Cache Type | Multiplier vs Base Input |
|------------|-------------------------|
| 5-minute cache write | 1.25x |
| 1-hour cache write | 2.0x |
| Cache read/hit | 0.1x (90% discount!) |

### Long Context Pricing (>200K Input Tokens)

| Model | Input (>200K) | Output (>200K) |
|-------|---------------|----------------|
| Sonnet 4.6 / 4.5 / 4 | $6.00 | $22.50 |
| Opus 4.6 | $10.00 | $37.50 |

> **CRITICAL INSIGHT**: Claude 3.5 Sonnet v2 on Bedrock is now in "Extended Access" at **$6/$30 per MTok** - that's **2x the cost** of Sonnet 4/4.5/4.6 at $3/$15. If the app is currently using Claude 3.5 Sonnet, upgrading to Sonnet 4.5 or 4.6 would **cut costs in half AND improve quality**.

## 4. Speed & Latency Benchmarks

### Output Speed (Tokens/Second)

| Model | Anthropic API | AWS Bedrock | Notes |
|-------|---------------|-------------|-------|
| **Claude Sonnet 4.6** | 61.5 t/s | TBD (newly released) | Below avg for reasoning models (median: 71.5 t/s) |
| **Claude Sonnet 4.5** | 68.8 t/s | **95.7 t/s** | Bedrock is 39% faster than direct API! |
| **Claude Haiku 4.5** | ~80 t/s (est) | **94.2 t/s** | Great for latency-sensitive flows |
| Claude 3.5 Haiku | N/A | ~100+ t/s (with latency opt) | Fastest but legacy quality |

### Time to First Token (TTFT)

| Model | Anthropic API | AWS Bedrock | Notes |
|-------|---------------|-------------|-------|
| **Claude Sonnet 4.6** | **0.63s** | TBD | Very competitive TTFT |
| **Claude Sonnet 4.5** | 1.18s | 1.47s | Bedrock slightly slower TTFT |
| **Claude Haiku 4.5** | ~0.5s (est) | 0.87s | Good for chat responsiveness |

### Key Speed Insights

1. **Bedrock delivers higher throughput** for Sonnet 4.5 (95.7 vs 68.8 t/s) - likely due to AWS infrastructure optimization
2. **Sonnet 4.6 has excellent TTFT** (0.63s) despite below-average throughput - users see the first token fast
3. **Haiku 4.5 is the speed champion** at 94.2 t/s on Bedrock with low TTFT - ideal for quick exchanges
4. **Latency-optimized inference** available for select models (Claude 3.5 Haiku showed up to 51.7% TTFT reduction and 77% OTPS improvement)

## 5. Bedrock Cross-Region Inference

### Endpoint Types (for Sonnet 4.5+ and Haiku 4.5+)

| Endpoint Type | Pricing | Behavior |
|---------------|---------|----------|
| **Global** | Standard pricing | Dynamic routing across regions for max availability |
| **Regional** | **+10% premium** | Data stays within specified geographic region |

- Global cross-region inference is ~10% cheaper than regional
- Earlier models (Sonnet 4, Opus 4) retain flat pricing regardless of endpoint type
- Cross-region inference profiles route requests to available regions automatically

### Inference Profile IDs

For cross-region inference, use inference profile IDs instead of model IDs (e.g., `us.anthropic.claude-sonnet-4-5-20250929-v1:0` for US routing).

## 6. Bedrock vs Anthropic API Direct

### Feature Comparison

| Feature | AWS Bedrock | Anthropic API |
|---------|-------------|---------------|
| **Setup Complexity** | Higher (IAM, VPC, quotas) | Simple (API key) |
| **Token Pricing** | Same base pricing | Same base pricing |
| **Hidden Costs** | Data transfer, CloudWatch, VPC endpoints | None |
| **Prompt Caching** | Supported (5min & 1hr TTL) | Supported (5min & 1hr TTL) |
| **New Feature Access** | Delayed (days to weeks) | Immediate |
| **Model Switching** | Unified API across providers | Anthropic-only |
| **Auth/Security** | IAM roles, VPC isolation, CloudTrail | API keys |
| **Data Residency** | Regional endpoints guarantee | Global only (1.1x for US-only) |
| **Compliance** | SOC2, HIPAA, etc via AWS | Anthropic's own compliance |
| **Rate Limits** | Service quotas (adjustable) | Tier-based |
| **Streaming** | Supported | Supported |

### For Meet Without Fear Specifically

**Recommendation considerations:**

1. **If already on AWS**: Bedrock makes sense for unified infrastructure. Higher throughput (95.7 t/s for Sonnet 4.5) is a real advantage for chat UX.
2. **If prioritizing features**: Anthropic API direct gets extended thinking, new caching options, and new models faster.
3. **Prompt caching works on both**: Both platforms support the same caching semantics. Bedrock caching can reduce costs up to 90% for cache reads.
4. **For a therapy app**: Data residency matters. Bedrock's regional endpoints guarantee data stays in specific regions (10% premium). On Anthropic API, US-only inference is available at 1.1x pricing.
5. **Cost-wise**: Base token pricing is identical. Bedrock has operational overhead costs but offers batch pricing at 50% discount for non-real-time processing.

## 7. Cost Modeling for a Chat Therapy App

### Typical Conversation Estimates

Assuming ~2,000 tokens per AI response, ~500 tokens per user message, system prompt of ~3,000 tokens:

| Model | Cost per AI Response (uncached) | Cost per AI Response (cached system prompt) | Monthly (1,000 conversations, 10 turns each) |
|-------|--------------------------------|---------------------------------------------|----------------------------------------------|
| **Haiku 4.5** | ~$0.013 | ~$0.011 | ~$110 |
| **Sonnet 4/4.5/4.6** | ~$0.039 | ~$0.033 | ~$330 |
| **Opus 4.5/4.6** | ~$0.065 | ~$0.055 | ~$550 |
| Claude 3.5 Sonnet v2 (legacy) | ~$0.078 | ~$0.066 | **~$660** |

> **Key takeaway**: Upgrading from Claude 3.5 Sonnet to Sonnet 4.5/4.6 saves ~50% while getting a better model. Haiku 4.5 could handle simpler interactions at 1/3 the cost of Sonnet.

## 8. Recommendations for Meet Without Fear

### Model Selection Strategy

| Use Case | Recommended Model | Rationale |
|----------|-------------------|-----------|
| **Primary therapy chat** | Sonnet 4.5 or 4.6 | Best quality/cost ratio for nuanced conversation |
| **Quick classifications** | Haiku 4.5 | 3x cheaper, fast enough for routing/classification |
| **Empathy/perspective tasks** | Sonnet 4.5/4.6 | Requires high emotional intelligence |
| **Message analysis** | Haiku 4.5 | Pattern detection doesn't need frontier reasoning |
| **Reconciler** | Sonnet 4.5/4.6 | Complex multi-perspective synthesis |

### Platform Decision

- **Use Bedrock** if: already on AWS, need data residency guarantees, want IAM-based access control
- **Use Anthropic API** if: want simplest setup, need latest features immediately, want to avoid AWS operational overhead
- **Either way**: Prompt caching is available and should be implemented for system prompts and conversation history

---

*Sources:*
- [AWS Bedrock Pricing](https://aws.amazon.com/bedrock/pricing/)
- [Anthropic Pricing](https://platform.claude.com/docs/en/about-claude/pricing)
- [Claude Sonnet 4.6 on Bedrock announcement](https://aws.amazon.com/about-aws/whats-new/2026/02/claude-sonnet-4.6-available-in-amazon-bedrock/)
- [Bedrock Supported Models](https://docs.aws.amazon.com/bedrock/latest/userguide/models-supported.html)
- [Artificial Analysis - Sonnet 4.6](https://artificialanalysis.ai/models/claude-sonnet-4-6-adaptive)
- [Artificial Analysis - Sonnet 4.5 Providers](https://artificialanalysis.ai/models/claude-4-5-sonnet/providers)
- [Bedrock Cross-Region Inference](https://docs.aws.amazon.com/bedrock/latest/userguide/global-cross-region-inference.html)
- [Bedrock Prompt Caching](https://docs.aws.amazon.com/bedrock/latest/userguide/prompt-caching.html)
- [Bedrock Latency-Optimized Inference](https://aws.amazon.com/blogs/machine-learning/optimizing-ai-responsiveness-a-practical-guide-to-amazon-bedrock-latency-optimized-inference/)
