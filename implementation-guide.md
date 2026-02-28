# 在线考试网站实施指南

本文档提供了基于架构设计的详细实施步骤和代码模板。

---

## 📋 实施步骤概览

1. ✅ 环境准备 - 已完成
2. ✅ 架构设计 - 已完成
3. ⏭️ 数据库配置和迁移
4. ⏭️ Clerk 认证集成
5. ⏭️ 核心服务实现
6. ⏭️ API 路由实现
7. ⏭️ UI 组件开发
8. ⏭️ 测试和部署

---

## 🗄️ 步骤 3: 数据库配置和迁移

### 3.1 创建 Kysely 配置文件

**文件**: `lib/db/index.ts`

```typescript
/**
 * Kysely 数据库实例配置
 */

import { Kysely, PostgresDialect } from 'kysely'
import { Pool } from 'pg'
import type { Database } from './types'

// 创建 PostgreSQL 连接池
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
})

// 创建 Kysely 实例
export const db = new Kysely<Database>({
  dialect: new PostgresDialect({
    pool,
  }),
  log:
    process.env.NODE_ENV === 'development'
      ? (event) => {
          if (event.level === 'query') {
            console.log('SQL:', event.query.sql)
            console.log('Parameters:', event.query.parameters)
          }
        }
      : undefined,
})

// 测试数据库连接
export async function testConnection() {
  try {
    await db.selectFrom('users').select('clerk_id').limit(1).execute()
    console.log('✅ Database connection successful')
    return true
  } catch (error) {
    console.error('❌ Database connection failed:', error)
    return false
  }
}

// 优雅关闭数据库连接
export async function closeDatabase() {
  await pool.end()
  console.log('Database connection closed')
}
```

### 3.2 创建数据库类型定义

**文件**: `lib/db/types.ts`

```typescript
/**
 * 数据库表类型定义
 * 注意: 这些类型应该通过 kysely-codegen 自动生成
 * 这里提供手动定义的版本作为参考
 */

import type { ColumnType } from 'kysely'

export type Generated<T> = T extends ColumnType<infer S, infer I, infer U>
  ? ColumnType<S, I | undefined, U>
  : ColumnType<T, T | undefined, T>

export type Timestamp = ColumnType<Date, Date | string, Date | string>

export interface UsersTable {
  clerk_id: string
  email: string
  role: 'admin' | 'user'
  name: string | null
  created_at: Generated<Timestamp>
  updated_at: Generated<Timestamp>
}

export interface ExamsTable {
  id: Generated<string>
  title: string
  description: string | null
  duration_minutes: number
  passing_score: number
  is_published: Generated<boolean>
  created_by_clerk_id: string
  created_at: Generated<Timestamp>
  updated_at: Generated<Timestamp>
}

export interface QuestionsTable {
  id: Generated<string>
  exam_id: string
  question_text: string
  question_type: 'single_choice' | 'multiple_choice' | 'true_false' | 'short_answer'
  points: number
  order_index: number
  created_at: Generated<Timestamp>
  updated_at: Generated<Timestamp>
}

export interface QuestionOptionsTable {
  id: Generated<string>
  question_id: string
  option_text: string
  is_correct: Generated<boolean>
  order_index: number
}

export interface ExamAttemptsTable {
  id: Generated<string>
  exam_id: string
  user_clerk_id: string
  total_score: Generated<number>
  max_score: number
  percentage: Generated<number>
  status: Generated<'in_progress' | 'completed' | 'abandoned'>
  started_at: Generated<Timestamp>
  completed_at: Timestamp | null
  created_at: Generated<Timestamp>
}

export interface UserAnswersTable {
  id: Generated<string>
  exam_attempt_id: string
  question_id: string
  answer_text: string | null
  selected_option_id: string | null
  is_correct: Generated<boolean>
  points_earned: Generated<number>
  answered_at: Generated<Timestamp>
}

export interface Database {
  users: UsersTable
  exams: ExamsTable
  questions: QuestionsTable
  question_options: QuestionOptionsTable
  exam_attempts: ExamAttemptsTable
  user_answers: UserAnswersTable
}
```

