import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { KeyRound, LogIn, Network, AlertCircle } from 'lucide-react';
import * as api from '../api';
import { Button } from '../ui/Button';

export function LoginView({ onLogin }: { onLogin: () => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<'password' | 'passkey' | null>(null);
  const [passkeyCount, setPasskeyCount] = useState<number | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    api.getPasskeyStatus()
      .then(setPasskeyCount)
      .catch(() => setPasskeyCount(0));
  }, []);

  const hasPasskey = (passkeyCount ?? 0) > 0;
  // 未注册 Passkey 时直接展示密码表单，不用多点一次
  const passwordVisible = passkeyCount !== null && (!hasPasskey || showPassword);

  const handlePassword = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy('password');
    try {
      await api.login(password);
      onLogin();
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败');
    } finally {
      setBusy(null);
    }
  };

  const handlePasskey = async () => {
    setError('');
    setBusy('passkey');
    try {
      await api.loginWithPasskey();
      onLogin();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Passkey 验证失败');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="min-h-full flex items-center justify-center p-4 bg-canvas">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <div className="w-11 h-11 rounded-[10px] bg-accent-soft border border-accent/25
                          flex items-center justify-center mb-4">
            <Network size={20} className="text-accent" />
          </div>
          <h1 className="text-lg font-semibold text-fg">Mihomo Manager</h1>
          <p className="text-sm text-fg-muted mt-1">登录以管理订阅与配置</p>
        </div>

        <div className="card p-6">
          {passkeyCount === null ? (
            <div className="h-24 flex items-center justify-center text-sm text-fg-subtle">
              正在检查登录方式…
            </div>
          ) : (
            <div className="space-y-4">
              {hasPasskey && (
                <Button
                  variant="primary"
                  className="w-full"
                  onClick={handlePasskey}
                  loading={busy === 'passkey'}
                  disabled={busy !== null}
                  icon={<KeyRound size={15} />}
                >
                  使用 Passkey 登录
                </Button>
              )}

              {hasPasskey && !passwordVisible && (
                <button
                  onClick={() => setShowPassword(true)}
                  className="w-full text-sm text-fg-muted hover:text-fg transition-colors py-1"
                >
                  改用密码登录
                </button>
              )}

              {passwordVisible && (
                <form onSubmit={handlePassword} className="space-y-4">
                  {hasPasskey && (
                    <div className="flex items-center gap-3 pt-1">
                      <span className="flex-1 h-px bg-line" />
                      <span className="text-xs text-fg-subtle">或</span>
                      <span className="flex-1 h-px bg-line" />
                    </div>
                  )}
                  <div>
                    <label htmlFor="login-password"
                           className="block text-xs font-medium text-fg-muted mb-1.5">
                      管理密码
                    </label>
                    <input
                      id="login-password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="control"
                      placeholder="请输入密码"
                      autoFocus={!hasPasskey}
                      autoComplete="current-password"
                    />
                  </div>
                  <Button
                    type="submit"
                    variant={hasPasskey ? 'secondary' : 'primary'}
                    className="w-full"
                    loading={busy === 'password'}
                    disabled={busy !== null || !password}
                    icon={<LogIn size={15} />}
                  >
                    登录
                  </Button>
                </form>
              )}

              {error && (
                <div className="flex items-start gap-2 text-sm text-danger bg-danger-soft
                                border border-danger/25 rounded-[var(--radius-control)] px-3 py-2.5">
                  <AlertCircle size={15} className="shrink-0 mt-0.5" />
                  <span className="break-words">{error}</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
