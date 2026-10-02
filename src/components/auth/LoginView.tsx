import React, { useState, useEffect, useRef } from 'react';
import { Shield, Lock, Eye, EyeOff, AlertCircle, Clock } from 'lucide-react';
import { login } from '../../lib/api';

interface LoginViewProps {
  onSuccess: () => void;
}

const PASSKEY_LENGTH = 8;

export const LoginView: React.FC<LoginViewProps> = ({ onSuccess }) => {
  const [password, setPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [lockCountdown, setLockCountdown] = useState<number>(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Cooldown countdown timer
  useEffect(() => {
    if (lockCountdown <= 0) return;
    const interval = setInterval(() => {
      setLockCountdown((prev) => {
        if (prev <= 1) {
          setError(null);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [lockCountdown]);

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (password.length !== PASSKEY_LENGTH || isLoading || lockCountdown > 0) return;

    setIsLoading(true);
    setError(null);

    const result = await login(password);
    setIsLoading(false);

    if (result.success) {
      onSuccess();
    } else {
      setError(result.error || 'Invalid password.');
      if (result.remainingSec && result.remainingSec > 0) {
        setLockCountdown(result.remainingSec);
      }
      // Clear password on error
      setPassword('');
      inputRef.current?.focus();
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/\s+/g, '');
    if (val.length <= PASSKEY_LENGTH) {
      setPassword(val);
      setError(null);
      if (val.length === PASSKEY_LENGTH) {
        // Auto-submit on completion
        setTimeout(() => {
          login(val).then((res) => {
            if (res.success) {
              onSuccess();
            } else {
              setError(res.error || 'Invalid password.');
              if (res.remainingSec && res.remainingSec > 0) {
                setLockCountdown(res.remainingSec);
              }
              setPassword('');
              inputRef.current?.focus();
            }
          });
        }, 120);
      }
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-4 relative overflow-hidden select-none">
      {/* Background ambient texture */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_var(--tw-gradient-stops))] from-amber-500/5 via-transparent to-transparent pointer-events-none" />
      
      <div className="w-full max-w-lg relative z-10">
        {/* Header Branding */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-zinc-900 border border-zinc-800 text-amber-500 shadow-xl mb-4">
            <Shield className="w-7 h-7" strokeWidth={1.75} />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-100 font-sans">
            AEGIS VAULT
          </h1>
          <p className="text-xs text-zinc-500 mt-1 font-mono tracking-wide">
            CONFIDENTIAL SECURE WORKSPACE
          </p>
        </div>

        {/* Vault Key Card */}
        <div className="bg-zinc-900/80 border border-zinc-800/80 rounded-2xl p-6 sm:p-8 backdrop-blur-xl shadow-2xl">
          <div className="flex items-center justify-between mb-5">
            <span className="text-xs font-mono text-zinc-400 flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-amber-500/80" />
              {PASSKEY_LENGTH}-CHARACTER PASSKEY
            </span>
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors flex items-center gap-1 cursor-pointer focus:outline-none focus-visible:text-amber-400"
            >
              {showPassword ? (
                <>
                  <EyeOff className="w-3.5 h-3.5" /> Hide
                </>
              ) : (
                <>
                  <Eye className="w-3.5 h-3.5" /> Reveal
                </>
              )}
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Hidden native input for mobile & typing ergonomics */}
            <div className="relative">
              <input
                ref={inputRef}
                type={showPassword ? 'text' : 'password'}
                maxLength={PASSKEY_LENGTH}
                value={password}
                onChange={handleChange}
                disabled={isLoading || lockCountdown > 0}
                className="opacity-0 absolute inset-0 w-full h-full cursor-pointer z-20"
                autoComplete="off"
                autoFocus
              />

              {/* Visual 8-slot PIN interface */}
              <div className="grid grid-cols-8 gap-1.5 sm:gap-2 py-1">
                {Array.from({ length: PASSKEY_LENGTH }).map((_, index) => {
                  const char = password[index] || '';
                  const isCurrent = password.length === index && lockCountdown === 0;
                  const isFilled = index < password.length;

                  return (
                    <div
                      key={index}
                      className={`h-12 sm:h-14 rounded-xl flex items-center justify-center font-mono text-lg sm:text-xl font-bold transition-all duration-150 border ${
                        error
                          ? 'border-red-500/60 bg-red-950/20 text-red-300'
                          : isCurrent
                          ? 'border-amber-500 bg-amber-500/10 text-amber-300 shadow-[0_0_15px_rgba(245,158,11,0.2)]'
                          : isFilled
                          ? 'border-zinc-700 bg-zinc-800 text-zinc-100'
                          : 'border-zinc-800/80 bg-zinc-950/50 text-zinc-600'
                      }`}
                    >
                      {char ? (
                        showPassword ? (
                          char
                        ) : (
                          <span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block" />
                        )
                      ) : isCurrent ? (
                        <span className="w-0.5 h-5 bg-amber-400 animate-pulse" />
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Error & Lockout Banner */}
            {lockCountdown > 0 ? (
              <div className="flex items-center gap-2 text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg p-3">
                <Clock className="w-4 h-4 shrink-0 animate-spin" />
                <span>
                  Vault temporarily locked due to repeated attempts. Retry in{' '}
                  <strong className="font-mono tabular-nums">{lockCountdown}s</strong>.
                </span>
              </div>
            ) : error ? (
              <div className="flex items-center gap-2 text-xs text-red-400 bg-red-950/30 border border-red-500/20 rounded-lg p-3">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{typeof error === 'string' ? error : 'Authentication failed'}</span>
              </div>
            ) : (
              <p className="text-[11px] text-zinc-500 text-center font-mono">
                Isolated single-administrator access. No public registration.
              </p>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={password.length !== PASSKEY_LENGTH || isLoading || lockCountdown > 0}
              className={`w-full py-3 px-4 rounded-xl text-xs font-semibold tracking-wider font-mono uppercase transition-all duration-200 cursor-pointer flex items-center justify-center gap-2 ${
                password.length === PASSKEY_LENGTH && !isLoading && lockCountdown === 0
                  ? 'bg-amber-500 hover:bg-amber-400 text-zinc-950 shadow-lg shadow-amber-500/20 active:scale-[0.99]'
                  : 'bg-zinc-800/80 text-zinc-500 cursor-not-allowed border border-zinc-800'
              }`}
            >
              {isLoading ? (
                <>
                  <span className="w-4 h-4 border-2 border-zinc-950 border-t-transparent rounded-full animate-spin" />
                  AUTHENTICATING...
                </>
              ) : (
                'ENTER VAULT'
              )}
            </button>
          </form>
        </div>

        {/* Security watermark footer */}
        <div className="text-center mt-6 text-zinc-600 text-[11px] font-mono tracking-tight">
          SHA-256 · HTTP-ONLY SESSION · ZERO EXTERNAL STORAGE LEAKS
        </div>
      </div>
    </div>
  );
};
