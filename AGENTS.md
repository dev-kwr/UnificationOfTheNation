# AGENTS.md - 天下統一 開発ガイド

## 🚀 実行・開発環境
- **統合コマンド**: `StartGame.command`
    - **機能**: 自動ポート解放、No-Cache（開発用）、ブラウザ自動起動、LAN内IP表示。
    - **注意**: `serve.command` は廃止・削除されました。

## 📂 プロジェクト構造
- `js/`: メインロジック（JavaScript）
    - `game.js`: ゲームループ・全体管理
    - `player.js`: プレイヤー挙動・当たり判定
    - `weapon.js`: 武器の挙動・攻撃ロジック
    - `enemy.js` / `boss.js`: 敵・ボスAI
    - `constants.js`: 全体定数
- `css/`: スタイルシート
- `bgm/` / `se/`: オーディオ資産
- `icon/`: 画像資産
- `weapon_growth_plan.md`: 現行の武器成長システム設計図

## 🛠 開発ルール
1. **言語**: UIテキスト、武器名、ログ出力はすべて**日本語**で統一すること。
2. **キャッシュ対策**: `StartGame.command` のサーバー経由であれば、JSの変更はリロードで即時反映される。
3. **一貫性**: 武器の追加や調整時は、`constants.js`, `weapon.js`, `player.js`, `ui.js` の整合性を常に保つこと。
4. **設計指針**: 現在は `weapon_growth_plan.md` に基づいた武器の進化・成長システムの構築を優先している。

---
*最終更新: 2026-03-03*