### 3.3 创建数据库迁移脚本

**文件**: `lib/db/migrations/001_initial.sql`

```sql
-- 创建 users 表
CREATE TABLE users (
    clerk_id VARCHAR(255) PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'user',
    name VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_email ON users(email);

-- 创建 exams 表
CREATE TABLE exams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    duration_minutes INT NOT NULL,
    passing_score INT NOT NULL DEFAULT 60,
    is_published BOOLEAN DEFAULT false,
    created_by_clerk_id VARCHAR(255) REFERENCES users(clerk_id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_exams_published ON exams(is_published);
CREATE INDEX idx_exams_created_by ON exams(created_by_clerk_id);

-- 创建 questions 表
CREATE TABLE questions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    exam_id UUID NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
    question_text TEXT NOT NULL,
    question_type VARCHAR(50) NOT NULL,
    points INT NOT NULL DEFAULT 1,
    order_index INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_question_type CHECK (question_type IN ('single_choice', 'multiple_choice', 'true_false', 'short_answer'))
);

CREATE INDEX idx_questions_exam ON questions(exam_id);
CREATE INDEX idx_questions_order ON questions(exam_id, order_index);

-- 创建 question_options 表
CREATE TABLE question_options (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    question_id UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    option_text TEXT NOT NULL,
    is_correct BOOLEAN DEFAULT false,
    order_index INT NOT NULL
);

CREATE INDEX idx_options_question ON question_options(question_id);

-- 创建 exam_attempts 表
CREATE TABLE exam_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    exam_id UUID NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
    user_clerk_id VARCHAR(255) NOT NULL REFERENCES users(clerk_id),
    total_score INT DEFAULT 0,
    max_score INT NOT NULL,
    percentage DECIMAL(5,2) DEFAULT 0,
    status VARCHAR(50) NOT NULL DEFAULT 'in_progress',
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_status CHECK (status IN ('in_progress', 'completed', 'abandoned'))
);

CREATE INDEX idx_attempts_user ON exam_attempts(user_clerk_id);
CREATE INDEX idx_attempts_exam ON exam_attempts(exam_id);
CREATE INDEX idx_attempts_status ON exam_attempts(status);

-- 创建 user_answers 表
CREATE TABLE user_answers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    exam_attempt_id UUID NOT NULL REFERENCES exam_attempts(id) ON DELETE CASCADE,
    question_id UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    answer_text TEXT,
    selected_option_id UUID REFERENCES question_options(id),
    is_correct BOOLEAN DEFAULT false,
    points_earned INT DEFAULT 0,
    answered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_answers_attempt ON user_answers(exam_attempt_id);
CREATE INDEX idx_answers_question ON user_answers(question_id);

-- 创建更新 updated_at 的触发器函数
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- 为需要的表添加触发器
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_exams_updated_at BEFORE UPDATE ON exams
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_questions_updated_at BEFORE UPDATE ON questions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

### 3.4 创建迁移执行脚本

**文件**: `lib/db/migrations/migrate.ts`

```typescript
/**
 * 数据库迁移脚本
 * 运行: npx tsx lib/db/migrations/migrate.ts
 */

import { Pool } from 'pg'
import { promises as fs } from 'fs'
import path from 'path'

async function runMigrations() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  })

  try {
    console.log('🚀 Starting database migrations...')

    // 读取迁移文件
    const migrationPath = path.join(__dirname, '001_initial.sql')
    const sql = await fs.readFile(migrationPath, 'utf-8')

    // 执行迁移
    await pool.query(sql)

    console.log('✅ Migrations completed successfully!')
  } catch (error) {
    console.error('❌ Migration failed:', error)
    process.exit(1)
  } finally {
    await pool.end()
  }
}

runMigrations()
```

### 3.5 配置环境变量

**文件**: `.env.local`

```env
# 数据库配置
DATABASE_URL=postgresql://username:password@localhost:5432/exam_db

# Clerk 配置
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_xxxxx
CLERK_SECRET_KEY=sk_test_xxxxx
CLERK_WEBHOOK_SECRET=whsec_xxxxx

