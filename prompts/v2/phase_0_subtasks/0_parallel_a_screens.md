# Phase 0-A: 既存画面棚卸し（0-1〜0-3 と並列）

## 使用ツール

Claude Code

## 目的

既存画面（`app/src/app/` 配下の各ページ）が docs/18 §19-4 の画面一覧および docs/12_screen_requirements.md とどう対応するかを表にする。**デザイン崩しを起こさないための地図**。

## 前提

- 既存画面は1ピクセルも変えない。**閲覧と棚卸しのみ**。
- 出力先：`docs/phase_0_outputs/0_a_screens_inventory.md`

## 読むファイル

- `app/src/app/` 配下の各ディレクトリ（`page.tsx` を中心に。サーバーは起動しない）
- `app/src/app/layout.tsx`
- `app/src/app/app-nav.tsx`
- `app/src/components/layout/`
- `app/src/components/ui/`
- `docs/12_screen_requirements.md`
- `docs/18_implementation_phase_plan.md` §19-4

## やってほしいこと

1. 既存ページ一覧（パス、ファイル、概要、使用 API、利用 lib 関数）を作る。
2. docs/18 §19-4 の12画面に対し、既存ページが対応するか／流用候補があるか／新規が必要かを表にする。
3. 使われている UI コンポーネント（`app/src/components/ui/`）を列挙し、デザインシステムとして揃っている要素を把握する（Button, Input, Select, Table, Dialog, Toast 等の有無）。
4. ナビゲーション（`app-nav.tsx`）の現状メニュー構造を抽出し、docs/18 で追加が必要なメニュー項目を洗い出す（**追加位置の判断は人間に渡す**）。
5. レスポンシブ・テーマ・配色の現状（Tailwind の使い方、`globals.css`、`tailwind-merge`／`cva` の有無）を1段落で記録。
6. タブレット入力（Phase 5）に必要な要素（大きいタップ領域、スクロール挙動、オフライン考慮）が既存にどれだけあるかメモ。

## 出力フォーマット

`docs/phase_0_outputs/0_a_screens_inventory.md`

```markdown
# Phase 0-A 既存画面棚卸し

## 1. 既存ページ一覧
| パス | ファイル | 概要 | 使用 API | 使用 lib |

## 2. docs/18 画面一覧との対応
| docs/18 画面 | 既存ページ | 状態 (流用可/部分/無) | フェーズ |

## 3. UI コンポーネントライブラリ現状
- Button: ...
- Input: ...
- ...

## 4. ナビゲーション現状と追加候補
| 現状メニュー | パス |
| 追加候補メニュー | 接続先パス | フェーズ |

## 5. デザインシステム概観
- Tailwind: ...
- globals.css 主要トークン: ...
- cva: ...

## 6. タブレット適性
- ...

## 7. 判断保留事項
- ...
```

## 完了条件

- ファイルが書き出されている。
- `app/src/app/` 直下のディレクトリすべてが表に出ている。
- docs/18 §19-4 の12画面すべてに対応関係が付いている。

## 絶対にやらないこと

- `app/src/app/` 配下の編集（layout.tsx も含む）。
- `globals.css` の編集。
- `components/ui/` の編集。
- 配色・余白・タイポグラフィの「改善提案」（**現状記録まで**）。
- スクリーンショット取得のための dev サーバー起動。
