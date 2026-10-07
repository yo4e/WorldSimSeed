# Self-permission luck epsilon比較実験（2026-10-07）

検証判定: **Share with caveats（このモデル内の記述結果として共有可）**。実世界の心理・運・因果についての主張は含まない。

## 条件・系譜

- main commit: `f9c7175e6666c2f7107c18d82294ec96c76f3b96`（PR #27 merge済み）
- specHash: `sha256:ef58d7b1170cf306ee5c200f7141bb908379caf855971355cdeb0b14823ea2a6`
- 3条件: `permissionLuckBias = 0 / 0.0001 / 0.001`。各20 run、同じseeds `42..61`。
- 全条件でopportunityRate=0.10、misfortuneRate=0.10、1,000 agents、80 half-year steps。初期wealth=10、固定self_permissionはuniform [0,1]。
- 同一seedで共通のsemantic random coordinatesを使い、opportunityの確率閾値のみ変えるpaired比較。幸運でwealth×2、不運で×0.5。
- mean wealthは各runのagent平均wealth、Gini/correlationは各run内の値。以下は20 runを等重みで平均し、全agentを混合して再計算していない。eventCountはrun当たりの幸運+不運の発生件数。
- request.jsonのmaxRunsを60に設定し、既存のhost ceiling以下を維持。traceはbatchで無効、検証用の直接runのみ有効。

## 条件別結果（各n=20）

| bias | mean wealth | mean Gini | mean self_permission↔wealth correlation | mean eventCount |
|---:|---:|---:|---:|---:|
| 0 | 285.854170 | 0.918968781 | 0.000127120 | 16064.20 |
| 0.0001 | 286.258409 | 0.918829736 | 0.000199255 | 16068.65 |
| 0.001 | 295.106784 | 0.919091266 | 0.002724268 | 16106.20 |

count/mean/min/maxの上記3 observer集計とeventCount・pooled集計（count=60）は[group-summaries.json](group-summaries.json)に保存。各seedの4指標は[per-run.csv](per-run.csv)。

## Paired delta（to − from、各n=20）

| from→to | mean Δwealth | mean ΔGini | mean Δcorrelation | mean ΔeventCount |
|---|---:|---:|---:|---:|
| 0→0.0001 | +0.404239 | -0.000139045 | +0.000072135 | +4.45 |
| 0→0.001 | +9.252614 | +0.000122485 | +0.002597147 | +42.00 |
| 0.0001→0.001 | +8.848375 | +0.000261529 | +0.002525013 | +37.55 |

seed別の全60比較差分は[paired-deltas.csv](paired-deltas.csv)。mean/min/max/median/sampleSD/正・ゼロ・負の件数は[paired-summary.json](paired-summary.json)。

## 解釈と制約

- baseline比の平均wealthはbias 0.0001で+0.141%、0.001で+3.237%。どちらも全20 seedで正の差だった。増加するルールを入れたモデルなので、この結果は実世界の因果の証拠ではない。
- 幸運イベント平均増分は4.45件 / 42件で、不運件数は同seedで完全一致。総eventCountの増分は追加された幸運件数に一致した。
- Gini差は単純な単調傾向ではない。0→0.0001は19/20 seedで低下。0→0.001は14/20で低下するが、平均差は+0.000122485。後者の中央値は−0.000617796、範囲は−0.001863078〜+0.009569924で、一部の正の差に平均が影響される。
- 0→0.001のwealth差は平均9.252614、中央値5.884736、sampleSD 8.579926。seed54が差分総和の17.65%を占める。乗算wealthと少数seedによるばらつきが大きく、平均の増分がbiasに比例すると解釈しない。
- correlationの平均差は小さく、0→0.0001は16/20、0→0.001は18/20で正。0.001条件の平均correlation自体も0.002724程度。検出閾値、統計的有意性、一般化はこの固定20 seedsのみでは主張しない。
- seedは既存例の固定連番で、独立に無作為抽出した標本とは扱わない。80 steps・固定self_permission・独立イベント・このworldの範囲内。自己評価の動的変化、integrity、文化創発は未検証。

