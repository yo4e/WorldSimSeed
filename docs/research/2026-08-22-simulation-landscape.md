# WorldSimSeed — 類似OSS・製品・研究環境の調査と暫定判断

**調査日:** 2026-08-22（JST）  
**対象:** `yo4e/WorldSimSeed` README および Issue #1  
**実装変更:** なし。リポジトリとIssueへの書き込みも行っていない。

## 結論

WorldSimSeedは、**汎用ABM（agent-based modeling）フレームワークとして新規実装する価値は薄い**一方、次の狭い契約に限定すれば、独立OSSとして作る合理性があります。

> **人間とAIが検証可能な小さな world spec を書き、同じseedでブラウザ／headless双方から再現実行し、集計値と必要なイベント履歴を取得できる、埋め込み可能な確率的ミクロ世界ランタイム。**

したがって暫定判断は **「限定して build。既存製品は wrap ではなく参照・相互運用層として扱う。汎用化とLLM住民プラットフォーム化は abandon」** です。特にWorldSeedは名称・YAML world・tick loopという点で最も近いものの、LLMエージェントの物語的・サーバー運用型エンジンであり、固定seedの数値実験ランタイムとは中心目的が異なります。[1]

| 判断 | 内容 | 根拠 |
|---|---|---|
| **Build** | 小規模の決定論的ランタイム、JSON/YAML world spec、observer、run manifest、trace、Web Component | この組合せを第一級の公開契約にしている主要候補は確認できなかった。 |
| **Wrap existing** | v0.1のcoreでは採らない。将来、NetLogo／Insight Maker等の外部モデルをリンク・比較表示するadapterに限定する。 | 成熟した各ツールは独自DSL・Python・GUI・ライセンス・実行モデルに強く結びつく。 |
| **Abandon** | 汎用数学ソフト、工学系マルチメソッド環境、LLMを使う社会・物語世界、空間GIS大規模環境をv0.1対象から除く。 | AnyLogic、OpenModelica、GAMA、AgentSociety等が既に大きな領域をカバーし、要件も運用コストも別物である。[6] [7] [8] |

## 要件の読み替え

READMEとIssue #1が求める本質は、単に「エージェントを動かせること」ではありません。`agents / time / events / rules / observers`という小核に限定し、AIにも人にも読める宣言的定義、seed固定、反復実行、結果と状態遷移の検査、ブラウザ埋め込み、headless実行を**同じプロダクト契約**として提供することです。[14] [15]

この境界を守ることが重要です。Python ABMやNetLogoは成熟しており、パラメータ掃引・反復・並列実行・再現性といった計算能力は既に提供します。[2] [3] [4] WorldSimSeedが差別化すべきなのは、これらを再発明することではなく、軽量なworld specから「実行可能・再現可能・埋め込み可能な実験」を一貫して作れることです。

## 市場・OSSランドスケープ

以下の活動シグナルは、GitHub APIで2026-08-22に取得したスナップショットです。starsやfork数は品質の証明ではなく、採用・継続性をみる補助指標としてのみ扱いました。

| 分類 | 候補 | ライセンス／活動シグナル | 強み | WorldSimSeedとの関係 |
|---|---|---|---|---|
| **Exactに最も近い** | WorldSeed | MIT、809 stars、2026-05-08 push | YAML世界定義、tick、rules、effects、perception、イベントログ、AIによるworld生成 | 名称・world engine思想は近い。ただしLLMエージェント／DM・Python＋Node＋サーバーが中心で、数値実験coreには重い。[1] |
| **Near-exact（JS core）** | Flocc | GitHub APIはMIT、READMEはISC表記。29 stars、2026-04-15 push | ブラウザ／Node、agent・environment・tick・event・seed・Rule DSL・Canvas | 最有力の参照候補。ただし低採用、ライセンス表記不整合、world spec・実験manifest・trace契約が不足する。[9] |
| **Near-exact（JS ABM）** | AgentScript | GPL-3.0、123 stars、2026-07-11 push | ES Modules、Model/View/Control分離、Canvas／3D／GIS | browser-native設計の参考。GPLとNetLogo風空間意味論のためcore採用は不適。[10] |
| **Near-exact（教育UX）** | NetLogo / NetLogo Web | GPL-2.0、1,177 stars、2026-08-21 push | 専用DSL、豊富なモデル、BehaviorSpace、Web実行・HTML出力 | 「小世界を即実行」は強い既存解。ただしNetLogo DSL・IDE中心で、外部アプリから安定core APIを呼ぶ設計ではない。[3] [11] |
| **Near-exact（browser app）** | Insight Maker | 公式にはfree/open source、旧公開repoは後継を案内 | browser内ABM／system dynamics、図式編集、感度分析、リンク共有・HTML embed | UIとしては近いが、グラフィカルモデル編集サービスでありportable world spec SDKではない。core採用はライセンス確認も必要。[5] [12] |
| **研究ABM** | Mesa | Apache-2.0、3,801 stars、2026-08-20 push | Python ABM、browser可視化、データ収集、並列batch run | 成熟した分析基盤。Pythonモデルをラップするとbrowser-only／軽量embedという核を失う。[2] |
| **研究ABM** | AgentPy | BSD-3-Clause、385 stars、2025-02-06 push | Python、実験・再現性・joblib並列処理・分析 | Monte Carloとseed管理の設計を参照すべきだが、実行形態は異なる。[4] |
| **研究ABM／GIS** | GAMA | GPL-3.0、2026-08-21 push | GAML、GIS、可視化、parameter exploration、batch tools | 包括的すぎる。WorldSimSeedが避けるべき「大きな環境」の代表。[8] |
| **AI社会シミュレーション** | AgentSociety | Apache-2.0（一部例外）、1,216 stars、2026-08-18 push | LLM-native、Ray、trace／replay、都市・社会研究 | 将来のLLM住民レイヤーの参考。LLM API・分散実行前提でv0.1の代替ではない。[13] |
| **隣接・汎用** | SimPy / OpenModelica / AnyLogic | MIT / OSS / 商用 | 離散イベント、工学連続系、産業マルチメソッド | 目的・利用者・モデル粒度が異なる。汎用ソルバ化を避ける根拠。[6] [7] |

