# WorldSimSeed

> **Write the rules. Run the world. See what emerges.**
>
> ルールを植えて、世界を走らせ、何が生まれるかを見る。

WorldSimSeed is an experimental open-source simulation engine for describing small worlds with simple rules and observing the patterns that emerge from them.

WorldSimSeed は、**確率・エージェント・時間・イベント・観測**という少数の要素から「小さな世界」を定義し、その世界を何度も走らせて、予想外の分布・格差・伝播・協力・崩壊・創発などを観察するための汎用シミュレーション基盤を目指す実験プロジェクトです。

数学やシミュレーションの専門家だけでなく、人間やAIが読み書きできる小さな世界定義から、ブラウザ上ですぐ実験できることを重視します。

## Status

**Early implementation / v0.1 vertical slice.**

v0.1のworld spec / security / architecture設計を土台に、最初のheadless実行系を実装中です。現在のvertical sliceは、制限付きYAML world specを読み、validation、seed付き実行、observer集計、run manifest出力までをNode/headlessで一通り通します。

## Core idea

たとえば、次のような世界を考えます。

- 1,000人が同じ資産から始まる
- 各人には正規分布した「才能」がある
- 一定確率で幸運・不運が起こる
- 幸運を活かせる確率は才能に影響される
- 40年後の資産分布、Gini係数、才能と富の相関を見る

重要なのは、特定の「才能と運」モデルを再現することではありません。

**世界のルールを差し替えられる小さなエンジン**にすることが目的です。

例：

- 才能ゼロ・運だけの社会
- 運ゼロ・才能だけの社会
- 人脈が多いほど機会が増える社会
- 不運を努力で一定確率回避できる社会
- 毎年もっとも貧しい人へ給付する社会
- 噂や流行がネットワークを伝播する世界
- 協力者と裏切者が共存する世界
- 人口・資源・出生・死亡が変化する世界
- 欲望を持つ人工住民が資源を奪い合う世界

## Proposed minimal model for v0.1

最初から「あらゆる数学」を扱おうとはしません。

v0.1では、次の5要素に絞る想定です。

1. **Agents** — 個体とその属性
2. **Time** — tick / step / year などの時間進行
3. **Events** — 確率的または条件付きで起こる出来事
4. **Rules** — 状態を変化させる規則
5. **Observers** — 分布・平均・相関・Giniなどの観測

Issue #2 のv0.1設計draftでは、**YAMLを人間向けの主なauthoring format、JSON互換データモデルをcanonical model** とします。構造はJSON Schema + semantic validatorで検証し、式はallowlist型の小さなexpression languageだけを許可します。

乱数は式の中の `random()` ではなく、初期値のdistributionとeventの `chance` に閉じ込めます。これにより、AIが生成したspecも通常のデータとして事前検証でき、seed固定の再現性を扱いやすくします。

- [world spec v0.1 draft](docs/world-spec-v0.1.md)
- [run manifest v0.1 draft](docs/run-manifest-v0.1.md)
- [JSON Schema draft](schemas/world-spec-v0.1.schema.json)
- [validation test vectors](docs/world-spec-v0.1-test-vectors.md)
- [Talent vs Luck sample](examples/talent-luck.world.yaml)
- [Threshold recovery sample](examples/threshold-recovery.world.yaml)
- [Resource decay sample](examples/resource-decay.world.yaml)

## Current vertical slice

実装済みの最小経路：

```text
world YAML
  → restricted YAML parser
  → structural / semantic validation
  → safe expression compile
  → deterministic seeded simulation
  → observers
  → run manifest
  → Node/headless CLI
```

開発中のCLI例：

```bash
npm install
npm run build
node dist/src/cli.js run examples/talent-luck.world.yaml --seed 42
```

または：

```bash
npm run demo
```

v0.1 world spec自体には、任意JavaScript、network/filesystem、import/include、host object accessはありません。YAML parserも一般的なYAML全体ではなく、設計文書で定義したJSON互換subsetだけを受理します。

## Architecture direction

WorldSimSeed は「アプリ」だけではなく、**埋め込み可能な部品**として使える構成を目指します。

想定レイヤー：

