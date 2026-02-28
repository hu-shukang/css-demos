# 在线考试网站架构设计

## 📋 项目概述

### 技术栈
- **前端框架**: Next.js 16.1.1 (App Router)
- **UI 库**: shadcn/ui (new-york 风格) + Tailwind CSS v4
- **数据库**: PostgreSQL
- **ORM**: Kysely 0.28.9
- **用户认证**: Clerk
- **语言**: TypeScript 5

### 核心功能
1. **管理员功能**
   - 登录和身份验证
   - 创建、编辑、删除试卷
   - 创建、编辑、删除试题
   - 查看所有用户的考试结果统计

2. **普通用户功能**
   - 登录和身份验证
   - 浏览可用试卷列表
   - 选择试卷并开始答题
   - 提交答案并查看考试结果
   - 查看个人考试历史记录

---

## 🗄️ 数据库架构设计

### ER 图

```mermaid
erDiagram
    users ||--o{ exams : creates
    users ||--o{ exam_attempts : takes
    exams ||--o{ questions : contains
    exams ||--o{ exam_attempts : generates
    questions ||--o{ question_options : has
    questions ||--o{ user_answers : answered_in
    exam_attempts ||--o{ user_answers : includes

    users {
        varchar clerk_id PK
        varchar email UK
        varchar role
        varchar name
        timestamp created_at
        timestamp updated_at
    }

    exams {
        uuid id PK
        varchar title
        text description
        int duration_minutes
        int passing_score
        boolean is_published
        varchar created_by_clerk_id FK
        timestamp created_at
        timestamp updated_at
    }

    questions {
        uuid id PK
        uuid exam_id FK
        text question_text
        varchar question_type
        int points
        int order_index
        timestamp created_at
        timestamp updated_at
    }

    question_options {
        uuid id PK
        uuid question_id FK
        text option_text
        boolean is_correct
        int order_index
    }

    exam_attempts {
        uuid id PK
        uuid exam_id FK
        varchar user_clerk_id FK
        int total_score
        int max_score
        float percentage
        varchar status
        timestamp started_at
        timestamp completed_at
        timestamp created_at
    }

    user_answers {
        uuid id PK
        uuid exam_attempt_id FK
        uuid question_id FK
        text answer_text
        uuid selected_option_id FK
        boolean is_correct
        int points_earned
        timestamp answered_at
    }
```

### 表结构详细说明

#### 1. `users` 表
存储用户基本信息（与 Clerk 同步）

```sql
CREATE TABLE users (
    clerk_id VARCHAR(255) PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'user', -- 'admin' | 'user'
    name VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_email ON users(email);
```

#### 2. `exams` 表
存储试卷信息

```sql
CREATE TABLE exams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    duration_minutes INT NOT NULL, -- 考试时长（分钟）
    passing_score INT NOT NULL DEFAULT 60, -- 及格分数
    is_published BOOLEAN DEFAULT false, -- 是否发布
    created_by_clerk_id VARCHAR(255) REFERENCES users(clerk_id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_exams_published ON exams(is_published);
CREATE INDEX idx_exams_created_by ON exams(created_by_clerk_id);
```

#### 3. `questions` 表
存储试题信息

```sql
CREATE TABLE questions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    exam_id UUID NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
    question_text TEXT NOT NULL,
    question_type VARCHAR(50) NOT NULL, -- 'single_choice' | 'multiple_choice' | 'true_false' | 'short_answer'
    points INT NOT NULL DEFAULT 1,
    order_index INT NOT NULL, -- 题目顺序
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_questions_exam ON questions(exam_id);
CREATE INDEX idx_questions_order ON questions(exam_id, order_index);
```

#### 4. `question_options` 表
存储选择题的选项

```sql
CREATE TABLE question_options (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    question_id UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    option_text TEXT NOT NULL,
    is_correct BOOLEAN DEFAULT false,
    order_index INT NOT NULL
);

CREATE INDEX idx_options_question ON question_options(question_id);
```

#### 5. `exam_attempts` 表
存储考试尝试记录

```sql
CREATE TABLE exam_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    exam_id UUID NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
    user_clerk_id VARCHAR(255) NOT NULL REFERENCES users(clerk_id),
    total_score INT DEFAULT 0,
    max_score INT NOT NULL,
    percentage DECIMAL(5,2) DEFAULT 0,
    status VARCHAR(50) NOT NULL DEFAULT 'in_progress', -- 'in_progress' | 'completed' | 'abandoned'
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_attempts_user ON exam_attempts(user_clerk_id);
CREATE INDEX idx_attempts_exam ON exam_attempts(exam_id);
CREATE INDEX idx_attempts_status ON exam_attempts(status);
```