# Clerk 路由配置
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/dashboard
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/dashboard
```

### 3.6 添加迁移脚本到 package.json

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint . --fix",
    "db:migrate": "tsx lib/db/migrations/migrate.ts",
    "db:generate": "kysely-codegen --out-file lib/db/types.ts"
  }
}
```

### 3.7 运行迁移

```bash
# 1. 确保 PostgreSQL 已安装并运行
# 2. 创建数据库
createdb exam_db

# 3. 配置 .env.local 文件

# 4. 安装 tsx (用于运行 TypeScript)
npm install -D tsx

# 5. 运行迁移
npm run db:migrate

# 6. (可选) 生成类型定义
npm run db:generate
```

---

## 🔐 步骤 4: Clerk 认证集成

### 4.1 配置 Clerk 中间件

**文件**: `middleware.ts`

```typescript
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'

// 定义公开路由
const isPublicRoute = createRouteMatcher([
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/',
])

export default clerkMiddleware(async (auth, request) => {
  if (!isPublicRoute(request)) {
    await auth.protect()
  }
})

export const config = {
  matcher: [
    // 跳过 Next.js 内部路由和静态文件
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // 始终运行 API 路由
    '/(api|trpc)(.*)',
  ],
}
```

### 4.2 配置根布局

**文件**: `app/layout.tsx`

```typescript
import { ClerkProvider } from '@clerk/nextjs'
import { zhCN } from '@clerk/localizations'
import './globals.css'

export const metadata = {
  title: '在线考试系统',
  description: '基于 Next.js 的在线考试平台',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <ClerkProvider localization={zhCN}>
      <html lang="zh-CN">
        <body>{children}</body>
      </html>
    </ClerkProvider>
  )
}
```

### 4.3 创建权限工具函数

**文件**: `lib/auth/permissions.ts`

```typescript
import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'

export type UserRole = 'admin' | 'user'

/**
 * 要求用户已登录
 */
export async function requireAuth() {
  const { userId } = await auth()
  if (!userId) {
    redirect('/sign-in')
  }
  return userId
}

/**
 * 要求用户是管理员
 */
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

/**
 * 获取当前用户角色
 */
export async function getUserRole(): Promise<UserRole> {
  const { sessionClaims } = await auth()
  return (sessionClaims?.metadata?.role as UserRole) || 'user'
}

/**
 * 检查是否是管理员
 */
export async function isAdmin(): Promise<boolean> {
  const role = await getUserRole()
  return role === 'admin'
}

/**
 * 获取当前用户 ID
 */
export async function getCurrentUserId(): Promise<string | null> {
  const { userId } = await auth()
  return userId
}
```

### 4.4 创建 Clerk Webhook 处理

**文件**: `app/api/webhooks/clerk/route.ts`

```typescript
import { Webhook } from 'svix'
import { headers } from 'next/headers'
import { WebhookEvent } from '@clerk/nextjs/server'
import { db } from '@/lib/db'

export async function POST(req: Request) {
  const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET

  if (!WEBHOOK_SECRET) {
    throw new Error('Please add CLERK_WEBHOOK_SECRET to .env.local')
  }

  // 获取 headers
  const headerPayload = await headers()
  const svix_id = headerPayload.get('svix-id')
  const svix_timestamp = headerPayload.get('svix-timestamp')
  const svix_signature = headerPayload.get('svix-signature')

  if (!svix_id || !svix_timestamp || !svix_signature) {
    return new Response('Error: Missing svix headers', { status: 400 })
  }

  // 获取 body
  const payload = await req.json()
  const body = JSON.stringify(payload)

  // 创建 Svix 实例
  const wh = new Webhook(WEBHOOK_SECRET)

  let evt: WebhookEvent

  // 验证 webhook
  try {
    evt = wh.verify(body, {
      'svix-id': svix_id,
      'svix-timestamp': svix_timestamp,
      'svix-signature': svix_signature,
    }) as WebhookEvent
  } catch (err) {
    console.error('Error verifying webhook:', err)
    return new Response('Error: Verification failed', { status: 400 })
  }

  // 处理事件
  const eventType = evt.type

  if (eventType === 'user.created') {
    const { id, email_addresses, first_name, last_name } = evt.data

    // 同步用户到数据库
    await db
      .insertInto('users')
      .values({
        clerk_id: id,
        email: email_addresses[0].email_address,
        name: `${first_name || ''} ${last_name || ''}`.trim() || null,
        role: 'user', // 默认角色
      })
      .execute()

    console.log('✅ User synced:', id)
  }

  if (eventType === 'user.updated') {
    const { id, email_addresses, first_name, last_name } = evt.data

    await db
      .updateTable('users')
      .set({
        email: email_addresses[0].email_address,
        name: `${first_name || ''} ${last_name || ''}`.trim() || null,
      })
      .where('clerk_id', '=', id)
      .execute()

    console.log('✅ User updated:', id)
  }

  if (eventType === 'user.deleted') {
    const { id } = evt.data

    await db.deleteFrom('users').where('clerk_id', '=', id!).execute()

    console.log('✅ User deleted:', id)
  }

  return new Response('Webhook processed', { status: 200 })
}
```