## 重要な比較結果

| 評価項目 | WorldSeed | Flocc | NetLogo Web | Insight Maker | Mesa / AgentPy | WorldSimSeedが狙うべき状態 |
|---|---|---|---|---|---|---|
| YAML/JSONを主定義にする | **Yes**（YAML） | Partial（Rule DSLだがJS中心） | No（NetLogo DSL） | No（図式・式中心） | No（Python） | **Yes**。schemaとversionを固定する。 |
| browserだけで実行 | Partial（ローカルserver前提） | **Yes** | **Yes** | **Yes** | No | **Yes**。serverを必須にしない。 |
| headless大量反復 | Partial | Partial | Yes（BehaviorSpace） | Partial | **Yes** | **Yes**。ただし小核に限定。 |
| seed固定・同一再現 | Partial（LLM使用時は難しい） | Yes | Yes | 要確認 | Yes | **Yes**。必須要件。 |
| 数値observer（Gini・相関等） | 物語・状態中心 | 自前実装 | モデル内で実装 | 図表中心 | **Yes**（Python分析） | **Yes**。標準observerを少数提供。 |
| イベント／状態履歴の検査 | **Yes** | Partial | Partial | Partial | 自前実装 | **Yes**。通常はsummary、必要時だけtrace。 |
| Web Component級の部品化 | No | ライブラリとして可 | embed可だがviewer寄り | HTML embed | No | **Yes**。安定したJS APIも併設。 |
| AIが安全に生成・修正 | YAMLを生成可能だがLLM依存 | JS関数が混在 | 専用DSL | GUI中心 | Python | **Yes**。データのみの安全なDSLに絞る。 |

> **判断の核心:** 既存環境は個々の機能を強く解決しています。しかし、**AI可読な限定world spec、browser/headless同一性、実験manifest、追跡可能なobserver結果、Web標準での組み込み**を一つの小さな部品として揃える余地は残っています。

## 「既存coreをwrapする」案の評価

既存coreを薄いUXで包む案は、短期のデモには有効でも、WorldSimSeedの中核価値を損ねやすい選択です。MesaとAgentPyはPythonコードをモデル実体とし、NetLogoは専用言語と環境を中心にします。GAMAとAgentScriptにはライセンス面の制約があり、WorldSeedとAgentSocietyはLLM・サーバー運用を前提とします。[1] [2] [4] [8] [10] [13]

最も近いFloccについても、agent ruleにJavaScript関数を書けることは柔軟性になる反面、AI生成物の検証範囲・安全な式評価・実行再現性をworld spec単位で固定するという目的と衝突します。またGitHub APIとREADMEでライセンス表記が一致しないため、採用前にはライセンスファイル・npm配布物・依存関係を必ず再確認すべきです。[9]

従ってv0.1では、既存coreのforkや直接ラップを避けます。代わりに、Mesaのbatch runner、AgentPyのseed系列、NetLogo BehaviorSpaceの実験出力、WorldSeedのDSL validation・sanity checks・traceの考え方を**設計参照**として採用することを勧めます。[1] [2] [3] [4]

## 独自価値は3点以内に絞る