#### 6. `user_answers` 表
存储用户答案

```sql
CREATE TABLE user_answers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    exam_attempt_id UUID NOT NULL REFERENCES exam_attempts(id) ON DELETE CASCADE,
    question_id UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    answer_text TEXT, -- 用于简答题
    selected_option_id UUID REFERENCES question_options(id), -- 用于选择题
    is_correct BOOLEAN DEFAULT false,
    points_earned INT DEFAULT 0,
    answered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_answers_attempt ON user_answers(exam_attempt_id);
CREATE INDEX idx_answers_question ON user_answers(question_id);
```

---

## 🛣️ 路由和数据操作设计

### Next.js App Router 结构

```
app/
├── (auth)/                          # 认证相关路由组
│   ├── sign-in/[[...sign-in]]/
│   │   └── page.tsx                 # Clerk 登录页
│   └── sign-up/[[...sign-up]]/
│       └── page.tsx                 # Clerk 注册页
│
├── (dashboard)/                     # 需要认证的路由组
│   ├── layout.tsx                   # 共享布局（导航栏）
│   │
│   ├── dashboard/                   # 用户仪表板
│   │   └── page.tsx                 # 显示用户统计
│   │
│   ├── exams/                       # 试卷相关
│   │   ├── page.tsx                 # 试卷列表
│   │   ├── [examId]/
│   │   │   ├── page.tsx             # 试卷详情
│   │   │   └── attempt/[attemptId]/
│   │   │       └── page.tsx         # 答题界面
│   │   └── results/[attemptId]/
│   │       └── page.tsx             # 考试结果
│   │
│   ├── history/                     # 考试历史
│   │   └── page.tsx                 # 用户考试历史
│   │
│   └── admin/                       # 管理员路由
│       ├── layout.tsx               # 管理员权限检查
│       ├── page.tsx                 # 管理员仪表板
│       │
│       ├── exams/                   # 试卷管理
│       │   ├── page.tsx             # 管理员试卷列表
│       │   ├── new/
│       │   │   └── page.tsx         # 创建试卷表单
│       │   └── [examId]/
│       │       ├── edit/
│       │       │   └── page.tsx     # 编辑试卷表单
│       │       └── questions/
│       │           ├── page.tsx     # 试题列表
│       │           ├── new/
│       │           │   └── page.tsx # 创建试题表单
│       │           └── [questionId]/
│       │               └── edit/
│       │                   └── page.tsx # 编辑试题表单
│       │
│       └── results/                 # 结果统计
│           └── page.tsx             # 所有用户结果
│
└── api/                             # API 路由（仅用于 Webhook）
    └── webhooks/
        └── clerk/
            └── route.ts             # POST - Clerk webhook（同步用户）
```

### Server Actions 设计（主要数据操作方式）

**为什么使用 Server Actions?**
- ✅ 类型安全：TypeScript 端到端类型检查
- ✅ 简化代码：无需手动处理 fetch、序列化等
- ✅ 自动优化：Next.js 自动处理缓存和重新验证
- ✅ 更好的 DX：直接在组件中调用函数
- ✅ 内置安全：自动 CSRF 保护

