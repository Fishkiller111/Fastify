1. 用户在你前端发起支付（你控制的部分）

1.1 前端 → 你的后端：创建本地订单

典型流程：

1. 前端页面（你的站）让用户选商品、金额等。
2. 前端向你自己的后端发起请求，比如：
◦  POST /api/order/create
◦  参数：商品信息、金额（CNY）、用户信息等。
3. 你的后端创建一条「商户订单」记录（例如 order_id = 202501010001），状态先记为 UNPAID。

1.2 你的后端 → BEpusdt：创建链上支付订单

你的后端拿到本地订单号和金额后，向 BEpusdt 的接口发起请求：

•  URL：
text
•  请求体（核心字段，示例）：
json
签名怎么算（你后端实现）

规则在 docs/api.md 里，简要概括：

1. 取所有「非空」参数（不含 signature 本身），按参数名字典序排序。
2. 拼成：key1=value1&key2=value2&...
3. 在末尾直接拼上 auth_token（conf.toml 里配置的那个），得到一个长字符串。
4. 对这个字符串做 MD5，再转成小写 32 字节，就是 signature。

> 重要：auth_token 只能出现在你后端和 BEpusdt 服务之间，不能泄露给前端。

BEpusdt 返回什么

成功时返回（见 docs/api.md）：
json
你的后端需要：

•  把 trade_id 记录到本地订单里（映射关系：order_id -> trade_id）。
•  把 payment_url 返回给前端，用于展示收银台。



2. 你的前端如何引导用户支付

有两种常见做法：

2.1 直接跳转到 BEpusdt 收银台（简单）

后端把 payment_url 返回给前端后：

•  前端直接做：
js
用户会看到 BEpusdt 自带的收银台页面（二维码、金额、倒计时等），支付完成后，BEpusdt 会在内部逻辑里：

•  监控链上到账；
•  在成功时自动跳转到你传的 redirect_url。

你的 redirect_url 页面只负责：

•  根据你的 order_id 显示「支付成功 / 等待确认」等状态；
•  真正的支付状态以 回调（notify_url） 为准（见下面）。

2.2 你自己的前端页面 + 新窗口/iframe 打开收银台

如果你想保留自己的 UI：

•  前端拿到 payment_url 后，可以：
◦  在新窗口 window.open(payment_url) 打开；
◦  或者在一个 <iframe src={payment_url}> 里嵌入；
•  你的主页面继续展示自己的订单信息、轮询订单状态等。



3. 支付完成后的回调 & 状态处理（你的后端）

这是关键部分：最终是否发货/开通业务，一定要用回调 + 签名校验来判断。

3.1 BEpusdt → 你的后端：notify_url 回调

你在创建订单时提供的 notify_url 会收到多次回调（见 docs/notify-epusdt.md）：

回调 JSON 形如（docs/api.md 示例）：
json
你的后端处理逻辑建议

1. 先验签（和请求签名同一算法）：
◦  用收到的所有非空字段（不含 signature）排序+拼接；
◦  拼上你的 auth_token；
◦  MD5 → 小写；
◦  对比 signature 是否一致。
2. 根据 order_id（或 trade_id）查本地订单。
3. 按 status 分情况：
◦  status = 1（等待支付）：
▪  仅做状态记录，通常不需要发货；
▪  可更新本地订单状态为 PENDING_ONCHAIN 之类。
◦  status = 2（支付成功）：
▪  判断本地订单当前是否未处理过（做好幂等）；
▪  标记订单为 PAID；
▪  触发发货 / 开通服务等业务逻辑；
▪  记录链上哈希、实际金额等。
◦  status = 3（订单过期）：
▪  标记订单为 EXPIRED；
▪  告诉前端下次需要重新发起支付。
4. HTTP 响应一定要返回 200，并在支付成功回调时返回内容为 ok（notify-epusdt.md 说明）：
◦  BEpusdt 将按以下策略重试「支付成功」回调：
▪  失败重试间隔：2, 4, 8, 16, 32, 64 ... 分钟，最多 10 次；
◦  只有你返回 HTTP 200 且正文为 ok，它才认为这次回调成功。

3.2 redirect_url 的作用

当用户在 BEpusdt 的收银台上完成支付，页面会在成功时跳转到你提供的 redirect_url：

•  redirect_url 用来给用户展示「支付结果页面」；
•  但出于安全性和可用性考虑，你仍然应以 notify 回调 为最终依据；
•  通常 redirect 页面会：
◦  接收 order_id（你在业务层面可以自己带上）；
◦  请求你自己的后端接口 GET /api/order/status?order_id=...；
◦  显示实时状态（未支付/支付中/已支付/超时）。



4. 订单取消流程（可选）

如果你想在「未支付时让用户取消支付」：

1. 你的前端点击取消 → 调你自己的后端 POST /api/order/cancel。
2. 你的后端先把本地订单状态标为 CANCELLED。
3. 再调用 BEpusdt 的取消接口：
http
   请求体：
json
4. BEpusdt 会把对应链上订单状态改为取消，停止监控该订单。



5. 前后端整体顺序小结（按你要的视角）

一、创建 & 引导支付

1. 前端：下单 → 调你后端 /api/order/create。
2. 你后端：
◦  写本地订单；
◦  调 BEpusdt create-transaction；
◦  保存 trade_id；
◦  把 payment_url 返回给前端。
3. 前端：跳转/打开 payment_url（BEpusdt 收银台）。

二、链上支付 & 回调

4. 用户向收银台展示的地址付款。
5. BEpusdt 扫链、匹配订单：
◦  若支付成功：发送 status = 2 的回调到你的 notify_url。
6. 你后端在 notify_url：
◦  验签 → 找到本地订单；
◦  状态更新 + 发货/开通服务；
◦  返回 200 + 文本 ok。

三、结果展示

7. 用户浏览器在支付完成后被跳到 redirect_url（你前端的结果页）。
8. 前端在结果页调用你后端 /api/order/status，展示最终状态。



如果你愿意，我可以根据你现在的后端技术栈（例如 Node / Java / Go / PHP）帮你写一段「创建订单 + 验签 + 处理回调」的示例代码，直接拷贝修改就能用。