### 4.5 创建登录页面

**文件**: `app/(auth)/sign-in/[[...sign-in]]/page.tsx`

```typescript
import { SignIn } from '@clerk/nextjs'

export default function SignInPage() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <SignIn />
    </div>
  )
}
```

**文件**: `app/(auth)/sign-up/[[...sign-up]]/page.tsx`

```typescript
import { SignUp } from '@clerk/nextjs'

export default function SignUpPage() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <SignUp />
    </div>
  )
}
```

---

## 🛠️ 步骤 5: 核心服务实现

### 5.1 创建验证模式

**文件**: `lib/validations/exam-schema.ts`

```typescript
import { z } from 'zod'

export const createExamSchema = z.object({
  title: z.string().min(1, '试卷标题不能为空').max(255),
  description: z.string().optional(),
  duration_minutes: z.number().int().min(1, '考试时长至少 1 分钟'),
  passing_score: z.number().int().min(0).max(100, '及格分数必须在 0-100 之间'),
})

export const updateExamSchema = createExamSchema.partial()

export type CreateExamInput = z.infer<typeof createExamSchema>
export type UpdateExamInput = z.infer<typeof updateExamSchema>
```

**文件**: `lib/validations/question-schema.ts`

```typescript
import { z } from 'zod'

export const questionTypeSchema = z.enum([
  'single_choice',
  'multiple_choice',
  'true_false',
  'short_answer',
])

export const questionOptionSchema = z.object({
  option_text: z.string().min(1, '选项内容不能为空'),
  is_correct: z.boolean(),
  order_index: z.number().int().min(0),
})

export const createQuestionSchema = z.object({
  exam_id: z.string().uuid(),
  question_text: z.string().min(1, '题目内容不能为空'),
  question_type: questionTypeSchema,
  points: z.number().int().min(1, '分值至少为 1'),
  order_index: z.number().int().min(0),
  options: z.array(questionOptionSchema).optional(),
})

export const updateQuestionSchema = createQuestionSchema.partial().omit({ exam_id: true })

export type QuestionType = z.infer<typeof questionTypeSchema>
export type QuestionOption = z.infer<typeof questionOptionSchema>
export type CreateQuestionInput = z.infer<typeof createQuestionSchema>
export type UpdateQuestionInput = z.infer<typeof updateQuestionSchema>
```

**文件**: `lib/validations/answer-schema.ts`

```typescript
import { z } from 'zod'

export const submitAnswerSchema = z.object({
  exam_attempt_id: z.string().uuid(),
  question_id: z.string().uuid(),
  answer_text: z.string().optional(),
  selected_option_id: z.string().uuid().optional(),
})

export type SubmitAnswerInput = z.infer<typeof submitAnswerSchema>
```

### 5.2 创建考试服务

**文件**: `lib/services/exam-service.ts`

