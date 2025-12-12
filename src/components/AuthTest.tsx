import { useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import '../styles/login.css';

export default function AuthTest() {
  const [panel, setPanel] = useState<'login' | 'signup'>('login');

  const [signupEmail, setSignupEmail] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [signupPasswordConfirm, setSignupPasswordConfirm] = useState('');
  const [signupError, setSignupError] = useState('');
  const [signupMessage, setSignupMessage] = useState('');
  const [signupLoading, setSignupLoading] = useState(false);

  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginMessage, setLoginMessage] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);

  const isSignupPasswordShort = signupPassword.length > 0 && signupPassword.length < 6;
  const handleSignup = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSignupError('');
    setSignupMessage('');

    if (signupPassword !== signupPasswordConfirm) {
      setSignupError('비밀번호가 일치하지 않습니다.');
      return;
    }

    setSignupLoading(true);
    try {
      const { error } = await supabase.auth.signUp({
        email: signupEmail,
        password: signupPassword,
      });

      if (error) {
        setSignupError(error.message);
      } else {
        setSignupMessage('확인 메일을 보냈어요. 링크를 눌러 가입을 완료해 주세요.');
      }
    } catch (err) {
      setSignupError(err instanceof Error ? err.message : String(err));
    } finally {
      setSignupLoading(false);
    }
  };

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoginError('');
    setLoginMessage('');
    setLoginLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: loginEmail,
        password: loginPassword,
      });
      if (error) {
        setLoginError(error.message);
      } else {
        setLoginMessage('로그인 성공!');
      }
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoginLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="bg" aria-hidden="true" />
      <div className={`auth-container ${panel === 'signup' ? 'right-panel-active' : ''}`}>
        <div className="form-container sign-up-container">
          <form id="signup-form" autoComplete="off" onSubmit={handleSignup}>
            <h1>회원가입</h1>
            <p>아이디와 비밀번호를 만들어 시작하세요.</p>

            <div className="form-group">
              <input
                type="email"
                className="form-input"
                placeholder="이메일"
                value={signupEmail}
                onChange={(e) => setSignupEmail(e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <input
                type="password"
                className="form-input"
                placeholder="비밀번호"
                minLength={6}
                value={signupPassword}
                onChange={(e) => setSignupPassword(e.target.value)}
                aria-describedby="signup-password-hint"
                required
              />
              <div
                id="signup-password-hint"
                className={`input-hint ${isSignupPasswordShort ? 'error' : ''}`}
              >
                비밀번호는 최소 6자 이상 입력해야 합니다.
              </div>
            </div>
            <div className="form-group">
              <input
                type="password"
                className="form-input"
                placeholder="비밀번호 확인"
                minLength={6}
                value={signupPasswordConfirm}
                onChange={(e) => setSignupPasswordConfirm(e.target.value)}
                required
              />
              
            </div>

            <button type="submit" className="submit-btn primary" disabled={signupLoading}>
              {signupLoading ? '처리 중...' : '회원가입'}
            </button>
            <div
              id="signup-error"
              className={`feedback-text ${signupError ? 'error-text' : signupMessage ? 'success-text' : ''}`}
              role="status"
              aria-live="polite"
            >
              {signupError || signupMessage}
            </div>
          </form>
        </div>

        <div className="form-container sign-in-container">
          <form id="login-form" autoComplete="off" onSubmit={handleLogin}>
            <h1>로그인</h1>
            <p>아이디와 비밀번호를 입력해 로그인하세요.</p>

            <div className="form-group">
              <input
                type="email"
                className="form-input"
                placeholder="이메일"
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <input
                type="password"
                className="form-input"
                placeholder="비밀번호"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                required
              />
            </div>

            <a href="#" className="forgot-password" onClick={(e) => e.preventDefault()}>
              비밀번호를 잊어버렸나요?
            </a>
            <button type="submit" className="submit-btn primary" disabled={loginLoading}>
              {loginLoading ? '처리 중...' : '로그인'}
            </button>
            <div
              id="login-error"
              className={`feedback-text ${loginError ? 'error-text' : loginMessage ? 'success-text' : ''}`}
              role="status"
              aria-live="polite"
            >
              {loginError || loginMessage}
            </div>
          </form>
        </div>

        <div className="overlay-container" aria-hidden="true">
          <div className="overlay">
            <div className="overlay-panel overlay-left">
              <h1>다시 오셨네요!</h1>
              <p>기존 계정으로 로그인해서 계속 사용하세요.</p>
              <button type="button" className="ghost-btn" onClick={() => setPanel('login')}>
                로그인
              </button>
            </div>

            <div className="overlay-panel overlay-right">
              <h1>처음이신가요?</h1>
              <p>계정을 만들고 가계부를 바로 시작해보세요.</p>
              <button type="button" className="ghost-btn" onClick={() => setPanel('signup')}>
                회원가입
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