```typescript
// lib/actions/exam-actions.ts
'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireAuth, requireAdmin } from '@/lib/auth/permissions'
import { examService } from '@/lib/services/exam-service'
import { createExamSchema, updateExamSchema } from '@/lib/validations/exam-schema'
import type { CreateExamInput, UpdateExamInput } from '@/lib/validations/exam-schema'

/**
 * 创建试卷（管理员）
 */
export async function createExam(data: CreateExamInput) {
  const userId = await requireAdmin()
  
  // 验证输入
  const validated = createExamSchema.parse(data)
  
  // 创建试卷
  const exam = await examService.createExam(validated, userId)
  
  // 重新验证缓存
  revalidatePath('/admin/exams')
  
  // 重定向到试题编辑页
  redirect(`/admin/exams/${exam.id}/questions`)
}

/**
 * 更新试卷（管理员）
 */
export async function updateExam(examId: string, data: UpdateExamInput) {
  await requireAdmin()
  
  const validated = updateExamSchema.parse(data)
  await examService.updateExam(examId, validated)
  
  revalidatePath('/admin/exams')
  revalidatePath(`/admin/exams/${examId}`)
  
  return { success: true }
}

/**
 * 删除试卷（管理员）
 */
export async function deleteExam(examId: string) {
  await requireAdmin()
  
  await examService.deleteExam(examId)
  
  revalidatePath('/admin/exams')
  redirect('/admin/exams')
}

/**
 * 发布试卷（管理员）
 */
export async function publishExam(examId: string) {
  await requireAdmin()
  
  await examService.publishExam(examId)
  
  revalidatePath('/admin/exams')
  revalidatePath(`/exams/${examId}`)
  
  return { success: true }
}

/**
 * 取消发布试卷（管理员）
 */
export async function unpublishExam(examId: string) {
  await requireAdmin()
  
  await examService.unpublishExam(examId)
  
  revalidatePath('/admin/exams')
  revalidatePath(`/exams/${examId}`)
  
  return { success: true }
}

// lib/actions/question-actions.ts
'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/auth/permissions'
import { questionService } from '@/lib/services/question-service'
import { createQuestionSchema, updateQuestionSchema } from '@/lib/validations/question-schema'
import type { CreateQuestionInput, UpdateQuestionInput } from '@/lib/validations/question-schema'

/**
 * 创建试题（管理员）
 */
export async function createQuestion(examId: string, data: CreateQuestionInput) {
  await requireAdmin()
  
  const validated = createQuestionSchema.parse({ ...data, exam_id: examId })
  const question = await questionService.createQuestion(validated)
  
  revalidatePath(`/admin/exams/${examId}/questions`)
  
  return { success: true, questionId: question.id }
}

/**
 * 更新试题（管理员）
 */
export async function updateQuestion(questionId: string, data: UpdateQuestionInput) {
  await requireAdmin()
  
  const validated = updateQuestionSchema.parse(data)
  await questionService.updateQuestion(questionId, validated)
  
  // 获取 examId 以重新验证正确的路径
  const question = await questionService.getQuestionById(questionId)
  if (question) {
    revalidatePath(`/admin/exams/${question.exam_id}/questions`)
  }
  
  return { success: true }
}

/**
 * 删除试题（管理员）
 */
export async function deleteQuestion(questionId: string) {
  await requireAdmin()
  
  const question = await questionService.getQuestionById(questionId)
  await questionService.deleteQuestion(questionId)
  
  if (question) {
    revalidatePath(`/admin/exams/${question.exam_id}/questions`)
  }
  
  return { success: true }
}

/**
 * 重新排序试题（管理员）
 */
export async function reorderQuestions(examId: string, questionIds: string[]) {
  await requireAdmin()
  
  await questionService.reorderQuestions(examId, questionIds)
  
  revalidatePath(`/admin/exams/${examId}/questions`)
  
  return { success: true }
}

// lib/actions/attempt-actions.ts
'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireAuth } from '@/lib/auth/permissions'
import { attemptService } from '@/lib/services/attempt-service'
import { gradingService } from '@/lib/services/grading-service'
import { submitAnswerSchema } from '@/lib/validations/answer-schema'
import type { SubmitAnswerInput } from '@/lib/validations/answer-schema'

/**
 * 开始考试
 */
export async function startExamAttempt(examId: string) {
  const userId = await requireAuth()
  
  const attempt = await attemptService.createAttempt(examId, userId)
  
  redirect(`/exams/${examId}/attempt/${attempt.id}`)
}

/**
 * 提交单个答案（自动保存）
 */
export async function submitAnswer(data: SubmitAnswerInput) {
  const userId = await requireAuth()
  
  const validated = submitAnswerSchema.parse(data)
  
  // 验证考试尝试属于当前用户
  const attempt = await attemptService.getAttemptById(validated.exam_attempt_id)
  if (attempt?.user_clerk_id !== userId) {
    throw new Error('Unauthorized')
  }
  
  // 保存答案并自动评分
  await attemptService.saveAnswer(validated)
  
  return { success: true }
}

/**
 * 提交整个考试
 */
export async function submitExam(attemptId: string) {
  const userId = await requireAuth()
  
  // 验证考试尝试属于当前用户
  const attempt = await attemptService.getAttemptById(attemptId)
  if (attempt?.user_clerk_id !== userId) {
    throw new Error('Unauthorized')
  }
  
  // 计算总分
  const result = await gradingService.gradeExamAttempt(attemptId)
  
  // 更新考试状态
  await attemptService.completeAttempt(attemptId, result)
  
  revalidatePath('/history')
  redirect(`/exams/results/${attemptId}`)
}

/**
 * 放弃考试
 */
export async function abandonExam(attemptId: string) {
  const userId = await requireAuth()
  
  const attempt = await attemptService.getAttemptById(attemptId)
  if (attempt?.user_clerk_id !== userId) {
    throw new Error('Unauthorized')
  }
  
  await attemptService.abandonAttempt(attemptId)
  
  revalidatePath('/history')
  redirect('/exams')
}

// lib/actions/result-actions.ts
'use server'

import { requireAuth, requireAdmin } from '@/lib/auth/permissions'
import { resultService } from '@/lib/services/result-service'

/**
 * 获取用户考试历史
 */
export async function getUserExamHistory() {
  const userId = await requireAuth()
  
  return resultService.getUserHistory(userId)
}

/**
 * 获取考试结果详情
 */
export async function getExamResult(attemptId: string) {
  const userId = await requireAuth()
  
  const result = await resultService.getResultById(attemptId)
  
  // 验证权限：管理员或结果所有者
  const isAdmin = await requireAdmin().catch(() => false)
  if (!isAdmin && result?.user_clerk_id !== userId) {
    throw new Error('Unauthorized')
  }
  
  return result
}

/**
 * 获取所有用户结果（管理员）
 */
export async function getAllResults() {
  await requireAdmin()
  
  return resultService.getAllResults()
}
```

