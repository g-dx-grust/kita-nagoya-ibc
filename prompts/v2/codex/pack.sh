#!/usr/bin/env bash
# Pack the session prelude + one subtask prompt into a single paste-ready text.
# Searches prompts/v2/phase_*_subtasks/ for the matching slug.
#
# Usage:
#   ./prompts/v2/codex/pack.sh <task-slug>
#
# task-slug examples (matches prompts/v2/phase_*_subtasks/<slug>.md, without .md):
#   Phase 1:
#     1_t_test_infra, 1_1_products_extension, 1_2_materials_packaging_extension,
#     1_s_suppliers_extension, 1_3_bom_validity_period, 1_4_work_areas_extension,
#     1_5_capacities_extension, 1_7_equivalence_special_events,
#     1_6_shift_patterns_breaks, 1_u_masters_ui_extension, 1_v_csv_import_extension
#   Phase 2:
#     2_t_integration_tests_first, 2_1_stock_movement_extension, 2_2_ledger_unification,
#     2_4_unified_inventory_calc, 2_5_unconfirmed_separation, 2_u_product_inventory_ui
#
# Output goes to stdout. Pipe to pbcopy on macOS:
#   ./prompts/v2/codex/pack.sh 2_1_stock_movement_extension | pbcopy

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
PRELUDE="$SCRIPT_DIR/0_session_prelude.md"
PHASE_DIRS=(
  "$REPO_ROOT/prompts/v2/phase_1_subtasks"
  "$REPO_ROOT/prompts/v2/phase_2_subtasks"
  "$REPO_ROOT/prompts/v2/phase_3_subtasks"
  "$REPO_ROOT/prompts/v2/phase_4_subtasks"
  "$REPO_ROOT/prompts/v2/phase_5_subtasks"
  "$REPO_ROOT/prompts/v2/phase_6_subtasks"
  "$REPO_ROOT/prompts/v2/phase_7_subtasks"
  "$REPO_ROOT/prompts/v2/phase_8_subtasks"
  "$REPO_ROOT/prompts/v2/phase_9_subtasks"
  "$REPO_ROOT/prompts/v2/hotfixes"
)

list_tasks() {
  echo "Available tasks:" >&2
  for dir in "${PHASE_DIRS[@]}"; do
    if [ -d "$dir" ]; then
      phase_label=$(basename "$dir")
      echo "  [$phase_label]" >&2
      ls "$dir" 2>/dev/null | grep -E '\.md$' | grep -v '^README\.md$' | sed 's/\.md$//' | sed 's/^/    /' >&2
    fi
  done
}

if [ $# -lt 1 ]; then
  echo "Usage: $0 <task-slug>" >&2
  list_tasks
  exit 1
fi

SLUG="$1"
TASK=""
for dir in "${PHASE_DIRS[@]}"; do
  candidate="$dir/${SLUG}.md"
  if [ -f "$candidate" ]; then
    TASK="$candidate"
    break
  fi
done

if [ -z "$TASK" ]; then
  echo "Task file not found for slug: $SLUG" >&2
  list_tasks
  exit 1
fi

if [ ! -f "$PRELUDE" ]; then
  echo "Prelude not found: $PRELUDE" >&2
  exit 1
fi

cat "$PRELUDE"
echo
echo
echo "============================================================"
echo "# 次のサブタスク（このまま実装してください）"
echo "# Source: ${TASK#$REPO_ROOT/}"
echo "============================================================"
echo
cat "$TASK"
