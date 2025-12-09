# 나의 가계부 - Premium Personal Finance App

Apple Liquid Glass UI를 적용한 프리미엄 개인 가계부 웹 애플리케이션입니다.

## ✨ 주요 기능

### 📊 대시보드
- 월별 수입/지출 요약
- 일별 추이 차트 (Area Chart)
- 카테고리별 지출 분석 (Pie Chart)
- 예산 진행률 표시
- 저축 목표 진행 상황
- 최근 거래 목록

### 💳 거래 관리
- 수입/지출 거래 등록
- 카테고리 및 계좌 분류
- 검색 및 필터링
- 거래 삭제

### 📈 예산 관리
- 카테고리별 월 예산 설정
- 사용률 시각화
- 초과 지출 경고

### 🏷️ 카테고리
- 수입/지출 카테고리 관리
- 커스텀 색상 지정

### 📉 리포트
- 상세 지출 분석
- 카테고리별 막대 차트
- 수입 내역 분석

### 🎯 저축 목표
- 저축 목표 설정
- 진행률 추적
- 목표일 관리

### 🔄 정기 결제
- 구독 및 정기 결제 관리
- 월 예상 결제액 계산
- 다음 결제일 표시

## 🛠️ 기술 스택

### Frontend
- React 19 + TypeScript
- Recharts (차트 라이브러리)
- Apple Liquid Glass UI 디자인

### Backend
- Express.js
- SQLite (better-sqlite3)
- RESTful API

## 🚀 시작하기

### 1. 의존성 설치

```bash
cd my-ledger
npm install
```

### 2. 개발 서버 실행

```bash
npm run dev
```

이 명령어는 다음을 동시에 실행합니다:
- Frontend: http://localhost:5173
- Backend: http://localhost:3001

### 3. 브라우저에서 확인

```
http://localhost:5173
```

## 📁 프로젝트 구조

```
my-ledger/
├── server/                 # Backend
│   ├── db/
│   │   ├── index.ts       # Database connection
│   │   └── schema.ts      # SQLite schema & seed data
│   └── index.ts           # Express API server
├── src/                    # Frontend
│   ├── api.ts             # API client
│   ├── App.tsx            # Main app component
│   ├── main.tsx           # Entry point
│   └── styles.css         # Liquid Glass UI styles
├── data/                   # SQLite database (auto-created)
├── package.json
├── tsconfig.json
├── tsconfig.server.json
└── vite.config.ts
```

## 🗄️ 데이터베이스 스키마

### Users
- id, email, password_hash, name, currency, created_at

### Categories
- id, user_id, name, type (income/expense), color

### Accounts
- id, user_id, name, type (cash/bank/card/investment), balance

### Transactions
- id, user_id, type, amount, category_id, account_id, date, memo

### Budgets
- id, user_id, category_id, amount, month

### Savings Goals
- id, user_id, name, target_amount, current_amount, deadline

### Recurring Payments
- id, user_id, name, amount, category_id, cycle, next_billing_date

## 🔌 API 엔드포인트

### Transactions
- `GET /api/transactions` - 거래 목록 조회
- `POST /api/transactions` - 거래 생성
- `PUT /api/transactions/:id` - 거래 수정
- `DELETE /api/transactions/:id` - 거래 삭제

### Categories
- `GET /api/categories` - 카테고리 목록
- `POST /api/categories` - 카테고리 생성
- `PUT /api/categories/:id` - 카테고리 수정
- `DELETE /api/categories/:id` - 카테고리 삭제

### Budgets
- `GET /api/budgets` - 예산 목록
- `POST /api/budgets` - 예산 생성/수정
- `DELETE /api/budgets/:id` - 예산 삭제

### Savings Goals
- `GET /api/savings-goals` - 저축 목표 목록
- `POST /api/savings-goals` - 저축 목표 생성
- `PUT /api/savings-goals/:id` - 저축 목표 수정
- `DELETE /api/savings-goals/:id` - 저축 목표 삭제

### Recurring Payments
- `GET /api/recurring-payments` - 정기 결제 목록
- `POST /api/recurring-payments` - 정기 결제 생성
- `PUT /api/recurring-payments/:id` - 정기 결제 수정
- `DELETE /api/recurring-payments/:id` - 정기 결제 삭제

### Statistics
- `GET /api/stats/monthly?month=YYYY-MM` - 월간 통계
- `GET /api/stats/yearly?year=YYYY` - 연간 통계

## 🎨 디자인 시스템

### Apple Liquid Glass UI
- Glassmorphism 효과 (backdrop-filter: blur)
- 부드러운 그라데이션 배경
- 얇은 구분선 (rgba 255, 255, 255, 0.18)
- 둥근 모서리 (10px ~ 36px)
- 부드러운 그림자
- iOS 스타일 애니메이션

### 색상 팔레트
- Primary: #007AFF (Apple Blue)
- Success: #34C759
- Warning: #FF9500
- Danger: #FF3B30
- Glass Background: rgba(255, 255, 255, 0.72)

## 📝 라이선스

MIT License
# financial-ledger
