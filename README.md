# WorldSimSeed

> **Write the rules. Run the world. See what emerges.**
>
> ルールを植えて、世界を走らせ、何が生まれるかを見る。

WorldSimSeed is an experimental open-source simulation engine for describing small worlds with simple rules and observing the patterns that emerge from them.

WorldSimSeed は、**確率・エージェント・時間・イベント・観測**という少数の要素から「小さな世界」を定義し、その世界を何度も走らせて、予想外の分布・格差・伝播・協力・崩壊・創発などを観察するための汎用シミュレーション基盤を目指す実験プロジェクトです。

数学やシミュレーションの専門家だけでなく、人間やAIが読み書きできる小さな世界定義から、ブラウザ上ですぐ実験できることを重視します。

## Status

**Early implementation / v0.1.**

v0.1のworld spec / security / architecture設計を土台に、Node/headlessのvertical sliceは成立済みです。現在は同じ `spec` / `core` semantics をbrowser Workerへ持ち込み、最小Web Component `<world-sim>` から実行できるところまで進んでいます。

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

v0.1設計では、**YAMLを人間向けの主なauthoring format、JSON互換データモデルをcanonical model** とします。構造はstructural + semantic validationで検証し、式はallowlist型の小さなexpression languageだけを許可します。

乱数は式の中の `random()` ではなく、初期値のdistributionとeventの `chance` に閉じ込めます。これにより、AIが生成したspecも通常のデータとして事前検証でき、seed固定の再現性を扱いやすくします。

- [world spec v0.1 draft](docs/world-spec-v0.1.md)
- [run manifest v0.1 draft](docs/run-manifest-v0.1.md)
- [JSON Schema draft](schemas/world-spec-v0.1.schema.json)
- [validation test vectors](docs/world-spec-v0.1-test-vectors.md)
- [Talent vs Luck sample](examples/talent-luck.world.yaml)
- [Threshold recovery sample](examples/threshold-recovery.world.yaml)
- [Resource decay sample](examples/resource-decay.world.yaml)

## Current vertical slice

Node/headlessの最小経路：

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

ブラウザ側は同じportable layerを使い、その外側にWorkerとWeb Componentを置きます：

```text
<world-sim>
  → host-owned src fetch / inline world
  → module Worker
  → same spec / core semantics
  → snapshots / metrics / run manifest
  → DOM Custom Events
```

CLI例：

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

## Web embedding

ビルド済みのweb entryを読み込むと、`<world-sim>` を埋め込めます。

```html
<script type="module" src="/dist/src/web/index.js"></script>

<world-sim
  src="/examples/talent-luck.world.yaml"
  seed="42">
</world-sim>
```

最小demoは [`examples/web/index.html`](examples/web/index.html)、詳しい境界とAPIは [Web embedding v0.1](docs/web-embedding-v0.1.md) を参照してください。

`src` のfetchは埋め込みhost側の権限で行い、world spec自身にはnetwork権限を与えません。長い `run()` はWorker内でchunk実行し、main threadを占有せず、chunk間でcancelを受け取れるようにします。

Web Componentの主な操作：

```js
await element.load();
await element.step();
await element.run();
await element.reset({ seed: 42 });
await element.getState();
await element.getMetrics();
await element.exportRun();
```

v0.1ではrun途中のparameter変更は行わず、変更はreset/new runとして扱います。

## Architecture direction

WorldSimSeed は「アプリ」だけではなく、**埋め込み可能な部品**として使える構成を目指します。

v0.1では1つのpackage内に、次の論理境界を置きます。

- `worldsimseed/spec` — world spec parser / validator / compiler
- `worldsimseed/core` — UI/I/Oを持たないsimulation core
- `worldsimseed/runner` — single / batch run orchestration
- `worldsimseed/web` — Worker / Web Component browser adapter
- `view` — visualization境界。豪華な可視化はcore安定後に追加

詳しくは [architecture v0.1](docs/architecture-v0.1.md) を参照してください。

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

## Batch experiments

v0.1 experiment requests can expand parameter alternatives × seed sets into reproducible batch runs.

```bash
npm run demo:batch
```

The batch runner keeps a resolved manifest and metrics per run, reports aggregate count/mean/min/max for numeric observers, enforces `maxRuns`, and can retain trace only for selected seeds.

See [run manifest / experiment request draft](docs/run-manifest-v0.1.md) and the [reference-model validation notes](docs/reference-model-v0.1.md).

## First reference experiment

最初の動作確認用モデルは、2018年の研究 *Talent versus luck: the role of randomness in success and failure* に着想を得た「才能・運・富」の簡易モデルです。

これはWorldSimSeedの目的そのものではなく、次の機能を一度に検証できるreference modelとして使います。

- 正規分布
- 確率イベント
- 条件付きイベント
- 乗算的状態変化
- 多数エージェント
- 複数回試行
- 分布・相関・Gini等の集計
- seed固定による再現

## Design foundation

実装前に、GitHub Issuesで以下を整理しました。

- 類似OSS・商用製品・研究ツールの調査
- WorldSimSeedの差別化と「作る意味」の確認
- v0.1 world spec / DSLの設計
- core / embed / visualization APIの境界
- reference modelと検証方法
- OSSライセンス、README、CONTRIBUTING、SECURITY等の公開準備
- パフォーマンス上限と安全な式評価方式

## Safety and OSS readiness

WorldSimSeed is designed on the assumption that an external world spec is **untrusted input**.

For v0.1, a world spec is data rather than executable host code. Arbitrary JavaScript, spec-driven network/filesystem access, imports/includes, unbounded loops/recursion, and host-object access are outside the v0.1 boundary. Expression evaluation uses an explicit allowlist, and execution remains subject to finite host-controlled resource limits.

Current project-readiness documents:

- [Security policy](SECURITY.md)
- [v0.1 threat model and resource-limit policy](docs/security-model.md)
- [v0.1 release checklist](docs/v0.1-release-checklist.md)
- [Contributing](CONTRIBUTING.md)
- [Changelog](CHANGELOG.md)

Resource-limit **categories** are part of the v0.1 contract, but final numeric release defaults will be selected after representative browser/Node benchmarks rather than frozen from early estimates.

## License

WorldSimSeed is released under the [MIT License](LICENSE).

## Research

- [類似OSS・製品・研究環境の調査と暫定判断（2026-08-22）](docs/research/2026-08-22-simulation-landscape.md)

## Next starting point

Current browser work is tracked in [Issue #14](https://github.com/yo4e/WorldSimSeed/issues/14). After the Worker/Web Component slice is accepted, the next phase is v0.1 hardening: resource benchmarks and defaults, schema-artifact/runtime drift checks, abort/limit review, public API/docs cleanup, and release-checklist reconciliation.

---

Concept by 山田佳江 / 月野テンプレクス