- `sim-core` — UIを持たないシミュレーションエンジン
- `world-spec` — 世界定義フォーマットとvalidator
- `sim-view` — グラフ・エージェント・ネットワーク等の可視化
- `web-component` — 他サイトへ埋め込めるWeb Component
- `headless` — UIなしで大量試行し統計を返す実行モード

将来的には、たとえば次のような埋め込みを想定します。

```html
<world-sim src="/worlds/example.yaml"></world-sim>
```

外部アプリからは、概念的には次のように操作できる形を検討します。

```js
sim.step();
sim.run(1000);
sim.getState();
sim.setParameter("scarcity", 0.8);
```

## NOZOMI Beingsとの接続可能性

WorldSimSeedは単独の教育・実験ツールとして成立させつつ、人工世界プロジェクト **NOZOMI Beings** の下層エンジンとして埋め込める可能性も検討します。

ゲームエンジンが重力・衝突・移動を扱うように、WorldSimSeedが

- 確率
- 人口
- 資源
- 格差
- 伝播
- 選択
- 協力／競争

などの「社会・人工世界の物理」を担当し、その上にNOZOMI側の人格・欲望・記憶などを載せるイメージです。

ただしWorldSimSeed自体はNOZOMI専用にはせず、独立したOSSとして再利用可能にします。

## Design principles

- **Small rules, emergent outcomes.** 少数のルールから結果が生えることを楽しむ
- **Readable by humans and AI.** 世界定義を人間にもAIにも読み書きしやすくする
- **Embeddable.** 他のWebアプリや人工世界へ組み込める
- **Deterministic when seeded.** 乱数seedを固定すれば再現可能にする
- **Headless first.** UIと計算エンジンを分離する
- **Inspectable.** ブラックボックス化せず、なぜその結果になったか追跡可能にする
- **Browser-friendly.** 可能ならサーバー不要でGitHub Pages等でも動かせる
- **Not a universal solver.** 数学全般を解く巨大ツールにはしない

## First reference experiment

最初の動作確認用モデル候補は、2018年の研究 *Talent versus luck: the role of randomness in success and failure* に着想を得た「才能・運・富」の簡易モデル。

これはWorldSimSeedの目的そのものではなく、次の機能を一度に検証できるためのreference modelとして使う想定です。

- 正規分布
- 確率イベント
- 条件付きイベント
- 乗算的状態変化
- 多数エージェント
- 複数回試行
- 分布・相関・Gini等の集計
- seed固定による再現

## Before coding

実装開始前に、GitHub Issuesで以下を整理します。

- 類似OSS・商用製品・研究ツールの調査
- WorldSimSeedの差別化と「作る意味」の確認
- v0.1 world spec / DSLの設計
- core / embed / visualization APIの境界
- reference modelと検証方法
- OSSライセンス、README、CONTRIBUTING、SECURITY等の公開準備
- パフォーマンス上限と安全な式評価方式

## Safety and OSS readiness

WorldSimSeed is being designed on the assumption that an external world spec is **untrusted input**.

For v0.1, a world spec is data rather than executable host code. Arbitrary JavaScript, spec-driven network/filesystem access, imports/includes, unbounded loops/recursion, and host-object access are outside the v0.1 boundary. Expression evaluation must use an explicit allowlist, and execution must remain subject to finite host-controlled resource limits.

Current project-readiness documents:

- [Security policy](SECURITY.md)
- [v0.1 threat model and resource-limit policy](docs/security-model.md)
- [v0.1 release checklist](docs/v0.1-release-checklist.md)
- [Contributing](CONTRIBUTING.md)
- [Changelog](CHANGELOG.md)

Resource-limit **categories** are part of the v0.1 contract, but numeric defaults will be selected after representative browser/Node benchmarks rather than frozen from early estimates.

## License

WorldSimSeed is released under the [MIT License](LICENSE).

## Research

- [類似OSS・製品・研究環境の調査と暫定判断（2026-08-22）](docs/research/2026-08-22-simulation-landscape.md)

## Next starting point

**Issue #2 の設計draftをレビューし、確定後は [Issue #3: core / embed / visualization の境界](https://github.com/yo4e/WorldSimSeed/issues/3) へ進む。**

Issue #2では、AI可読なworld spec、seed固定の再現実行、observer、run manifest、安全なexpression境界を具体的な文書・schema・sample worldへ落とし込んでいる。

---

Concept by 山田佳江 / 月野テンプレクス
