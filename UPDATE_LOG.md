# 代码查重插件更新说明

## 主要更新内容

### 1. 语言分类优化
- 根据HydroOJ实际语言ID进行精确分组：
  - C语言：`c`
  - C++：`cc`, `cc.cc98`, `cc.cc98o2`, `cc.cc11`, `cc.cc11o2`, `cc.cc14`, `cc.cc14o2`, `cc.cc17`, `cc.cc17o2`, `cc.cc20`, `cc.cc20o2`
  - Java：`java`
  - Python：`py.py3`

### 2. 新的界面结构

#### 标签页展示
- 按语言分类的标签页界面
- 每个标签页显示对应语言的查重统计：
  - 总提交数
  - 参与用户数
  - 相似对数量
  - 最高相似度

#### 用户选择模式
- 用户可以选择基准用户（用户A）
- 显示该用户与其他所有用户的相似度
- 支持头像、用户名、ID显示

#### 详细对比功能
- 每个相似对可以点击查看详细代码对比
- 左右分栏显示两个用户的代码
- 高亮显示重复的代码片段
- 精确到行号和字符位置

### 3. 代码对比页面
- 全新的代码对比界面
- 用户信息对比展示
- 相似片段统计和导航
- 并排代码显示
- 智能高亮重复部分
- 行号切换功能

### 4. 数据结构增强
```typescript
interface PlagiarismResult {
    problemId: number;
    language: string;
    languageName: string;        // 新增：语言显示名称
    submissionCount: number;     // 新增：提交数量
    userCount: number;          // 新增：用户数量
    pairs: SimilarityPair[];
}
```

### 5. 新增API路由
- `/plagiarism/contest/:contestId/:problemId/compare/:sub1/:sub2` - 代码对比详情

### 6. 界面特色
- 遵循CAUCOJUserBind的设计风格
- 独特的CSS类名避免冲突
- 渐变背景和动画效果
- 响应式设计
- 交互式标签页
- 可视化相似度显示

### 7. 使用流程
1. 比赛选择 → 题目选择 → 生成查重报告
2. 题目查重结果页面（新）：按语言标签页展示
3. 选择基准用户查看其与其他用户的相似度
4. 点击"查看代码对比"进入详细对比页面
5. 详细页面：并排代码显示，高亮重复部分

## 模板文件
- `plagiarism_problem_result.html` - 新的题目查重结果页面（替换原detail页面）
- `plagiarism_code_compare.html` - 新的代码对比详情页面

## 技术特点
- 智能语言识别和分组
- 高性能的相似度算法
- 用户友好的交互设计
- 详细的代码高亮功能
- 完整的错误处理
