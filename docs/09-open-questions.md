# 09. Open questions (decide with the owner; do not guess silently)

1. In-browser model choice and runtime (WebGPU vs WASM fallback); verify current model availability and sizes before committing.
2. Whether contract notes should be parsed partly by the model (measurability of NFRs, mapping API lines to requirements) or only by deterministic rules in Milestone 1. Default: deterministic first, model-assisted behind a flag.
3. How learner "level" (mid/senior/staff) is set without adding UI. Default mid; maybe a setting in Details.
4. Box properties for capacity and single-point-of-failure rules (replicas, request rates). Default: read from node notes by simple patterns, no new UI.
5. Whether to add reconnect-by-dragging an arrow end (not in the prototype).
6. Touch behaviour needs real-device testing (hover-less dots).
7. LaTeX compile verification environment.
8. Licensing and rights for any third-party material used to write fixtures; keep fixtures original.
