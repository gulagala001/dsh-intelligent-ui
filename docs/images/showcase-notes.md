# 场景配图

介绍图参考 [ChatGPT Intelligent UI 官方发布页](https://openai.com/index/gpt-6-for-everyone/)的场景展示方式：从一个问题开始，呈现文字、视觉内容和可操作的回答。

- `showcase-plan.jpg`：聚餐计划，使用真实的 Image、Counter、Facts、Checklist 等组件。
- `showcase-calculator.jpg`：分账工具，使用实际 Calculator 组件。
- `showcase-motion.jpg`：位移解释，使用实际 Chart、Slider、Metric 等组件。

三张图来自隔离的文档展示页面，使用当前 `main` 的组件、样式和有界表达式执行器，以及为展示编写的固定场景。页面中的人数、勾选、金额和滑块均可实际操作；这些配图展示组件行为，宿主安装与真实模型生成的验收范围见首页。

截图前已核对：6→7 人时采购量联动；360 元加 10% 服务费由 6 人分摊为每人 66 元，由 4 人分摊为 99 元；初速度 3→4 m/s、加速度 0.5 m/s² 时，6 秒后的位移由 27→33 m。

`weekend-meal.png` 是通过内置 image_gen 生成的餐食配图，展示页面将图片引用映射到这一固定本地资产。完整生成提示词见 [weekend-meal.prompt.txt](weekend-meal.prompt.txt)。其余文字、控件和图表由代码渲染。
