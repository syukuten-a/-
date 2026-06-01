# 价格与运费门槛诊断工具

这是一个给独立站优化顾问使用的本地静态工具。价格诊断和运费门槛诊断是两个独立功能，分别输出各自的判断和导出报告。

价格诊断用来快速判断：

- 哪些 SKU 有价格测试价值
- 建议测涨价、降价、降价去折扣，还是先保价
- 涨价允许 CVR 跌多少、降价需要 CVR 涨多少才打平

运费门槛诊断用来快速判断：

- 当前免邮门槛是否偏高、偏低，或有上移空间
- 运费测试是否需要先校准履约成本模型

## 使用方式

直接打开 `index.html` 即可使用，不需要安装依赖。

## GitHub Pages 上线

这是纯静态站点，GitHub Pages 发布源选择 `main` 分支的根目录即可。

1. 在 GitHub 创建一个新仓库。
2. 上传或 push 本目录下的文件：`index.html`、`styles.css`、`app.js`、`README.md`、`.nojekyll`。
3. 进入仓库 `Settings -> Pages`。
4. `Build and deployment` 选择 `Deploy from a branch`。
5. Branch 选择 `main`，Folder 选择 `/root`，保存。
6. 等待 1-2 分钟后访问 GitHub Pages 给出的链接。

## CSV 导入表头

导入 CSV 时请使用以下英文表头：

```csv
sku,price,cogs,fulfillment,returnCost,traffic,elasticity,competitorMedian,discountRatio
SERUM-30ML,299,58,32,9,32000,1.3,329,42
```

字段说明：

- `price`：当前售价
- `cogs`：商品成本、头程和包装成本
- `fulfillment`：尾程履约成本
- `returnCost`：退货成本摊销
- `traffic`：该 SKU 月流量
- `elasticity`：历史价格弹性绝对值，未知可填 `1`
- `competitorMedian`：同规格竞品中位价
- `discountRatio`：无券期 CVR / 有券期 CVR，填百分数，例如 `42`