### 使用 Server Actions 的示例

```typescript
// app/(dashboard)/admin/exams/new/page.tsx
import { createExam } from '@/lib/actions/exam-actions'
import { ExamForm } from '@/components/exam/exam-form'

export default function NewExamPage() {
  return (
    <div className="container mx-auto p-6">
      <h1 className="mb-6 text-3xl font-bold">创建试卷</h1>
      <ExamForm action={createExam} />
    </div>
  )
}

// components/exam/exam-form.tsx
'use client'

import { useFormState } from 'react-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function ExamForm({ action }: { action: (data: FormData) => Promise<void> }) {
  return (
    <form action={action} className="space-y-4">
      <div>
        <Label htmlFor="title">试卷标题</Label>
        <Input id="title" name="title" required />
      </div>
      
      <div>
        <Label htmlFor="duration_minutes">考试时长（分钟）</Label>
        <Input id="duration_minutes" name="duration_minutes" type="number" required />
      </div>
      
      <Button type="submit">创建试卷</Button>
    </form>
  )
}
```

---

## 🔐 权限控制策略

### Clerk 角色定义

使用 Clerk 的 `publicMetadata` 存储用户角色：

```typescript
// 用户角色类型
type UserRole = 'admin' | 'user'

// Clerk metadata 结构
interface ClerkPublicMetadata {
  role: UserRole
}
```

### 权限检查中间件

```typescript
// lib/auth/permissions.ts

import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'

export async function requireAuth() {
  const { userId } = await auth()
  if (!userId) {
    redirect('/sign-in')
  }
  return userId
}

export async function requireAdmin() {
  const { userId, sessionClaims } = await auth()
  if (!userId) {
    redirect('/sign-in')
  }
  
  const role = sessionClaims?.metadata?.role as UserRole
  if (role !== 'admin') {
    redirect('/dashboard')
  }
  
  return userId
}

export async function getUserRole(): Promise<UserRole> {
  const { sessionClaims } = await auth()
  return (sessionClaims?.metadata?.role as UserRole) || 'user'
}
```

### 路由保护策略

```typescript
// app/(dashboard)/admin/layout.tsx
import { requireAdmin } from '@/lib/auth/permissions'

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  await requireAdmin()
  
  return (
    <div className="admin-layout">
      {children}
    </div>
  )
}
```

### API 路由权限检查

```typescript
// app/api/exams/route.ts
import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const { userId, sessionClaims } = await auth()
  
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  
  const role = sessionClaims?.metadata?.role
  if (role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  
  // 创建试卷逻辑
}
```

---

## 🎨 前端组件架构

### 组件层次结构

