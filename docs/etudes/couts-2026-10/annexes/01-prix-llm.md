# Annexe 1 : prix des API LLM

Rapport de recherche brut (en anglais), relevé le 12/10/2026 sur les pages officielles. Utilisé dans l'onglet `Prix` du tableur.

All numbers from official pages, retrieved 2026-10-12, USD per 1M tokens unless stated.

Source keys: [A] https://platform.claude.com/docs/en/about-claude/pricing · [O] https://developers.openai.com/api/docs/pricing · [G] https://ai.google.dev/gemini-api/docs/pricing · [T] https://www.together.ai/pricing · [F] https://fireworks.ai/pricing, https://docs.fireworks.ai/serverless/pricing · [D] https://deepinfra.com/pricing · [Q] https://console.groq.com/docs/models

## 1. Anthropic

| Model | In | Out | Cache: 5m write / 1h write / read · batch in/out | Src |
|---|---|---|---|---|
| Fable 5.1 | 10 | 50 | 12.50 / 20 / 0.25 · 5 / 25 | A |
| Opus 5.5 | 4 | 20 | 5 / 8 / 0.20 · 2 / 10 | A |
| Sonnet 5.5 | 2 | 10 | 2.50 / 4 / 0.10 · 1 / 5 | A |
| Sonnet 5 | 2 | 10 | 2.50 / 4 / 0.20 · 1 / 5 | A |
| Haiku 5.5, prompt ≤100k | 0.10 | 0.50 | 0.125 / 0.20 / 0.01 · 0.05 / 0.25 | A |
| Haiku 5.5, prompt >100k | 0.50 | 2.50 | 0.625 / 1 / 0.05 · 0.25 / 1.25 | A |
| Haiku 4.5 | 1 | 5 | 1.25 / 2 / 0.10 · 0.50 / 2.50 | A |

- **Revérifié le 14/10/2026** sur [A] : tous les prix Anthropic ci-dessus sont inchangés. Le prix de lecture du cache de Sonnet 5.5, noté « 0.10–0.20 (sources differ) » le 12/10, vaut 0,10 $ : la lecture du cache coûte 0,05x le prix d'entrée sur Opus 5.5 et Sonnet 5.5, et 0,025x sur Fable 5.1. Coûts mesurés sur de vraies conversations : [annexe 6](06-couts-mesures-pipeline.md).
- Batch is −50%. Long context: no surcharge up to 1M tokens from 4.6 on, except Haiku 5.5 above 100k tokens (whole request billed at the higher rate).
- Opus 5.5: thinking cannot be disabled; thinking tokens are billed as output.

## 2. OpenAI

| Model | In | Out | Cached · batch in/out |
|---|---|---|---|
| gpt-5-nano | 0.05 | 0.40 | 0.005 · 0.025 / 0.20 |
| gpt-6-luna | 0.10 | 0.50 | 0.01 · 0.05 / 0.25 |
| gpt-5.6-luna | 0.20 | 1.20 | 0.02 · 0.10 / 0.60 |
| gpt-5-mini | 0.25 | 2.00 | 0.025 · 0.125 / 1.00 |
| gpt-5.4-mini | 0.75 | 4.50 | 0.075 · 0.375 / 2.25 |
| gpt-6.1-sol | 2 | 10 | 0.10 · 1 / 5 (promo at least until 2026-11-21) |
| gpt-5.6-terra | 2 | 12 | 0.20 · 1 / 6 |
| gpt-6-astra | 10 | 50 | 1.00 · 5 / 25 |

- Prompts over 272K input tokens: ~2× input, 1.5× output. Flex tier ≈ half of Standard.
- **Fine-tuning:** gpt-4.1-nano $1.50/M training (inference 0.20 / 0.05 / 0.80); gpt-4o-mini $3.00/M; gpt-4.1-mini $5.00/M; o4-mini $100/h. No GPT-5/6 model is fine-tunable, and the page states "OpenAI is winding down the fine-tuning platform."

## 3. Gemini

