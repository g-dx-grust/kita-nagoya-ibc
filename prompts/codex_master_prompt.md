# Codex Master Prompt

Implement the Kitagoya production planning and inventory-linked web system based on this ZIP.

Read the following first:

- README.md
- AGENTS.md
- docs/00_project_overview.md
- docs/03_phase_1_manual_production_plan_mvp.md
- docs/10_data_model.md
- docs/11_api_contract.md
- docs/14_acceptance_tests.md

The previous Lark calendar scope is obsolete. The current scope is manufacturing planning, raw material and packaging inventory, purchase orders, shifts, daily reports, cost calculation, and sales voucher export.

Implement Phase 0 and Phase 1 first:

- Master CRUD
- Product BOM
- Work areas
- Production capacities
- Manual production plan input
- Production duration calculation
- Max quantity in time window calculation
- Required people calculation
- Material requirement calculation
- Stock shortage warnings

Keep future phases extensible but do not overbuild.
