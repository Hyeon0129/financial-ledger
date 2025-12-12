-- ⚠️ 중요: loans 테이블의 account_id 외래 키 수정 필요
-- 문제: "not null" + "on delete set null"은 모순임

-- 해결방법 1: account_id를 nullable로 변경
ALTER TABLE public.loans 
ALTER COLUMN account_id DROP NOT NULL;

-- 또는 해결방법 2: on delete cascade로 변경 (권장)
-- ALTER TABLE public.loans 
-- DROP CONSTRAINT IF EXISTS loans_account_id_fkey,
-- ADD CONSTRAINT loans_account_id_fkey 
-- FOREIGN KEY (account_id) 
-- REFERENCES public.accounts(id) 
-- ON DELETE CASCADE;

-- ========================================
-- 전체 스키마 (수정된 버전)
-- ========================================

-- profiles (이미 생성됨, 확인용)
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  name text,
  avatar_url text,
  currency text DEFAULT '₩',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- categories
CREATE TABLE IF NOT EXISTS public.categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  type text NOT NULL CHECK (type IN ('income', 'expense')),
  parent_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  color text DEFAULT '#6B7280',
  icon text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_categories_user_id ON public.categories(user_id);
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

-- accounts
CREATE TABLE IF NOT EXISTS public.accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  type text NOT NULL CHECK (type IN ('cash', 'bank', 'card', 'investment')),
  balance numeric DEFAULT 0,
  color text DEFAULT '#6B7280',
  icon text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_accounts_user_id ON public.accounts(user_id);
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;

-- transactions
CREATE TABLE IF NOT EXISTS public.transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('income', 'expense', 'transfer')),
  amount numeric NOT NULL,
  category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  account_id uuid REFERENCES public.accounts(id) ON DELETE SET NULL,
  to_account_id uuid REFERENCES public.accounts(id) ON DELETE SET NULL,
  date text NOT NULL,
  memo text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON public.transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_date ON public.transactions(date);
CREATE INDEX IF NOT EXISTS idx_transactions_category ON public.transactions(category_id);
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

-- budgets
CREATE TABLE IF NOT EXISTS public.budgets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  amount numeric NOT NULL,
  month text NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, category_id, month)
);

CREATE INDEX IF NOT EXISTS idx_budgets_user_month ON public.budgets(user_id, month);
ALTER TABLE public.budgets ENABLE ROW LEVEL SECURITY;

-- savings_goals
CREATE TABLE IF NOT EXISTS public.savings_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  target_amount numeric NOT NULL,
  current_amount numeric DEFAULT 0,
  deadline text,
  color text DEFAULT '#0A84FF',
  icon text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_savings_goals_user_id ON public.savings_goals(user_id);
ALTER TABLE public.savings_goals ENABLE ROW LEVEL SECURITY;

-- loans (⚠️ account_id nullable로 수정)
CREATE TABLE IF NOT EXISTS public.loans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  principal numeric NOT NULL,
  interest_rate numeric NOT NULL,
  term_months int NOT NULL,
  start_date text NOT NULL,
  monthly_due_day int NOT NULL,
  account_id uuid REFERENCES public.accounts(id) ON DELETE SET NULL, -- ✅ NOT NULL 제거
  category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  remaining_principal numeric NOT NULL,
  monthly_payment numeric NOT NULL,
  paid_months int DEFAULT 0,
  next_due_date text,
  repayment_type text DEFAULT 'amortized'
    CHECK (repayment_type IN ('amortized', 'interest_only', 'principal_equal')),
  settled_at text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_loans_user_id ON public.loans(user_id);
CREATE INDEX IF NOT EXISTS idx_loans_next_due ON public.loans(next_due_date);
ALTER TABLE public.loans ENABLE ROW LEVEL SECURITY;

-- ========================================
-- 모든 RLS 정책 (한번에 실행)
-- ========================================

-- profiles
DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;

CREATE POLICY "profiles_select_own" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "profiles_insert_own" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- categories
DROP POLICY IF EXISTS "categories_select_own" ON public.categories;
DROP POLICY IF EXISTS "categories_insert_own" ON public.categories;
DROP POLICY IF EXISTS "categories_update_own" ON public.categories;
DROP POLICY IF EXISTS "categories_delete_own" ON public.categories;

CREATE POLICY "categories_select_own" ON public.categories FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "categories_insert_own" ON public.categories FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "categories_update_own" ON public.categories FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "categories_delete_own" ON public.categories FOR DELETE USING (auth.uid() = user_id);

-- accounts
DROP POLICY IF EXISTS "accounts_select_own" ON public.accounts;
DROP POLICY IF EXISTS "accounts_insert_own" ON public.accounts;
DROP POLICY IF EXISTS "accounts_update_own" ON public.accounts;
DROP POLICY IF EXISTS "accounts_delete_own" ON public.accounts;

CREATE POLICY "accounts_select_own" ON public.accounts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "accounts_insert_own" ON public.accounts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "accounts_update_own" ON public.accounts FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "accounts_delete_own" ON public.accounts FOR DELETE USING (auth.uid() = user_id);

-- transactions
DROP POLICY IF EXISTS "transactions_select_own" ON public.transactions;
DROP POLICY IF EXISTS "transactions_insert_own" ON public.transactions;
DROP POLICY IF EXISTS "transactions_update_own" ON public.transactions;
DROP POLICY IF EXISTS "transactions_delete_own" ON public.transactions;

CREATE POLICY "transactions_select_own" ON public.transactions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "transactions_insert_own" ON public.transactions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "transactions_update_own" ON public.transactions FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "transactions_delete_own" ON public.transactions FOR DELETE USING (auth.uid() = user_id);

-- budgets
DROP POLICY IF EXISTS "budgets_select_own" ON public.budgets;
DROP POLICY IF EXISTS "budgets_insert_own" ON public.budgets;
DROP POLICY IF EXISTS "budgets_update_own" ON public.budgets;
DROP POLICY IF EXISTS "budgets_delete_own" ON public.budgets;

CREATE POLICY "budgets_select_own" ON public.budgets FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "budgets_insert_own" ON public.budgets FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "budgets_update_own" ON public.budgets FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "budgets_delete_own" ON public.budgets FOR DELETE USING (auth.uid() = user_id);

-- savings_goals
DROP POLICY IF EXISTS "savings_goals_select_own" ON public.savings_goals;
DROP POLICY IF EXISTS "savings_goals_insert_own" ON public.savings_goals;
DROP POLICY IF EXISTS "savings_goals_update_own" ON public.savings_goals;
DROP POLICY IF EXISTS "savings_goals_delete_own" ON public.savings_goals;

CREATE POLICY "savings_goals_select_own" ON public.savings_goals FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "savings_goals_insert_own" ON public.savings_goals FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "savings_goals_update_own" ON public.savings_goals FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "savings_goals_delete_own" ON public.savings_goals FOR DELETE USING (auth.uid() = user_id);

-- loans
DROP POLICY IF EXISTS "loans_select_own" ON public.loans;
DROP POLICY IF EXISTS "loans_insert_own" ON public.loans;
DROP POLICY IF EXISTS "loans_update_own" ON public.loans;
DROP POLICY IF EXISTS "loans_delete_own" ON public.loans;

CREATE POLICY "loans_select_own" ON public.loans FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "loans_insert_own" ON public.loans FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "loans_update_own" ON public.loans FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "loans_delete_own" ON public.loans FOR DELETE USING (auth.uid() = user_id);

-- ========================================
-- 트리거 (profiles 자동 생성)
-- ========================================

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (id, email)
  VALUES (new.id, new.email)
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

