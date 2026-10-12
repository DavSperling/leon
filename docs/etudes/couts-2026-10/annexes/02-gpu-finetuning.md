# Annexe 2 : GPU, fine-tuning et auto-hébergement

Rapport de recherche brut (en anglais), relevé le 12/10/2026. Utilisé pour les scénarios R3a, R3b et R4. **DERIVED** = calcul de l'agent, pas une mesure. Change supposé : 1 € ≈ 1,16 $ (non vérifié).

**Headline:** a fine-tuned 8B on an EU H100/L40S costs about $0.03–0.08 per 1M input tokens at 50% utilisation, but fixed costs of ~$4.5–7k/month mean it only beats Claude Haiku 5.5 above ~45–70B input tokens/month.

## 1. GPU prices (on-demand, per GPU-hour)

| GPU | Scaleway (FR/PL) | OVHcloud | AWS | GCP | RunPod comm./secure | Lambda | Modal |
|---|---|---|---|---|---|---|---|
| L4 | €0.792 | $1.00 | g6.xl Paris $1.022; 1-yr $0.791 | europe-west4 $0.897; 1-yr ≈$0.565 | $0.44/$0.49 | – | $0.80 |
| A10(G) | – | $1.00 | g5.xl $1.006, 1-yr $0.634 | – | – | $1.29 | $1.10 |
| L40S | €1.47 | $1.80 | g6e.xl $1.861, 1-yr $1.172 | – | $0.79/$1.09 | – | $1.95 |
| A100 80G | – | – | – | europe-west4 $5.58 | $1.19–1.39/$1.59 | $2.79 (8x only) | $2.50 |
| H100 | €2.868 PCIe; SXM €3.31 | $2.99 | p5.4xl $6.88; 3-yr $2.97 | Paris $12.83; 1-yr ≈$8.90 | $1.99–2.69/$2.89–3.49 | $3.29 PCIe / $4.29 SXM | $3.95 |
| H200 / B200 | – | H200 ≈$6.20 (8x) | – | – | $3.59 / $5.98 | B200 $6.99 | $4.54 / $6.25 |

Scaleway (PAR1, PAR2, WAW2) GPUs are not eligible for Savings Plans. Modal charges 1.15–1.75× for region pinning. RunPod/Lambda EU regions unverified.

## 2. Throughput, 8B model on one GPU at saturation

| GPU | Setup | Input tok/s | Output tok/s |
|---|---|---|---|
| H100 | FP8 TRT-LLM, 2048 in / 128 out (measured) | ~52,400 | 3,276 |
| H100 | FP8 TRT, 128 / 2048 (decode-heavy) | – | 21,413 |
| H100 | BF16 vLLM, 7B, ~16K in / 256 out | ~36,000 | ~580 |
| A100 | TRT 2048/128 and 128/2048 | ~14,500 | 4,910 |
| L40S | FP8, DERIVED from specs | 12–20k | 1.5–2.1k |
| L4 | DERIVED | 4–6k | 0.5–0.95k |

No credible L4/L40S benchmarks found: measure before committing.

**Derived cost per 1M tokens** (50% utilisation, on-demand): H100 Scaleway $0.035–0.062 in / $0.09–0.19 out; L40S Scaleway $0.047–0.079 in / $0.45–0.63 out; L4 Scaleway $0.085–0.13 in. Per 1,000 items (2,048 in / 128 out): H100 Scaleway $0.07; Haiku 5.5 $0.27 ($0.13 batch); gpt-5-nano $0.15; Sonnet 5.5 $5.38.

## 3. CPU

8B on CPU (llama.cpp, ~250 tok/s on a 64-vCPU c8g.16xlarge at $2.55/h): ~$2.8 per 1M input tokens → **not viable**. A small encoder classifier (ModernBERT) for triage: ~$0.01/M tokens on a GPU; no reliable CPU benchmark.

## 4. Fine-tuning (1.5k tokens per example, 3 epochs)

| Option | 10k examples | 100k examples |
|---|---|---|
| Self-run LoRA on H100 (DERIVED) | ~$5–7 | ~$50–70 |
| Together SFT, 8B, $0.34/M | $15 | $153 |
| Fireworks LoRA ≤16B, $0.50/M | $23 | $225 |
| OpenAI gpt-4.1-nano $1.50/M | $68 | $675 |
| Labels via Sonnet 5.5 batch | $30 | $300 |
| Labels via Opus 5.5 batch | $60 | $600 |

Budget 5–10× for iteration and evals. Human label review not priced.

## 5. Storage of model weights

16 GB (8B BF16) to 60 GB (30B): at most ~$5/month. Negligible.

## 6. Hidden and ops costs

- A 24/7 GPU bills when idle; at <5% utilisation the effective $/M is 10×+ the table.
- Cold starts ~50–90 s: acceptable for an async ingestion queue → per-second serverless is viable. 1B tokens/month ≈ 7 H100-hours on Modal ≈ $27 (Haiku 5.5: $100).
- N+1 redundancy doubles fixed GPU cost.
- 0.25–0.5 FTE MLOps ≈ €2–4k/month (Paris MLOps €63–86k gross + ~45% employer charges, via search summary).

## Smallest sensible EU production setup

2× L40S Scaleway 24/7 = €2,146/month (~$2,490); one H100 €2,094/month. One L40S absorbs ~16–26B input tokens/month (DERIVED). With the engineer share: **~$4.5–7k/month fixed**. Break-even vs Haiku 5.5: ~45–70B input tokens/month (90–140B vs batch); vs Sonnet 5.5: ~2.3–3.5B.

## Sources (retrieved 2026-10-12)

scaleway.com/en/blog/a-transparent-update-on-scaleway-pricing · scaleway.com/en/gpu-instances · ovhcloud.com/en/public-cloud/gpu · runpod.io/pricing · lambda.ai/pricing · modal.com/pricing · devzero.io/instances/aws/g6.xlarge · instances.vantage.sh (g6e.xlarge, g5.xlarge, p5.4xlarge, c8g.16xlarge) · gcloud-compute.com (third-party) · nvidia.github.io/TensorRT-LLM/performance/perf-overview.html · docs.e2enetworks.com/docs/tir/benchmarks/inference_benchmarks · jarvislabs.ai/blog/vllm-sglang-trtllm-comparison · nvidia.com data-center specs · github.com/ikawrakow/ik_llama.cpp/discussions/164 · github.com/mozilla-ai/llamafile/discussions/450 · arxiv.org/html/2412.13663 · together.ai/pricing · fireworks.ai/pricing · developers.openai.com/api/docs/pricing · platform.claude.com/docs/en/about-claude/pricing · cerebrium.ai and runpod.io blog (cold starts, via search summary) · travail-industrie.com (salary, via search summary)