WorldSimSeedの差別化は、以下の3点を同時に満たすことに限定するのが妥当です。

| 優先度 | 独自価値 | 具体的な約束 |
|---|---|---|
| 1 | **Portable, AI-safe world spec** | JSON Schemaで検証できるデータのみのspecにする。任意JavaScript、任意Python、任意LLM呼出しをv0.1のeffect式から外す。spec versionと実験inputを明示する。 |
| 2 | **Deterministic, inspectable experiments** | `spec + parameters + seed set + engine version + observer set`をrun manifestとして残す。browserとheadlessで同じsummaryを返し、任意runでevent trace／state snapshotを取り出せる。 |
| 3 | **Embeddable micro-lab** | UIとcoreを分離し、`create / step / run / observe / export`相当のJS APIとWeb Componentを提供する。教育ページや他の人工世界プロジェクトからサーバーなしで使えるようにする。 |

この3点の外側、すなわち大規模GIS、連続時間・工学モデル、GUIで何でも作れるIDE、自然言語をそのまま実行するLLM Dungeon Master、一般的なmulti-agent orchestrationは、競合の強い領域でありv0.1では扱わない方がよいです。

## Issue #2へ渡すべき検証条件

実装ではなく仕様検討として、次の受入条件を置くと今回の差別化仮説を検証できます。reference modelはREADMEにある「才能・運・富」を使えば、分布、条件付き確率、乗算的状態変化、Gini、相関、複数seedを一度に確認できます。[14]

| 条件 | 合格ライン | 意味 |
|---|---|---|
| spec検証 | 不正な属性参照、未定義observer、非許可operatorを実行前に拒否できる | AI生成specを実行可能なデータに制限する。 |
| 再現性 | 同一spec・parameters・seed・engine versionで、browser/headlessのsummaryが一致する | 最も重要な製品契約。 |
| 実験 | 例: 100 seed × 3 policyを一つのmanifestから実行し、mean・distribution・Gini・correlationを比較できる | batch機能をユーザー価値に変換する。 |
| 検査 | 任意のoutlier runについて、event traceと指定tickのstateを取得できる | 「なぜその結果か」を追える。 |
| 組み込み | 独立ページとWeb Componentが同じcoreを使い、`step/run/getState/setParameter`相当を提供する | UIを実験エンジンから分離する。 |

## リスクと対策

最大のリスクは、任意式評価を急いで導入して「小さなDSL」が実質的に安全でないプログラミング言語へ膨らむことです。v0.1は許可演算子・参照可能なstate path・標準分布関数・標準observerを明示列挙し、式をサンドボックスで自由評価しない方針が適切です。次に、traceを常時フル保存すると大量反復のメモリ・I/Oが急増します。全runではsummaryのみを保存し、seedまたはsampling条件で選んだrunだけを再実行してtrace化する二段階設計が必要です。

名称上の混同も無視できません。WorldSeedは既にYAMLによるAI multi-agent world engineとして公開されているため、README冒頭では、WorldSimSeedが**LLM住民を動かすworld engineではなく、再現可能な確率的実験ランタイム**であることを明記すべきです。[1]

## 次のアクション

今日は調査・確認のみという依頼に従い、実装やIssue更新はしていません。次の検討では、Issue #2に対して上記3価値を満たす最小world specとrun manifestを定義し、reference modelの期待値・不変条件・再現性テストを先に設計することを推奨します。

## 参考文献

[1]: https://github.com/AIScientists-Dev/WorldSeed "AIScientists-Dev/WorldSeed"
[2]: https://mesa.readthedocs.io/ "Mesa documentation"
[3]: https://docs.netlogo.org/7.0.4/behaviorspace "NetLogo BehaviorSpace"
[4]: https://agentpy.readthedocs.io/en/latest/ "AgentPy documentation"
[5]: https://insightmaker.com/docs/features "Insight Maker features"
[6]: https://simpy.readthedocs.io/ "SimPy documentation"
[7]: https://openmodelica.org/ "OpenModelica"
[8]: https://gama-platform.org/wiki/Home "GAMA platform"
[9]: https://github.com/scottpdo/flocc "Flocc"
[10]: https://github.com/backspaces/agentscript "AgentScript"
[11]: https://netlogoweb.org/whats-new "NetLogo Web release notes"
[12]: https://insightmaker.com/docs/share "Insight Maker sharing and embedding"
[13]: https://github.com/tsinghua-fib-lab/AgentSociety "AgentSociety"
[14]: https://github.com/yo4e/WorldSimSeed "WorldSimSeed README"
[15]: https://github.com/yo4e/WorldSimSeed/issues/1 "WorldSimSeed Issue #1"
