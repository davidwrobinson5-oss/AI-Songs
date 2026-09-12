# Open-source cost reduction research

Status: planned future development, requested September 12, 2026. Research and benchmarks are not yet complete. Continue the current accounting, parity, billing and mobile verification work; use its measured costs as the baseline for this research.

## Starting candidate

The supplied screenshot identifies `debpalash/VoiceStudio` and promotes local voice cloning, dubbing, audiobook creation and transcription. Treat the post's claims, engine counts, popularity and savings as unverified leads. Locate the official repository and documentation, verify maintenance and security status, and inspect the application, dependency and model-weight licenses separately. Determine what it actually replaces in Pie: speech tooling does not by itself establish suitability for singing conversion or music generation.

## Research scope

- Inventory paid services and map each to the specific Pie feature, measured usage, fixed fees and variable charges.
- Research open-source candidates for speech synthesis/cloning, singing voice conversion, music generation, stem separation, transcription, sheet/MIDI/chord extraction and text assistance. Include infrastructure alternatives where measured savings justify the migration effort.
- Use primary repositories, model cards, license texts and official documentation; record source URLs, versions and research dates. Distinguish open source from merely downloadable weights or noncommercial research releases.
- Evaluate commercial SaaS use, redistribution, hosted-service obligations, attribution, model restrictions, voice consent, privacy, dependency risks and maintenance health. Resolve licensing uncertainty before adoption.
- Benchmark representative Pie inputs and user-approved voices against the current providers. Measure output quality, successful completion, retries, latency, throughput, GPU/CPU/RAM/VRAM requirements and cost per successful output.
- Compare local-owner operation, hosted inference and hybrid deployment. Include idle GPU time, storage, bandwidth, scaling, monitoring, maintenance and migration costs. Local execution on a developer machine does not establish mobile/customer hosting feasibility.
- Calculate break-even usage and margin effects using verified invoices and measured infrastructure prices; label estimates and assumptions explicitly. Open source does not imply zero operating cost.

## Deliverables and adoption gates

Produce a source-backed comparison matrix, license/compatibility findings, reproducible quality/cost benchmarks, total-cost scenarios and a ranked adopt/test/defer recommendation. Prioritize the highest verified cost drivers. Pilot one replacement behind a provider adapter with usage receipts and an existing-provider fallback. Verify saved data, owner/client isolation and Android/Apple browser workflows before rollout. Keep paid services until the replacement meets the agreed quality, reliability and total-cost targets.

Track this as a development backlog item alongside the current release gates.
