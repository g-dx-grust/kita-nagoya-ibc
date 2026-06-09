# AGENTS.md

Codexやその他AI Coding Agent向けの実装指示です。

## Mission

Implement a production planning and inventory-linked web application for the Kitagoya/North Nagoya manufacturing workflow. The app replaces a set of Excel workflows for production plans, material inventory, packaging inventory, shifts, daily production reports, labor fee calculation, cost calculation, and sales voucher export.

## Ground Rules

- Treat `docs/` as the specification.
- Treat `source_files/original_uploads/corrected_transcript_2026-04-24_160730.txt` as the corrected transcript.
- Ignore any previous Lark calendar requirement documents.
- Build phase by phase. Start with Phase 0 and Phase 1.
- Do not hard-code room names or supplier names. Use master tables.
- Separate planned values from actual values.
- Track stock movements as immutable ledger records, not only as mutable totals.
- Add tests for calculation logic.

## Implementation Priority

1. Master data model and CRUD
2. Manual production plan input
3. Production time calculation
4. BOM-driven raw material and packaging usage calculation
5. Stock shortage and pending order alerts
6. Daily report actual entry
7. Invoice/voucher export
8. Shift/room optimization and product stock auto planning later

## Definition of Done for an agent task

- Code compiles with strict TypeScript.
- Calculation functions have unit tests.
- Critical forms have validation.
- Screens use Japanese labels matching business terms.
- Migrations are included.
- Seed data covers at least several products, materials, work areas, employees, and sample production plans.
- README or implementation notes explain how to run and test.
