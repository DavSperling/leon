# Annexe 4 : stockage, infra, crédits et conformité

Rapport de recherche brut (en anglais), relevé le 12/10/2026. EUR→USD à 1,08 (taux supposé par l'agent), hors TVA, mois = 730 h. ⚠ = non vérifié ou source secondaire. Utilisé pour les coûts fixes de l'onglet `Hypotheses`.

## 1. Object storage

| Provider | Storage $/GB-mo | Egress |
|---|---|---|
| S3 Paris / Frankfurt | 0.024 / 0.0245 | 100 GB/mo free, then $0.09/GB |
| GCS Paris & Frankfurt / Belgium | 0.023 / 0.020 per GiB | $0.12/GiB |
| Scaleway | €0.01606 multi-AZ; €0.00803 one-zone | 75 GB free, then €0.01/GB |
| OVHcloud multi-zone | ~$0.0157/GiB | free |
| Hetzner | €6.49 incl. 1 TB + 1 TB egress; then €6.26/TB-mo (64 KB minimum per object) | €1/TB |
| Cloudflare R2 | $0.015; $4.50/M writes, $0.36/M reads | free |

## 2. Managed Postgres (2 vCPU / 8 GB, 100 GB)

| Service | ~$/mo |
|---|---|
| RDS Paris (t4g.large / m7g.large + gp3) | 119 / 156; Multi-AZ ~311 |
| Cloud SQL Enterprise Paris | ~137; HA ~274 |
| Supabase Pro + Large compute (Paris/Frankfurt available) | ~137; PITR +$100 |
| Neon Launch (2 CU always-on) ⚠ | ~190 |
| Scaleway DB-PRO2-XXS | ~97; HA +€0.0583/h |

## 3. Vector databases (10M × 1536-d, 100k queries/mo)

| Service | Pricing | Floor | Est./mo |
|---|---|---|---|
| pgvector | host cost only; HNSW ≤2,000 dims (vector), ≤4,000 (halfvec) | – | – |
| Pinecone serverless | $0.33/GB; $4–4.50/M writes; $16–18/M reads | $50 | ~$154–170 + $320–360 one-off ingest |
| Turbopuffer ⚠ | ≤$0.33/GB; ≤$2/GB written; $1/PB queried | $16 / $256 | ~$31 |
| Qdrant Cloud ⚠ | per node-hour | ~$29 | ~$306 int8, ~$1,224 f32 |

## 4. Compute (on-demand, per month)

| Provider | 2 vCPU / 4–8 GB | 4 vCPU / 16 GB |
|---|---|---|
| AWS Paris | t4g.large $54.90; m7i.large $85.85 | t4g.xlarge $109.79; m7g.xlarge $138.99 |
| GCP Paris ⚠ | e2-standard-2 $56.74 | e2-standard-4 $113.49 |
| Scaleway | BASIC2-A2C-8G €25.18; PRO2-XXS €40.95 | BASIC2-A4C-16G €50.29; PRO2-XS €81.90 |
| Hetzner DE/FI | CX23 €5.49; CCX13 €42.99 (×2.7 since 2026-06-15) | CCX23 €85.99 |
| OVHcloud | b3-8 ≈ $44 | b3-16 ≈ $88 |

## 5. Startup credits

| Program | Max | Covers Claude / 3rd-party models? | GPUs |
|---|---|---|---|
| AWS Activate | $1k self-funded; up to $200k with a VC/accelerator Org ID | **Yes** (Bedrock third-party models, Anthropic named) | EC2 eligible; GPUs not named ⚠ |
| Google for Startups | $2k; $200k; AI tier $350k over 2 years (institutional funding) | **No** ("third-party models are billed directly") | not stated |
| Microsoft for Startups | $1k; up to $150k with investor code ⚠ | Azure OpenAI yes; **Anthropic excluded** | subject to availability |
| Scaleway | €1k / €9k / €36k | not stated | not stated ⚠ |
| OVHcloud | €10k; up to €100k | no | RTX5000/V100 only |

## 6. Footprint

- Bytes per vector (f32 / int8 / binary): 768-d 3,072 / 768 / 96 · 1024-d 4,096 / 1,024 / 128 · 1536-d 6,144 / 1,536 / 192 · 3072-d 12,288 / 3,072 / 384.
- HNSW graph ≈ 154 B/vector (Qdrant formula). f32 + HNSW for 1M / 10M chunks: 1024-d 4.2 / 42 GB; 1536-d 6.3 / 63 GB. 1536-d int8: 1.7 / 17 GB; binary: 0.35 / 3.5 GB.
- ⚠ pgvector: budget ~2× for heap + index. 3072-d requires halfvec to be indexed.
- Emails: ≈0.9 GB per 1M plain-text emails gzipped (Enron corpus ⚠); modern HTML email several times larger. Slack message size: not found, measure a sample export.

## 7. Compliance (mostly vendor sources)

- SOC 2 Type I: $17–48k year 1. SOC 2 Type II: $25–50k year 1, 3–12-month observation window.
- Vanta / Drata / Secureframe: $12–28k/yr under 50 staff (Vendr data).
- ISO 27001: year 1 incl. consulting $38–54k; surveillance $3–5k/yr.
- Pentest (web + API): $5–20k.

## Takeaways (1–100 customers of ~15 staff)

- Storage and egress are negligible (5 TB raw: $34 Hetzner – $120 S3/month; 10M vectors ≈ 63 GB).
- The material costs are fixed floors: Postgres $97–311/month, always-on workers, vector-DB minimums. Compliance is the biggest item and likely exceeds year-1 infra.
- The vector-store choice only matters at 10M+ chunks (int8 ~4×, Turbopuffer ~40× cheaper than f32 in RAM).
- EU providers are 1.4–3.5× cheaper on storage and up to ~2× on compute (Scaleway).
- Only AWS Activate officially covers Claude (via Bedrock).

## Sources (retrieved 2026-10-12)

AWS price list JSON (S3, data transfer, RDS, EC2 eu-west-3) · cloud.google.com/storage/pricing · cloud.google.com/sql/pricing · gcloud-compute.com (third-party) · scaleway.com/en/pricing/{storage,managed-databases,virtual-instances}/ · ovhcloud.com/en/public-cloud/prices/ · hetzner.com/storage/object-storage/ · docs.hetzner.com (price adjustment) · developers.cloudflare.com/r2/pricing/ · supabase.com/pricing · neon.com/pricing · github.com/pgvector/pgvector · qdrant.tech/documentation/capacity-planning/ · pinecone.io/pricing · turbopuffer.com/pricing · qdrant.tech/pricing · startups.aws.com/faq · cloud.google.com/startup/faq · learn.microsoft.com (Microsoft for Startups) · scaleway.com/en/startup-program/ · startup.ovhcloud.com · cs.cmu.edu/~enron/ · vendr.com/marketplace/{vanta,drata,secureframe} · drata.com/blog/soc-2-audit-cost · secureframe.com/hub/soc-2/audit-cost · secjur.com · grcsolutions.io · blazeinfosec.com