## 検証

- batch 60 runを2回実行し、manifest・metrics・groupsを含む結果の完全一致を確認。
- 3×20 groupのseed/index/parameters、記録対象4指標のfinite・Gini/correlation範囲、独立計算のcount/mean/min/maxとpooled集計を照合。
- 3組×20 seedのpaired delta平均が条件別平均の差と一致。
- 直接trace付き60 runのmetrics/eventCountがbatchと一致。各trace件数はeventCountと一致。
- 全20 seed・全1,000 agentsで、bias増加に伴いwealthが非減少、self_permissionが不変。幸運件数が非減少、不運件数が不変。
- 別言語のverify-epsilon-sweep.py（Python標準ライブラリ）で保存JSON/CSV、各group統計・paired統計、SHA-256、イベント分解を独立照合。異常なし。
- ブラウザでこの実験自体は未実行。mainのNode結果であり、PR27のbrowser parity/CI成功は別途確認済み。

## 再現手順

元の実行は上記main commitとNode v22.22.0、engineVersion 0.1.0で行った。PR #27を含むcheckoutとNode 22以上で、リポジトリrootから:

```sh
npm install --ignore-scripts
npm run build
node scripts/reproduce-epsilon-sweep.mjs /tmp/worldsimseed-epsilon-replay
python3 scripts/verify-epsilon-sweep.py /tmp/worldsimseed-epsilon-replay
```

保存データだけを独立照合する場合は `python3 scripts/verify-epsilon-sweep.py`。
再現スクリプトは同じ60 runを2回とtrace付き直接60 runを実行し、結果を指定した出力directoryへ保存する。
出力のprovenanceは実行時刻・checkout commitが変わる。CSVと集計JSONは保存データと一致し、出力された全result.jsonは元のSHA-256と一致することを検証する。

期待result SHA-256: `47cff9dce9c7c2f3abd5b430e08585a28d130f4b4556bdd82b9410749f33faf8`。
元worldは[既存example](../../../examples/self-permission-luck.world.yaml)を参照し、[provenance.json](provenance.json)のsourceSha256でも一致を確認する。
CIでも同じ再現と保存データ照合を実行する。ZIP、元worldの複製、全runのmanifest/histogramは重複保存しない。実行条件は[request.json](request.json)、検証結果は[validation.json](validation.json)、イベント分解は[event-invariants.csv](event-invariants.csv)に保存。

## 次に価値がある一手（提案のみ）

担当: 月野。現状の同じworld・3条件を、今回と重ならない100 seeds（例62..161）を20 seeds×3条件の5 batchに分け、既存host maxRuns=100を維持して比較し、Gini差の平均/中央値/符号率とwealth差の偏りが再現するか確認する。完了条件はseedセット・specHash・paired差分・集計を保存し、今回の20 seedsと別集計で比較すること。biasの検出閾値を決めたり新しい心理状態を実装する前に、seed感度を確認する価値がある。追加実装・Issue・公開は不要。今回は実行していない。

## 作業時刻・保存範囲

- 着手: 2026-10-07 14:08:10 JST。初回本実験: 14:09:32.896–14:09:45.257 JST。
- 完了確認: 2026-10-07 14:11:30 JST。
- 元実験はローカル成果物として実行。今回のPRはこの既存結果を保存するもので、新しいseed集合の実験・シミュレーション変更を含まない。

## 根拠

- https://github.com/yo4e/WorldSimSeed/issues/23
- https://github.com/yo4e/WorldSimSeed/pull/27
- [実験モデルの説明](../../self-permission-luck-experiment.md) / [group集計契約](../../run-manifest-v0.1.md#grouped-summaries-issue-26)
- [再現スクリプト](../../../scripts/reproduce-epsilon-sweep.mjs) / [独立検証スクリプト](../../../scripts/verify-epsilon-sweep.py)と、このdirectoryのJSON/CSV。
