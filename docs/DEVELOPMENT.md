# 开发文档：Travel Deal Planner

## 1. 目标
用每日一次的航班/酒店数据抓取，生成“最低价方案”和“体验性价比方案”，并在 Web 端展示。

## 2. 系统架构
1. 数据采集（Daily Fetch）
2. 数据清洗与标准化（Normalize）
3. 存储（Snapshots + Offers）
4. 方案计算（Scoring）
5. API 服务（Query + Recommendation）
6. 前端展示（Web）

## 3. 数据模型（建议）
### 3.1 航班
- routes: origin, destination
- flight_offers:
  - date, price, currency
  - carrier(s)
  - segments, layovers, total_duration
  - depart_time, arrive_time
  - constraints flags (red_eye, long_layover, etc.)

### 3.2 酒店
- hotel_offers:
  - date_range, nightly_price
  - star_rating
  - review_score
  - location_score (optional)

### 3.3 每日快照
- snapshots:
  - run_date
  - origin/destination
  - raw_response_hash (optional)

## 4. 评分与推荐逻辑
### 4.1 最低价方案
- 目标函数：min(航班总价 + 酒店总价)
- 不限制转机次数、起降时段

### 4.2 体验性价比方案
- 约束：最多一次转机
- 时段约束可配置（默认：起飞 06:00–22:30，抵达 08:00–23:30）
- 目标函数：min(航班总价 + 酒店总价)

### 4.3 订购窗口建议
- 基于价格时间序列：
  - 计算未来 N 天最低价分位数 (P10/P50)
  - 识别最近的价格下行/上行拐点
- 输出建议区间（例如：未来 20–45 天内）

## 5. API 设计（MVP）
### 5.1 查询接口
- GET /recommendations
  - params: origin, destination, date_range, trip_length
  - returns: lowest_plan, comfort_plan, booking_window, confidence

### 5.2 方案结构
- lowest_plan: { dates, total_price, flight_summary, hotel_summary }
- comfort_plan: { dates, total_price, constraints, delta_vs_lowest }

## 6. 抓取任务
- cron: 每日一次
- 数据范围：未来 6–9 个月
- 失败重试：3 次，指数退避

## 7. 里程碑
1. Week 1: 接入一个航班 API + 一个酒店 API
2. Week 2: 价格清洗与存储，最小推荐逻辑
3. Week 3: Web API + 简易前端
4. Week 4: 体验方案与解释层

## 8. 测试与监控
- 数据完整性检查（空结果率、价格异常）
- 推荐一致性测试（同数据输入结果稳定）
- 每日抓取成功率监控

## 9. 关键决策待定
- 航班/酒店数据源选择
- 时段约束的默认值
- 酒店评分/星级具体阈值

## 10. 数据源接入方案（无账号现状）
### 10.1 航班优先级
1. Amadeus Self‑Service（最快启动）
   - 优点：无行业门槛，开发者自助接入
   - 代价：不含低成本航司/部分航司，仅公开票价
2. Skyscanner Travel API（覆盖更强）
   - 优点：覆盖面广，支持多航线与复杂行程
   - 代价：需要商务合作与集成评估
3. Travelpayouts Search API（联盟型）
   - 优点：可获取实时搜索结果，适合推荐跳转
   - 代价：必须展示完整结果并提供购买按钮，限制较多

### 10.2 酒店优先级
1. Amadeus Hotel APIs（Hotel List + Hotel Offers + Hotel Sentiments）
   - 优点：与航班同一账号体系，自助可用
   - 限制：覆盖度与口碑评分可能不完整，评分来自情感/口碑数据
2. Booking Demand API / Expedia Rapid API / Hotelbeds
   - 优点：供给更全
   - 代价：需要商务合作或联盟资质

### 10.3 建议动作
1. 先用 Amadeus 跑通酒店链路与口碑评分映射
2. 同时申请 Booking/Expedia 等合作渠道
3. 明确评分口径（口碑评分缺失时用星级兜底）