```
components/
├── ui/                              # shadcn/ui 基础组件
│   ├── button.tsx
│   ├── card.tsx
│   ├── dialog.tsx
│   ├── form.tsx
│   ├── input.tsx
│   ├── label.tsx
│   ├── select.tsx
│   ├── textarea.tsx
│   ├── badge.tsx
│   ├── table.tsx
│   ├── tabs.tsx
│   ├── toast.tsx
│   └── ...
│
├── layout/                          # 布局组件
│   ├── header.tsx                   # 顶部导航栏
│   ├── sidebar.tsx                  # 侧边栏（管理员）
│   ├── footer.tsx                   # 页脚
│   └── user-nav.tsx                 # 用户导航菜单
│
├── exam/                            # 试卷相关组件
│   ├── exam-card.tsx                # 试卷卡片
│   ├── exam-list.tsx                # 试卷列表
│   ├── exam-form.tsx                # 试卷表单（创建/编辑）
│   ├── exam-details.tsx             # 试卷详情
│   ├── exam-stats.tsx               # 试卷统计信息
│   └── exam-actions.tsx             # 试卷操作按钮组
│
├── question/                        # 试题相关组件
│   ├── question-editor.tsx          # 试题编辑器（管理员）
│   ├── question-list.tsx            # 试题列表（管理员）
│   ├── question-view.tsx            # 试题展示（答题）
│   ├── question-types/              # 不同题型组件
│   │   ├── single-choice.tsx        # 单选题
│   │   ├── multiple-choice.tsx      # 多选题
│   │   ├── true-false.tsx           # 判断题
│   │   └── short-answer.tsx         # 简答题
│   └── question-navigation.tsx      # 题目导航
│
├── attempt/                         # 考试尝试相关组件
│   ├── exam-timer.tsx               # 考试计时器
│   ├── answer-sheet.tsx             # 答题卡
│   ├── exam-progress.tsx            # 答题进度
│   └── submit-dialog.tsx            # 提交确认对话框
│
├── result/                          # 结果相关组件
│   ├── result-summary.tsx           # 成绩总结
│   ├── result-details.tsx           # 详细结果
│   ├── result-chart.tsx             # 成绩图表
│   ├── result-history.tsx           # 历史记录列表
│   └── result-comparison.tsx        # 成绩对比
│
└── admin/                           # 管理员专用组件
    ├── admin-stats.tsx              # 统计仪表板
    ├── user-results-table.tsx       # 用户结果表格
    └── exam-analytics.tsx           # 试卷分析
```

### 组件设计原则

1. **原子化设计**: 使用 shadcn/ui 的基础组件构建
2. **类型安全**: 所有组件使用 TypeScript 严格类型
3. **服务器组件优先**: 默认使用 Server Components，需要交互时使用 Client Components
4. **可复用性**: 组件设计考虑多场景复用
5. **无障碍性**: 遵循 ARIA 标准

---

## 📁 完整文件目录结构

