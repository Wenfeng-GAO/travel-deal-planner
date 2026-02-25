# 携程机票爬虫方案（MVP）

## 目标
- 数据源：携程主站（仅公开页面）
- 路线：单条线路（你指定后固化，例如 PVG→URC）
- 数据：仅最低价（日最低）
- 更新频率：每天滚动更新
- 输出：SQLite + CSV

## 合规边界
- 只访问公开页面/公开请求
- 不绕过验证码或登录
- 出现验证码/风控即停止并记录
- 不做下单流程

## 架构设计
```
Scheduler (daily)
  -> Task Queue (route + date)
    -> Crawler (Playwright, headless)
      -> Raw Snapshot (HTML/JSON)
      -> Parser -> Normalizer
      -> SQLite (price_observation)
      -> CSV Export (daily min)
```

### 数据表
**price_observation**
- ota, origin, destination, date
- min_price, currency
- captured_at

**raw_snapshot**
- ota, origin, destination, date
- raw_path
- captured_at

**crawler_error**
- ota, origin, destination, date
- error_type, error_message
- created_at

## 阶段任务拆分
### 阶段 1：MVP 抓取
- [ ] 固化线路与日期范围
- [ ] Playwright 打开搜索页并抓取最低价
- [ ] 解析并落库
- [ ] CSV 输出

### 阶段 2：日更调度
- [ ] 每天滚动 30 天窗口
- [ ] 跳过已抓取日期
- [ ] 失败重试（有限）

### 阶段 3：质量与监控
- [ ] 采样人工校验
- [ ] DOM 变更检测
- [ ] 报表统计（成功率/失败原因）

## 测试与验收
### 测试
- Parser 输入固定 HTML → 输出最低价
- 1 条线路 1 天完整跑通（落库 + CSV）

### 验收
- 成功率 ≥ 80%
- 价格字段非空
- CSV 可用于 Excel

## 需要你确认
- MVP 线路（例如 PVG→URC）
- 每天滚动的窗口长度（建议 30 天）
