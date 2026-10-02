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
  const [isFocused, setIsFocused] = useState<boolean>(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Automatically focus on mount
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

    try {
      const result = await login(password);
      setIsLoading(false);

      if (result.success) {
        onSuccess();
      } else {
        setError(result.error || 'Invalid passkey.');
        if (result.remainingSec && result.remainingSec > 0) {
          setLockCountdown(result.remainingSec);
        }
        // Clear password on error and refocus
        setPassword('');
        inputRef.current?.focus();
      }
    } catch {
      setIsLoading(false);
      setError('Connection error. Please try again.');
      setPassword('');
      inputRef.current?.focus();
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Clean input: remove whitespace
    const val = e.target.value.replace(/\s+/g, '');
    if (val.length <= PASSKEY_LENGTH) {
      setPassword(val);
      if (error) setError(null);
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\s+/g, '');
    const clean = pasted.slice(0, PASSKEY_LENGTH);
    if (clean) {
      setPassword(clean);
      if (error) setError(null);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (password.length === PASSKEY_LENGTH && !isLoading && lockCountdown > 0) return;
      if (password.length === PASSKEY_LENGTH && !isLoading) {
        handleSubmit();
      }
    }
  };

  const isComplete = password.length === PASSKEY_LENGTH;
  const isButtonDisabled = !isComplete || isLoading || lockCountdown > 0;

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-4 relative overflow-hidden select-none">
      {/* Background ambient lighting */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_var(--tw-gradient-stops))] from-amber-500/10 via-transparent to-transparent pointer-events-none" />

      <div className="w-full max-w-md relative z-10">
        {/* Header Branding */}
        <div className="text-center mb-7">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-zinc-900 border border-zinc-800 text-amber-500 shadow-xl shadow-amber-500/5 mb-3.5">
            <Shield className="w-7 h-7" strokeWidth={1.75} />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-100 font-sans">
            AEGIS VAULT
          </h1>
          <p className="text-xs text-zinc-400 mt-1.5 font-mono tracking-widest uppercase">
            CONFIDENTIAL SECURE WORKSPACE
          </p>
        </div>

        {/* Vault Key Card */}
        <div className="bg-zinc-900/90 border border-zinc-800 rounded-2xl p-5 sm:p-7 backdrop-blur-xl shadow-2xl shadow-black/80">
          {/* Card Subheader: Label & Reveal Toggle */}
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-mono font-semibold text-zinc-300 flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-amber-400" />
              {PASSKEY_LENGTH}-CHARACTER PASSKEY
            </span>
            <button
              type="button"
              onClick={() => {
                setShowPassword(!showPassword);
                inputRef.current?.focus();
              }}
              className="text-xs font-mono font-medium text-zinc-400 hover:text-amber-400 transition-colors flex items-center gap-1.5 cursor-pointer focus:outline-none focus-visible:text-amber-400"
              aria-label={showPassword ? 'Hide passcode' : 'Reveal passcode'}
            >
              {showPassword ? (
                <>
                  <EyeOff className="w-3.5 h-3.5 text-amber-400" />
                  <span>Hide</span>
                </>
              ) : (
                <>
                  <Eye className="w-3.5 h-3.5 text-zinc-400" />
                  <span>Reveal</span>
                </>
              )}
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Unified Input Container: Single logical input backing 8 visual slots */}
            <div
              className="relative cursor-text"
              onClick={() => inputRef.current?.focus()}
            >
              {/* Invisible native input for keyboard, touch, paste, and assistive tech */}
              <input
                ref={inputRef}
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={PASSKEY_LENGTH}
                value={password}
                onChange={handleChange}
                onPaste={handlePaste}
                onKeyDown={handleKeyDown}
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
                disabled={isLoading || lockCountdown > 0}
                className="opacity-0 absolute inset-0 w-full h-full cursor-text z-20"
                autoComplete="off"
                aria-label="8-character security passkey"
                autoFocus
              />

              {/* Visual 8-slot PIN interface */}
              <div className="grid grid-cols-8 gap-1 sm:gap-2">
                {Array.from({ length: PASSKEY_LENGTH }).map((_, index) => {
                  const char = password[index] || '';
                  const isCurrent = password.length === index && lockCountdown === 0 && isFocused;
                  const isFilled = index < password.length;

                  let slotClasses = 'border-zinc-800 bg-zinc-950/70 text-zinc-500';

                  if (error) {
                    slotClasses = 'border-red-500/80 bg-red-950/30 text-red-300';
                  } else if (isCurrent) {
                    slotClasses = 'border-amber-500 bg-amber-500/10 text-amber-400 ring-1 ring-amber-500/50 shadow-[0_0_12px_rgba(245,158,11,0.25)]';
                  } else if (isFilled) {
                    slotClasses = 'border-zinc-700 bg-zinc-800/90 text-zinc-100';
                  }

                  return (
                    <div
                      key={index}
                      className={`h-11 sm:h-13 rounded-xl flex items-center justify-center font-mono text-base sm:text-lg font-bold transition-all duration-150 border ${slotClasses}`}
                    >
                      {char ? (
                        showPassword ? (
                          <span className="text-zinc-100">{char}</span>
                        ) : (
                          <span className="w-2.5 h-2.5 rounded-full bg-amber-400 shadow-[0_0_6px_rgba(245,158,11,0.4)] inline-block" />
                        )
                      ) : isCurrent ? (
                        <span className="w-0.5 h-4 sm:h-5 bg-amber-400 animate-pulse rounded-full" />
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Error & Lockout Banner */}
            {lockCountdown > 0 ? (
              <div className="flex items-center gap-2 text-xs font-mono text-amber-400 bg-amber-500/10 border border-amber-500/25 rounded-xl p-3">
                <Clock className="w-4 h-4 shrink-0 animate-spin" />
                <span>
                  Vault temporarily locked. Retry in{' '}
                  <strong className="font-bold tabular-nums">{lockCountdown}s</strong>.
                </span>
              </div>
            ) : error ? (
              <div className="flex items-center justify-center gap-2 text-xs font-mono text-red-400 bg-red-950/40 border border-red-500/30 rounded-xl p-2.5 animate-in fade-in duration-200">
                <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
                <span>{error}</span>
              </div>
            ) : (
              <p className="text-[11px] text-zinc-400 text-center font-mono tracking-wide">
                Single-administrator access. All operations audit-logged.
              </p>
            )}

            {/* Submit Button with High Contrast & Clear State Transitions */}
            <button
              type="submit"
              disabled={isButtonDisabled}
              className={`w-full py-3 px-4 rounded-xl text-xs font-bold font-mono tracking-widest uppercase transition-all duration-150 flex items-center justify-center gap-2 select-none ${
                isComplete && !isLoading && lockCountdown === 0
                  ? 'bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-zinc-950 border border-amber-400/80 shadow-[0_0_20px_rgba(245,158,11,0.3)] cursor-pointer active:scale-[0.98]'
                  : 'bg-zinc-800/90 text-zinc-300 border border-zinc-700/80 cursor-not-allowed opacity-80'
              }`}
            >
              {isLoading ? (
                <>
                  <span className="w-4 h-4 border-2 border-zinc-950 border-t-transparent rounded-full animate-spin" />
                  <span>AUTHENTICATING...</span>
                </>
              ) : (
                <span>ENTER VAULT</span>
              )}
            </button>
          </form>
        </div>

        {/* Security Watermark Footer */}
        <div className="text-center mt-6 text-zinc-400 text-[11px] font-mono tracking-wider">
          SHA-256 · HTTP-ONLY SESSION · ZERO EXTERNAL STORAGE LEAKS
        </div>
      </div>
    </div>
  );
};