```
exam/
├── .roo/                            # Roo 配置
│   └── rules-architect/
│       └── AGENTS.md
│
├── app/                             # Next.js App Router
│   ├── (auth)/                      # 认证路由组
│   │   ├── sign-in/[[...sign-in]]/
│   │   │   └── page.tsx
│   │   └── sign-up/[[...sign-up]]/
│   │       └── page.tsx
│   │
│   ├── (dashboard)/                 # 仪表板路由组
│   │   ├── layout.tsx
│   │   ├── dashboard/
│   │   │   └── page.tsx
│   │   ├── exams/
│   │   │   ├── page.tsx
│   │   │   ├── [examId]/
│   │   │   │   ├── page.tsx
│   │   │   │   ├── start/
│   │   │   │   │   └── page.tsx
│   │   │   │   └── attempt/[attemptId]/
│   │   │   │       └── page.tsx
│   │   │   └── results/[attemptId]/
│   │   │       └── page.tsx
│   │   ├── history/
│   │   │   └── page.tsx
│   │   └── admin/
│   │       ├── layout.tsx
│   │       ├── page.tsx
│   │       ├── exams/
│   │       │   ├── page.tsx
│   │       │   ├── new/
│   │       │   │   └── page.tsx
│   │       │   └── [examId]/
│   │       │       ├── edit/
│   │       │       │   └── page.tsx
│   │       │       └── questions/
│   │       │           ├── page.tsx
│   │       │           ├── new/
│   │       │           │   └── page.tsx
│   │       │           └── [questionId]/
│   │       │               └── edit/
│   │       │                   └── page.tsx
│   │       └── results/
│   │           └── page.tsx
│   │
│   ├── api/                         # API 路由
│   │   ├── webhooks/
│   │   │   └── clerk/
│   │   │       └── route.ts
│   │   ├── exams/
│   │   │   ├── route.ts
│   │   │   └── [examId]/
│   │   │       ├── route.ts
│   │   │       ├── questions/
│   │   │       │   └── route.ts
│   │   │       └── publish/
│   │   │           └── route.ts
│   │   ├── questions/
│   │   │   └── [questionId]/
│   │   │       └── route.ts
│   │   ├── attempts/
│   │   │   ├── route.ts
│   │   │   └── [attemptId]/
│   │   │       ├── route.ts
│   │   │       ├── answers/
│   │   │       │   └── route.ts
│   │   │       └── submit/
│   │   │           └── route.ts
│   │   └── results/
│   │       ├── route.ts
│   │       └── [attemptId]/
│   │           └── route.ts
│   │
│   ├── favicon.ico
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx
│
├── components/                      # React 组件
│   ├── ui/                          # shadcn/ui 组件
│   ├── layout/
│   ├── exam/
│   ├── question/
│   ├── attempt/
│   ├── result/
│   └── admin/
│
├── lib/                             # 工具库
│   ├── db/                          # 数据库相关
│   │   ├── index.ts                 # Kysely 实例
│   │   ├── types.ts                 # 数据库类型（自动生成）
│   │   └── migrations/              # 数据库迁移
│   │       ├── 001_initial.ts
│   │       ├── 002_add_indexes.ts
│   │       └── migrate.ts
│   │
│   ├── actions/                     # Server Actions
│   │   ├── exam-actions.ts
│   │   ├── question-actions.ts
│   │   ├── attempt-actions.ts
│   │   └── result-actions.ts
│   │
│   ├── auth/                        # 认证相关
│   │   ├── permissions.ts
│   │   └── clerk-utils.ts
│   │
│   ├── validations/                 # Zod 验证模式
│   │   ├── exam-schema.ts
│   │   ├── question-schema.ts
│   │   └── answer-schema.ts
│   │
│   ├── services/                    # 业务逻辑服务
│   │   ├── exam-service.ts
│   │   ├── question-service.ts
│   │   ├── attempt-service.ts
│   │   └── grading-service.ts
│   │
│   └── utils.ts                     # 通用工具函数
│
├── types/                           # TypeScript 类型定义
│   ├── exam.ts
│   ├── question.ts
│   ├── attempt.ts
│   └── user.ts
│
├── hooks/                           # 自定义 React Hooks
│   ├── use-exam.ts
│   ├── use-timer.ts
│   └── use-auto-save.ts
│
├── public/                          # 静态资源
│   └── ...
│
├── plans/                           # 架构文档
│   └── architecture.md
│
├── .env.local                       # 环境变量
├── .gitignore
├── AGENTS.md
├── components.json
├── eslint.config.mjs
├── next.config.ts
├── package.json
├── postcss.config.mjs
├── README.md
└── tsconfig.json
```

---

## 🔄 数据流设计

### 用户答题流程

```mermaid
sequenceDiagram
    participant U as 用户
    participant UI as 前端界面
    participant SA as Server Action
    participant DB as 数据库
    participant GS as 评分服务

    U->>UI: 选择试卷
    UI->>SA: startExamAttempt(examId)
    SA->>DB: 创建 exam_attempt 记录
    DB-->>SA: 返回 attemptId
    SA-->>UI: 返回考试数据
    UI-->>U: 显示答题界面

    loop 答题过程
        U->>UI: 选择/输入答案
        UI->>SA: submitAnswer(attemptId, questionId, answer)
        SA->>DB: 保存 user_answer
        DB-->>SA: 确认保存
        SA-->>UI: 返回保存状态
    end

    U->>UI: 提交考试
    UI->>SA: submitExam(attemptId)
    SA->>DB: 获取所有答案
    DB-->>SA: 返回答案列表
    SA->>GS: 评分计算
    GS-->>SA: 返回分数
    SA->>DB: 更新 exam_attempt (分数、状态)
    DB-->>SA: 确认更新
    SA-->>UI: 返回考试结果
    UI-->>U: 显示成绩
```

### 管理员创建试卷流程

```mermaid
sequenceDiagram
    participant A as 管理员
    participant UI as 管理界面
    participant SA as Server Action
    participant DB as 数据库

    A->>UI: 填写试卷信息
    UI->>SA: createExam(examData)
    SA->>DB: 插入 exam 记录
    DB-->>SA: 返回 examId
    SA-->>UI: 返回试卷 ID
    UI-->>A: 跳转到试题编辑

    loop 添加试题
        A->>UI: 填写试题信息
        UI->>SA: createQuestion(examId, questionData)
        SA->>DB: 插入 question 记录
        DB-->>SA: 返回 questionId
        
        alt 选择题
            SA->>DB: 插入 question_options 记录
            DB-->>SA: 确认插入
        end
        
        SA-->>UI: 返回试题 ID
        UI-->>A: 显示试题列表
    end

    A->>UI: 点击发布
    UI->>SA: publishExam(examId)
    SA->>DB: 更新 exam.is_published = true
    DB-->>SA: 确认更新
    SA-->>UI: 返回成功
    UI-->>A: 显示发布成功
```