```typescript
import { db } from '@/lib/db'
import type { CreateExamInput, UpdateExamInput } from '@/lib/validations/exam-schema'

export class ExamService {
  /**
   * 获取所有已发布的试卷
   */
  async getPublishedExams() {
    return db
      .selectFrom('exams')
      .selectAll()
      .where('is_published', '=', true)
      .orderBy('created_at', 'desc')
      .execute()
  }

  /**
   * 获取所有试卷（管理员）
   */
  async getAllExams() {
    return db
      .selectFrom('exams')
      .selectAll()
      .orderBy('created_at', 'desc')
      .execute()
  }

  /**
   * 根据 ID 获取试卷
   */
  async getExamById(examId: string) {
    return db
      .selectFrom('exams')
      .selectAll()
      .where('id', '=', examId)
      .executeTakeFirst()
  }

  /**
   * 创建试卷
   */
  async createExam(data: CreateExamInput, createdBy: string) {
    return db
      .insertInto('exams')
      .values({
        ...data,
        created_by_clerk_id: createdBy,
      })
      .returningAll()
      .executeTakeFirstOrThrow()
  }

  /**
   * 更新试卷
   */
  async updateExam(examId: string, data: UpdateExamInput) {
    return db
      .updateTable('exams')
      .set(data)
      .where('id', '=', examId)
      .returningAll()
      .executeTakeFirst()
  }

  /**
   * 删除试卷
   */
  async deleteExam(examId: string) {
    return db.deleteFrom('exams').where('id', '=', examId).execute()
  }

  /**
   * 发布试卷
   */
  async publishExam(examId: string) {
    return db
      .updateTable('exams')
      .set({ is_published: true })
      .where('id', '=', examId)
      .returningAll()
      .executeTakeFirst()
  }

  /**
   * 取消发布试卷
   */
  async unpublishExam(examId: string) {
    return db
      .updateTable('exams')
      .set({ is_published: false })
      .where('id', '=', examId)
      .returningAll()
      .executeTakeFirst()
  }

  /**
   * 获取试卷的所有试题
   */
  async getExamQuestions(examId: string) {
    return db
      .selectFrom('questions')
      .selectAll()
      .where('exam_id', '=', examId)
      .orderBy('order_index', 'asc')
      .execute()
  }

  /**
   * 获取试卷统计信息
   */
  async getExamStats(examId: string) {
    const [questionCount, attemptCount, avgScore] = await Promise.all([
      // 题目数量
      db
        .selectFrom('questions')
        .select(({ fn }) => [fn.count<number>('id').as('count')])
        .where('exam_id', '=', examId)
        .executeTakeFirst(),
      
      // 考试次数
      db
        .selectFrom('exam_attempts')
        .select(({ fn }) => [fn.count<number>('id').as('count')])
        .where('exam_id', '=', examId)
        .where('status', '=', 'completed')
        .executeTakeFirst(),
      
      // 平均分
      db
        .selectFrom('exam_attempts')
        .select(({ fn }) => [fn.avg<number>('percentage').as('avg')])
        .where('exam_id', '=', examId)
        .where('status', '=', 'completed')
        .executeTakeFirst(),
    ])

    return {
      questionCount: questionCount?.count || 0,
      attemptCount: attemptCount?.count || 0,
      avgScore: avgScore?.avg || 0,
    }
  }
}

export const examService = new ExamService()
```

### 5.3 创建评分服务

**文件**: `lib/services/grading-service.ts`

```typescript
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
      case 'true_false':
        return this.gradeSingleChoice(questionId, answer as string, question.points)
      
      case 'multiple_choice':
        return this.gradeMultipleChoice(questionId, answer as string[], question.points)
      
      case 'short_answer':
        // 简答题需要人工评分
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
}

export const gradingService = new GradingService()
```

---

## 🎨 步骤 6: 安装 shadcn/ui 组件

### 6.1 安装基础 UI 组件

```bash
# 安装常用组件
npx shadcn@latest add button
npx shadcn@latest add card
npx shadcn@latest add form
npx shadcn@latest add input
npx shadcn@latest add label
npx shadcn@latest add select
npx shadcn@latest add textarea
npx shadcn@latest add dialog
npx shadcn@latest add badge
npx shadcn@latest add table
npx shadcn@latest add tabs
npx shadcn@latest add toast
npx shadcn@latest add dropdown-menu
npx shadcn@latest add separator
npx shadcn@latest add radio-group
npx shadcn@latest add checkbox
npx shadcn@latest add progress
npx shadcn@latest add alert
```

