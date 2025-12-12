# 🚀 Supabase 설정 가이드

## 📋 현재 상태
- ✅ 로그인/회원가입 작동
- ✅ Supabase DB 테이블 생성 완료
- ⚠️ 대출 자동 납부 기능 디버깅 중

---

## 🔧 해결해야 할 문제

### 1. **loans 테이블 외래 키 오류 수정**

현재 `loans` 테이블의 `account_id`가 `NOT NULL` + `ON DELETE SET NULL`로 설정되어 있어 모순입니다.

**Supabase SQL Editor에서 실행:**

```sql
-- account_id를 nullable로 변경
ALTER TABLE public.loans 
ALTER COLUMN account_id DROP NOT NULL;
```

---

## 🧪 대출 자동 납부 테스트 방법

### 1. **디버그 모드 활성화됨**
`src/api.ts` 파일에 `DEBUG_MODE = true`로 설정되어 있어서:
- localStorage guard 무시 (매번 실행)
- 모든 과정이 콘솔에 로그로 출력

### 2. **테스트 순서**

1. **개발 서버 실행**
   ```bash
   npm run dev
   ```

2. **브라우저 콘솔 열기** (F12)

3. **로그인**

4. **대출 등록**
   - 계좌 관리 → 새 대출
   - 대출 시작일: 과거 날짜 (예: 2024-11-12)
   - 매월 납부일: 5일
   - 납부 계좌 선택

5. **거래 내역 확인**
   - 거래 내역 페이지로 이동
   - 콘솔에서 `[Loan Autopay]` 로그 확인
   - 자동 생성된 거래 확인

### 3. **콘솔 로그 예시**

정상 작동 시:
```
[Loan Autopay] 시작 - 오늘: 2024-12-12
[Loan Autopay] 미완료 대출 1건 발견
[Loan Autopay] 처리 중: 주택담보대출 (ID: xxx)
  → 다음 납부일: 2024-12-05, 오늘: 2024-12-12
  → [1회차] 납부 처리: 2024-12-05
  → 거래 생성: 500000원 (원금: 450000원)
  → 거래 생성 성공 (ID: xxx)
  → 계좌 잔액 반영: [["account-id", -500000]]
  → 계좌 잔액 반영 완료
  → 대출 상태 업데이트: 남은원금=9550000, 납부개월=1, 완료=false
  → 대출 업데이트 완료
[Loan Autopay] 완료
```

에러 발생 시:
```
[Loan Autopay] loans 조회 실패: { message: "..." }
또는
  → 거래 생성 실패: { message: "..." }
```

---

## 🐛 예상 문제점 및 해결

### 문제 1: "Foreign key violation"
**원인:** `account_id`가 NOT NULL인데 ON DELETE SET NULL

**해결:** 위의 SQL 실행

### 문제 2: "RLS policy violation"
**원인:** RLS 정책 누락

**해결:** `SUPABASE_SCHEMA_FIX.sql` 전체 실행

### 문제 3: "거래가 생성되지 않음"
**원인:** 
- `next_due_date`가 미래 날짜
- 또는 이미 처리됨

**확인:**
1. Supabase Dashboard → Table Editor → loans
2. `next_due_date` 컬럼 확인
3. 오늘 날짜보다 과거여야 자동 처리됨

### 문제 4: "계좌 잔액이 변하지 않음"
**원인:** `applyAccountDeltas` 함수 실패

**확인:**
- 콘솔에서 "계좌 잔액 반영 실패" 로그 확인
- Supabase Dashboard에서 accounts 테이블 직접 확인

---

## 📊 Supabase Dashboard 확인 사항

### 1. **Authentication**
- Email Provider 활성화 확인
- Confirm email 설정 (개발 중에는 OFF 권장)

### 2. **Table Editor**
모든 테이블 확인:
- ✅ profiles
- ✅ categories
- ✅ accounts
- ✅ transactions
- ✅ budgets
- ✅ savings_goals
- ✅ loans

### 3. **RLS (Row Level Security)**
모든 테이블에서 RLS 활성화 확인:
- `SELECT`, `INSERT`, `UPDATE`, `DELETE` 정책 모두 존재

---

## 🔍 디버깅 팁

### 1. **콘솔 로그 활용**
모든 API 호출과 대출 자동 납부 과정이 콘솔에 출력됩니다.

### 2. **Supabase Logs**
Supabase Dashboard → Logs → API Logs에서 실시간 쿼리 확인

### 3. **수동 대출 납부 테스트**
계좌 관리 → 대출 목록 → "상환" 버튼으로 수동 테스트

### 4. **DEBUG_MODE 끄기**
테스트 완료 후 `src/api.ts`에서:
```typescript
const DEBUG_MODE = false; // 프로덕션에서는 false
```

---

## 📝 다음 단계

1. ✅ Supabase SQL Editor에서 `SUPABASE_SCHEMA_FIX.sql` 실행
2. ✅ `npm run dev` 실행
3. ✅ F12 콘솔 열기
4. ✅ 로그인
5. ✅ 대출 등록 (과거 시작일)
6. ✅ 거래 내역 페이지 이동
7. ✅ 콘솔 로그 확인
8. ✅ 자동 생성된 거래 확인

---

## 🎯 완료 체크리스트

- [ ] loans 테이블 account_id NOT NULL 제거
- [ ] 대출 등록 테스트
- [ ] 자동 납부 거래 생성 확인
- [ ] 계좌 잔액 차감 확인
- [ ] 콘솔 로그 확인
- [ ] DEBUG_MODE = false로 변경