---

## 🎯 状态管理方案

### 使用 React Server Components + Server Actions

由于 Next.js App Router 的特性，我们主要使用服务器端状态管理：

1. **服务器组件**: 直接从数据库获取数据
2. **Server Actions**: 处理数据变更
3. **客户端状态**: 仅用于 UI 交互状态（使用 React useState/useReducer）

### 客户端状态管理

```typescript
// hooks/use-exam-state.ts
'use client'

import { useState, useCallback } from 'react'

interface ExamState {
  currentQuestionIndex: number
  answers: Map<string, string>
  timeRemaining: number
}

export function useExamState(totalQuestions: number, duration: number) {
  const [state, setState] = useState<ExamState>({
    currentQuestionIndex: 0,
    answers: new Map(),
    timeRemaining: duration * 60, // 转换为秒
  })

  const nextQuestion = useCallback(() => {
    setState(prev => ({
      ...prev,
      currentQuestionIndex: Math.min(prev.currentQuestionIndex + 1, totalQuestions - 1)
    }))
  }, [totalQuestions])

  const previousQuestion = useCallback(() => {
    setState(prev => ({
      ...prev,
      currentQuestionIndex: Math.max(prev.currentQuestionIndex - 1, 0)
    }))
  }, [])

  const setAnswer = useCallback((questionId: string, answer: string) => {
    setState(prev => ({
      ...prev,
      answers: new Map(prev.answers).set(questionId, answer)
    }))
  }, [])

  const decrementTime = useCallback(() => {
    setState(prev => ({
      ...prev,
      timeRemaining: Math.max(prev.timeRemaining - 1, 0)
    }))
  }, [])

  return {
    state,
    nextQuestion,
    previousQuestion,
    setAnswer,
    decrementTime,
  }
}
```

---

## 🔧 核心服务设计

### 评分服务

```typescript
// lib/services/grading-service.ts

import { db } from '@/lib/db'

export class GradingService {
  /**
   * 评分单个答案
   */
  async gradeAnswer(
    questionId: string,
    answer: string | string[]
  ): Promise<{ isCorrect: boolean; pointsEarned: number }> {
    const question = await db
      .selectFrom('questions')
      .selectAll()
      .where('id', '=', questionId)
      .executeTakeFirstOrThrow()

    switch (question.question_type) {
      case 'single_choice':
        return this.gradeSingleChoice(questionId, answer as string, question.points)
      
      case 'multiple_choice':
        return this.gradeMultipleChoice(questionId, answer as string[], question.points)
      
      case 'true_false':
        return this.gradeTrueFalse(questionId, answer as string, question.points)
      
      case 'short_answer':
        // 简答题需要人工评分，暂时返回 0 分
        return { isCorrect: false, pointsEarned: 0 }
      
      default:
        throw new Error(`Unknown question type: ${question.question_type}`)
    }
  }

  /**
   * 评分整个考试
   */
  async gradeExamAttempt(attemptId: string): Promise<{
    totalScore: number
    maxScore: number
    percentage: number
  }> {
    const answers = await db
      .selectFrom('user_answers')
      .selectAll()
      .where('exam_attempt_id', '=', attemptId)
      .execute()

    let totalScore = 0
    let maxScore = 0

    for (const answer of answers) {
      const question = await db
        .selectFrom('questions')
        .select(['points'])
        .where('id', '=', answer.question_id)
        .executeTakeFirstOrThrow()

      maxScore += question.points
      totalScore += answer.points_earned
    }

    const percentage = maxScore > 0 ? (totalScore / maxScore) * 100 : 0

    return {
      totalScore,
      maxScore,
      percentage: Math.round(percentage * 100) / 100,
    }
  }

  private async gradeSingleChoice(
    questionId: string,
    selectedOptionId: string,
    points: number
  ) {
    const option = await db
      .selectFrom('question_options')
      .select(['is_correct'])
      .where('id', '=', selectedOptionId)
      .where('question_id', '=', questionId)
      .executeTakeFirst()

    const isCorrect = option?.is_correct ?? false
    return {
      isCorrect,
      pointsEarned: isCorrect ? points : 0,
    }
  }

  private async gradeMultipleChoice(
    questionId: string,
    selectedOptionIds: string[],
    points: number
  ) {
    const correctOptions = await db
      .selectFrom('question_options')
      .select(['id'])
      .where('question_id', '=', questionId)
      .where('is_correct', '=', true)
      .execute()

    const correctIds = new Set(correctOptions.map(o => o.id))
    const selectedIds = new Set(selectedOptionIds)

    const isCorrect =
      correctIds.size === selectedIds.size &&
      [...correctIds].every(id => selectedIds.has(id))

    return {
      isCorrect,
      pointsEarned: isCorrect ? points : 0,
    }
  }

  private async gradeTrueFalse(
    questionId: string,
    selectedOptionId: string,
    points: number
  ) {
    return this.gradeSingleChoice(questionId, selectedOptionId, points)
  }
}

export const gradingService = new GradingService()
```