### 6.2 创建布局组件

**文件**: `components/layout/header.tsx`

```typescript
import { UserButton } from '@clerk/nextjs'
import Link from 'next/link'
import { isAdmin } from '@/lib/auth/permissions'

export async function Header() {
  const admin = await isAdmin()

  return (
    <header className="border-b">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        <div className="flex items-center gap-6">
          <Link href="/dashboard" className="text-xl font-bold">
            在线考试系统
          </Link>
          
          <nav className="flex gap-4">
            <Link href="/dashboard" className="text-sm hover:underline">
              仪表板
            </Link>
            <Link href="/exams" className="text-sm hover:underline">
              试卷列表
            </Link>
            <Link href="/history" className="text-sm hover:underline">
              考试历史
            </Link>
            {admin && (
              <Link href="/admin" className="text-sm font-semibold hover:underline">
                管理后台
              </Link>
            )}
          </nav>
        </div>

        <UserButton afterSignOutUrl="/" />
      </div>
    </header>
  )
}
```

---

## 📝 步骤 7: 创建主要页面

### 7.1 首页

**文件**: `app/page.tsx`

```typescript
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'

export default async function HomePage() {
  const { userId } = await auth()

  if (userId) {
    redirect('/dashboard')
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center">
      <div className="text-center">
        <h1 className="mb-4 text-4xl font-bold">在线考试系统</h1>
        <p className="mb-8 text-muted-foreground">
          现代化的在线考试平台,支持多种题型和实时评分
        </p>
        <div className="flex gap-4">
          <Button asChild>
            <Link href="/sign-in">登录</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/sign-up">注册</Link>
          </Button>
        </div>
      </div>
    </div>
  )
}
```

### 7.2 用户仪表板

**文件**: `app/(dashboard)/dashboard/page.tsx`

```typescript
import { requireAuth } from '@/lib/auth/permissions'
import { db } from '@/lib/db'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default async function DashboardPage() {
  const userId = await requireAuth()

  // 获取用户统计
  const [totalAttempts, completedExams, avgScore] = await Promise.all([
    db
      .selectFrom('exam_attempts')
      .select(({ fn }) => [fn.count<number>('id').as('count')])
      .where('user_clerk_id', '=', userId)
      .executeTakeFirst(),
    
    db
      .selectFrom('exam_attempts')
      .select(({ fn }) => [fn.count<number>('id').as('count')])
      .where('user_clerk_id', '=', userId)
      .where('status', '=', 'completed')
      .executeTakeFirst(),
    
    db
      .selectFrom('exam_attempts')
      .select(({ fn }) => [fn.avg<number>('percentage').as('avg')])
      .where('user_clerk_id', '=', userId)
      .where('status', '=', 'completed')
      .executeTakeFirst(),
  ])

  return (
    <div className="container mx-auto p-6">
      <h1 className="mb-6 text-3xl font-bold">我的仪表板</h1>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>总考试次数</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{totalAttempts?.count || 0}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>已完成考试</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{completedExams?.count || 0}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>平均分数</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">
              {avgScore?.avg ? `${Math.round(avgScore.avg)}%` : 'N/A'}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
```

---

## 🚀 下一步操作

完成以上配置后,你可以:

1. **运行开发服务器**
   ```bash
   npm run dev
   ```

2. **访问应用**
   - 首页: http://localhost:3000
   - 登录: http://localhost:3000/sign-in
   - 仪表板: http://localhost:3000/dashboard

3. **继续开发**
   - 实现试卷列表页面
   - 实现答题界面
   - 实现管理员功能
   - 添加更多 UI 组件

---

## 📚 相关资源

- [Next.js 文档](https://nextjs.org/docs)
- [Clerk 文档](https://clerk.com/docs)
- [Kysely 文档](https://kysely.dev)
- [shadcn/ui 文档](https://ui.shadcn.com)
- [Tailwind CSS v4 文档](https://tailwindcss.com/docs)

---

**实施指南完成!** 🎉

按照本指南逐步实施,你将能够构建一个功能完整的在线考试系统。