| Model | In | Out | Caching (+ storage) · batch in/out |
|---|---|---|---|
| gemini-3.8-flash / 3.6-flash | 0.75 → 1.50 on 2027-01-01 | 3.75 → 7.50 | 0.075 (+ $0.50/MTok/h) · 0.375 / 1.875 |
| gemini-3.5-flash-lite | 0.30 | 2.50 | 0.03 (+ $1/MTok/h) · 0.15 / 1.25 |
| gemini-3.1-flash-lite | 0.25 | 1.50 | 0.025 (+ $1/MTok/h) · 0.125 / 0.75 |
| gemini-3.1-pro-preview | 2 (4 >200k) | 12 (18 >200k) | 0.20 / 0.40 (+ $4.50/MTok/h) · 1 / 6 |

## 4. Hosted open-weight models

| Model | In | Out | Src |
|---|---|---|---|
| Together Llama 3 8B Instruct Lite | 0.14 | 0.14 | T |
| Together Qwen3.5 9B | 0.17 | 0.25 | T |
| Together Gemma 4 31B | 0.39 | 0.97 | T |
| Fireworks 4B–16B tier | 0.20 | 0.20 (batch −50%) | F |
| Fireworks >16B tier | 0.90 | 0.90 (MoE ≤56B: 0.50) | F |
| DeepInfra Llama-3.1-8B-Instruct-Turbo | 0.02 | 0.04 | D |
| DeepInfra Qwen3.5-9B | 0.10 | 0.15 | D |
| DeepInfra Mistral-Small-3.2-24B | 0.075 | 0.20 | D |
| DeepInfra Qwen3-30B-A3B | 0.12 | 0.50 | D |
| Groq openai/gpt-oss-20b | 0.075 | 0.30 | Q |

LoRA fine-tuning and serving: Together SFT $0.34/M (8–9B), $1.05/M (27–35B), min $4/job; serverless LoRA discontinued, dedicated endpoint from $5.49/GPU-h (H100). Fireworks LoRA SFT $0.50/M (≤16B), $3.00/M (16–80B); serverless LoRA at base-model price. DeepInfra custom serving $0.89/h (A100), $2.20/h (H100).

## 5. Embeddings

| Model | $/MTok | Default dims |
|---|---|---|
| OpenAI text-embedding-3-small | 0.02 | 1536 |
| OpenAI text-embedding-3-large | 0.13 | 3072 |
| gemini-embedding-2 | 0.20 (batch 0.10) | 3072 |
| voyage-4-large / voyage-4 / voyage-4-lite | 0.12 / 0.06 / 0.02 (first 200M tokens free) | 1024 |
| Cohere embed-v5.0-pro / fast | 0.12 / 0.08 (launch blog, 2026-09-30) | 2048 |

## Notes and caveats

1. **Discounts stack** on Anthropic (cache × batch × US-only 1.1). Gemini caching also bills hourly storage.
2. **Promotions end**: Gemini 3.8/3.6 Flash doubles on 2027-01-01; GPT-6.1 Sol promo until at least 2026-11-21.
3. **Tokenizers differ**: Claude 4.7+ produces ~30% more tokens for the same text. Compare cost per document.
4. **EU residency**: Anthropic first-party offers only "global" or "us" inference; Bedrock / Vertex regional endpoints +10%. OpenAI EU (eu.api.openai.com) +10% with ZDR or MAM.
5. **Retention**: the Anthropic Batch API is not ZDR-eligible (29-day retention). Fable/Mythos require 30-day retention. Gemini free tier may use data for training — never send customer data through it. Sources: https://platform.claude.com/docs/en/manage-claude/api-and-data-retention, https://platform.claude.com/docs/en/manage-claude/data-residency, https://developers.openai.com/api/docs/guides/your-data
6. **Fine-tuning platforms are receding**: OpenAI winding down; Together dropped serverless LoRA; Fireworks still serves LoRA serverless.
7. **Unverified**: Groq Llama 8B price and discounts; Together batch discount and which fine-tuning table is LoRA; Cohere per-token prices on its pricing page; Gemini EU pricing on Vertex.