---

## 🔒 安全性考虑

### 1. 认证和授权
- ✅ 使用 Clerk 进行用户认证
- ✅ 基于角色的访问控制 (RBAC)
- ✅ API 路由权限验证
- ✅ 服务器端权限检查

### 2. 数据验证
- ✅ 使用 Zod 进行输入验证
- ✅ 服务器端验证所有用户输入
- ✅ SQL 注入防护（Kysely 自动处理）

### 3. 考试安全
- ✅ 防止考试期间刷新页面丢失答案（自动保存）
- ✅ 考试时间限制
- ✅ 防止重复提交
- ✅ 答案加密存储（可选）

### 4. 环境变量
```env
# .env.local
DATABASE_URL=postgresql://user:password@localhost:5432/exam_db
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_xxx
CLERK_SECRET_KEY=sk_test_xxx
CLERK_WEBHOOK_SECRET=whsec_xxx
```

---

## 📊 性能优化策略

### 1. 数据库优化
- ✅ 合理的索引设计
- ✅ 使用连接池
- ✅ 查询优化（避免 N+1 问题）
- ✅ 分页加载

### 2. 前端优化
- ✅ 使用 Server Components 减少客户端 JavaScript
- ✅ 图片优化（Next.js Image 组件）
- ✅ 代码分割和懒加载
- ✅ 缓存策略

### 3. 缓存策略
```typescript
// 使用 Next.js 缓存
export const revalidate = 3600 // 1 小时

// 或使用 unstable_cache
import { unstable_cache } from 'next/cache'

export const getExams = unstable_cache(
  async () => {
    return db.selectFrom('exams').selectAll().execute()
  },
  ['exams'],
  { revalidate: 3600 }
)
```

---

## 🧪 测试策略

### 1. 单元测试
- 测试工具函数
- 测试验证模式
- 测试评分逻辑

### 2. 集成测试
- 测试 API 路由
- 测试 Server Actions
- 测试数据库操作

### 3. E2E 测试
- 测试完整的用户流程
- 测试管理员流程

---

## 📝 下一步实施计划

1. ✅ **环境准备** - 已完成
2. ✅ **架构设计** - 当前步骤
3. ⏭️ **数据库设置**
   - 创建 PostgreSQL 数据库
   - 配置 Kysely
   - 运行迁移脚本
4. ⏭️ **认证集成**
   - 配置 Clerk
   - 实现权限中间件
   - 设置 Webhook
5. ⏭️ **核心功能实现**
   - 实现试卷管理
   - 实现试题管理
   - 实现答题功能
   - 实现结果展示
6. ⏭️ **UI 开发**
   - 安装 shadcn/ui 组件
   - 开发页面布局
   - 开发功能组件
7. ⏭️ **测试和优化**
   - 功能测试
   - 性能优化
   - 安全审计

---

## 🎓 技术决策说明

### 为什么选择 Kysely？
- ✅ 类型安全的 SQL 查询构建器
- ✅ 与 TypeScript 完美集成
- ✅ 支持复杂查询
- ✅ 轻量级，无额外抽象层

### 为什么选择 Clerk？
- ✅ 开箱即用的认证 UI
- ✅ 支持多种登录方式
- ✅ 内置角色和权限管理
- ✅ Webhook 支持用户同步

### 为什么使用 Server Actions？
- ✅ 简化客户端-服务器通信
- ✅ 自动处理序列化
- ✅ 类型安全
- ✅ 减少样板代码

---

**架构设计完成！** 🎉

这份架构文档提供了完整的技术方案，包括数据库设计、API 结构、组件架构、权限控制等所有关键方面。你可以基于这份文档开始实施开发工作。
