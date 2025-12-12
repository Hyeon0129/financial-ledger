import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export default function AuthTest() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  // Supabase 연결 테스트
  useEffect(() => {
    const testConnection = async () => {
      try {
        const { data, error } = await supabase.auth.getSession()
        if (error) {
          console.error('Supabase 연결 에러:', error)
          setError(`연결 에러: ${error.message}`)
        } else {
          console.log('Supabase 연결 성공:', data)
          setMessage('Supabase 연결 성공 ✅')
        }
      } catch (err) {
        console.error('예외 발생:', err)
        setError(`예외: ${err}`)
      }
    }
    testConnection()
  }, [])

  const signUp = async () => {
    setLoading(true)
    setError('')
    setMessage('')
    
    try {
      console.log('회원가입 시도:', email)
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
      })
      
      console.log('회원가입 응답:', { data, error })
      
      if (error) {
        setError(`회원가입 실패: ${error.message}`)
      } else {
        setMessage('회원가입 성공! 이메일을 확인해주세요.')
      }
    } catch (err) {
      console.error('회원가입 예외:', err)
      setError(`예외 발생: ${err}`)
    } finally {
      setLoading(false)
    }
  }

  const signIn = async () => {
    setLoading(true)
    setError('')
    setMessage('')
    
    try {
      console.log('로그인 시도:', email)
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })
      
      console.log('로그인 응답:', { data, error })
      
      if (error) {
        setError(`로그인 실패: ${error.message}`)
      } else {
        setMessage('로그인 성공! ✅')
      }
    } catch (err) {
      console.error('로그인 예외:', err)
      setError(`예외 발생: ${err}`)
    } finally {
      setLoading(false)
    }
  }

  const signOut = async () => {
    try {
      await supabase.auth.signOut()
      setMessage('로그아웃 완료')
      setEmail('')
      setPassword('')
    } catch (err) {
      setError(`로그아웃 실패: ${err}`)
    }
  }

  return (
    <div style={{ 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'center', 
      minHeight: '100vh',
      background: '#0a0a0a',
      color: '#fff'
    }}>
      <div style={{ 
        padding: 40, 
        maxWidth: 400, 
        width: '100%',
        background: 'rgba(30, 30, 35, 0.98)',
        borderRadius: 16,
        border: '1px solid rgba(255, 255, 255, 0.08)'
      }}>
        <h2 style={{ marginBottom: 8, fontSize: 24 }}>Supabase Auth Test</h2>
        <p style={{ marginBottom: 24, color: 'rgba(255, 255, 255, 0.6)', fontSize: 14 }}>
          로그인/회원가입 테스트
        </p>

        {message && (
          <div style={{ 
            padding: 12, 
            marginBottom: 16, 
            background: 'rgba(34, 197, 94, 0.1)',
            border: '1px solid rgba(34, 197, 94, 0.3)',
            borderRadius: 8,
            color: '#22c55e',
            fontSize: 14
          }}>
            {message}
          </div>
        )}

        {error && (
          <div style={{ 
            padding: 12, 
            marginBottom: 16, 
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: 8,
            color: '#ef4444',
            fontSize: 14
          }}>
            {error}
          </div>
        )}

        <input
          type="email"
          placeholder="이메일"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{ 
            width: '100%', 
            marginBottom: 12,
            padding: 12,
            background: 'rgba(255, 255, 255, 0.05)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: 8,
            color: '#fff',
            fontSize: 15
          }}
        />

        <input
          type="password"
          placeholder="비밀번호 (최소 6자)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={{ 
            width: '100%', 
            marginBottom: 16,
            padding: 12,
            background: 'rgba(255, 255, 255, 0.05)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: 8,
            color: '#fff',
            fontSize: 15
          }}
        />

        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <button 
            onClick={signUp} 
            disabled={loading}
            style={{
              flex: 1,
              padding: 12,
              background: 'rgba(34, 197, 94, 0.1)',
              border: '1px solid rgba(34, 197, 94, 0.3)',
              borderRadius: 8,
              color: '#22c55e',
              cursor: loading ? 'not-allowed' : 'pointer',
              fontSize: 15,
              fontWeight: 500
            }}
          >
            {loading ? '처리중...' : '회원가입'}
          </button>

          <button 
            onClick={signIn} 
            disabled={loading}
            style={{
              flex: 1,
              padding: 12,
              background: 'rgba(59, 130, 246, 0.1)',
              border: '1px solid rgba(59, 130, 246, 0.3)',
              borderRadius: 8,
              color: '#3b82f6',
              cursor: loading ? 'not-allowed' : 'pointer',
              fontSize: 15,
              fontWeight: 500
            }}
          >
            {loading ? '처리중...' : '로그인'}
          </button>
        </div>

        <button 
          onClick={signOut}
          style={{
            width: '100%',
            padding: 12,
            background: 'rgba(148, 163, 184, 0.1)',
            border: '1px solid rgba(148, 163, 184, 0.2)',
            borderRadius: 8,
            color: '#94a3b8',
            cursor: 'pointer',
            fontSize: 15,
            fontWeight: 500
          }}
        >
          로그아웃
        </button>

        <div style={{ 
          marginTop: 24, 
          padding: 12, 
          background: 'rgba(255, 255, 255, 0.03)',
          borderRadius: 8,
          fontSize: 12,
          color: 'rgba(255, 255, 255, 0.4)'
        }}>
          💡 개발자 콘솔(F12)에서 자세한 로그를 확인하세요
        </div>
      </div>
    </div>
  )
}