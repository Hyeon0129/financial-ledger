# 🚀 설치 및 실행 가이드

## ⚠️ 중요: 반드시 순서대로 진행하세요!

### 1단계: 의존성 설치

터미널을 열고 프로젝트 폴더로 이동한 후:

```bash
cd /Users/mac/Project/my-ledger
npm install
```

이 명령어는 다음을 설치합니다:
- Frontend 라이브러리 (React, Recharts 등)
- Backend 라이브러리 (Express, SQLite 등)
- TypeScript 및 빌드 도구

**⏱️ 예상 소요 시간: 2-3분**

### 2단계: 개발 서버 실행

설치가 완료되면:

```bash
npm run dev
```

이 명령어는 **동시에** 다음을 실행합니다:
- ✅ Backend API 서버 (http://localhost:3001)
- ✅ Frontend 개발 서버 (http://localhost:5173)

터미널에 다음과 같은 메시지가 표시되어야 합니다:

```
🚀 Server running at http://localhost:3001
Initializing database...
Schema created.
Seed data inserted.
Database initialized successfully!

  VITE v7.x.x  ready in xxx ms

  ➜  Local:   http://localhost:5173/
```

### 3단계: 브라우저에서 확인

브라우저를 열고 다음 주소로 접속:

```
http://localhost:5173
```

## 🔧 문제 해결

### 화면이 백지로 나오는 경우

**원인**: 서버가 실행되지 않았거나 API 연결 실패

**해결 방법**:

1. 터미널에서 `npm run dev`가 실행 중인지 확인
2. 두 서버가 모두 실행되었는지 확인:
   - Backend: http://localhost:3001
   - Frontend: http://localhost:5173
3. 브라우저 콘솔(F12)에서 에러 확인
4. 포트가 이미 사용 중인 경우:
   ```bash
   # 프로세스 종료 후 다시 실행
   killall node
   npm run dev
   ```

### "npm: command not found" 에러

Node.js가 설치되지 않은 경우입니다.

**해결 방법**:
```bash
# Homebrew로 Node.js 설치 (Mac)
brew install node

# 설치 확인
node --version
npm --version
```

### 포트 충돌 에러

다른 프로그램이 3001 또는 5173 포트를 사용 중인 경우:

```bash
# 포트 사용 중인 프로세스 확인
lsof -i :3001
lsof -i :5173

# 프로세스 종료
kill -9 [PID]
```

### SQLite 데이터베이스 초기화

데이터베이스를 초기 상태로 되돌리려면:

```bash
# 서버 중지 (Ctrl+C)
rm -rf data/
npm run dev
```

## 📦 프로젝트 구조

```
my-ledger/
├── server/              # Backend (Express + SQLite)
│   ├── db/
│   │   ├── index.ts    # DB 연결
│   │   └── schema.ts   # 스키마 & 샘플 데이터
│   └── index.ts        # API 서버
├── src/                 # Frontend (React)
│   ├── api.ts          # API 클라이언트
│   ├── App.tsx         # 메인 앱
│   ├── main.tsx        # 진입점
│   └── styles.css      # Liquid Glass UI
├── data/                # SQLite DB (자동 생성)
└── package.json
```

## 🎯 기본 사용법

### 데모 계정

앱은 자동으로 데모 데이터와 함께 시작됩니다:
- 사용자: demo@example.com
- 샘플 거래 13건
- 샘플 예산 6개
- 저축 목표 3개
- 정기 결제 4개

### 주요 기능

1. **대시보드**: 월별 수입/지출 요약, 차트
2. **거래 내역**: 수입/지출 추가, 검색, 필터링
3. **예산 관리**: 카테고리별 예산 설정
4. **카테고리**: 커스텀 카테고리 생성
5. **리포트**: 상세 분석 및 차트
6. **저축 목표**: 목표 설정 및 진행률 추적
7. **정기 결제**: 구독 서비스 관리
8. **설정**: 통화 단위 변경

## 🛠️ 개발 명령어

```bash
# 개발 서버 실행 (Frontend + Backend)
npm run dev

# Frontend만 실행
npm run client

# Backend만 실행
npm run server

# 프로덕션 빌드
npm run build

# 린트 검사
npm run lint

# 데이터베이스 초기화
npm run db:init
```

## 📱 브라우저 호환성

- Chrome (권장)
- Safari
- Firefox
- Edge

**최소 요구사항**: ES2022 지원 브라우저

## 💡 팁

1. **자동 새로고침**: 코드 수정 시 자동으로 브라우저가 새로고침됩니다
2. **데이터 영속성**: 모든 데이터는 SQLite에 저장되어 서버 재시작 후에도 유지됩니다
3. **개발자 도구**: F12를 눌러 네트워크 탭에서 API 호출을 확인할 수 있습니다

## 🆘 추가 도움이 필요한 경우

1. 터미널의 에러 메시지 확인
2. 브라우저 콘솔(F12) 확인
3. README.md 파일 참조
4. package.json의 스크립트 확인

