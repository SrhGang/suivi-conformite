import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { authApi, type AuthStage } from '../api/http'
import Icon from './Icon'

type GateState = { kind: 'checking' } | { kind: 'error'; message: string } | { kind: 'login'; notice?: string } | { kind: AuthStage }

/**
 * Porte d'authentification (version production) : connexion, changement du
 * mot de passe initial, enrôlement ou saisie du code TOTP. Le contenu n'est
 * affiché qu'une fois la session complète.
 */
export default function AuthGate({ children }: { children: (onSessionEnded: (reason?: 'logout') => void) => ReactNode }) {
  const [gate, setGate] = useState<GateState>({ kind: 'checking' })

  const check = useCallback(async () => {
    const me = await authApi.me()
    if (!me.ok) return setGate({ kind: 'error', message: me.error })
    setGate(me.stage ? { kind: me.stage } : { kind: 'login' })
  }, [])

  useEffect(() => {
    void check()
  }, [check])

  const expired = useCallback(
    (reason?: 'logout') =>
      setGate(reason === 'logout' ? { kind: 'login', notice: 'Vous êtes déconnecté.' } : { kind: 'login', notice: 'Votre session a expiré. Reconnectez-vous.' }),
    [],
  )
  const advance = (stage: AuthStage) => setGate({ kind: stage })

  if (gate.kind === 'full') return <>{children(expired)}</>

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-brand">
          Conformité<span className="brand__dot">.</span>
        </div>
        <p className="auth-sub">Suivi ISO 27001:2022 · NIS2-ANSSI</p>
        {gate.kind === 'checking' && <p className="muted small">Vérification de la session…</p>}
        {gate.kind === 'error' && (
          <div className="banner banner--error" role="alert">
            <Icon name="alert" />
            <div>
              {gate.message}
              <div style={{ marginTop: 8 }}>
                <button className="btn btn--secondary btn--sm" onClick={() => void check()}>
                  Réessayer
                </button>
              </div>
            </div>
          </div>
        )}
        {gate.kind === 'login' && <LoginForm notice={gate.notice} onDone={advance} />}
        {gate.kind === 'password_change' && <PasswordForm onDone={advance} />}
        {gate.kind === 'totp_enroll' && <TotpEnroll onDone={advance} onRestart={() => setGate({ kind: 'login' })} />}
        {gate.kind === 'totp' && <TotpVerify onDone={advance} onRestart={() => setGate({ kind: 'login' })} />}
      </div>
    </div>
  )
}

function useSubmit() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const submit = async (fn: () => Promise<void>) => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await fn()
    } finally {
      setBusy(false)
    }
  }
  return { busy, error, setError, submit }
}

function LoginForm({ notice, onDone }: { notice?: string; onDone: (s: AuthStage) => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [shown, setShown] = useState(false)
  const { busy, error, setError, submit } = useSubmit()
  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    void submit(async () => {
      const res = await authApi.login(email.trim(), password)
      if (!res.ok) return setError(res.error)
      onDone(res.stage)
    })
  }
  return (
    <form onSubmit={onSubmit}>
      <h1 className="auth-title">Connexion</h1>
      {notice && <div className="banner banner--info">{notice}</div>}
      {error && (
        <div className="banner banner--error" role="alert">
          {error}
        </div>
      )}
      <div className="field">
        <label htmlFor="login-email">Adresse e-mail</label>
        <input id="login-email" className="input" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="login-password">Mot de passe</label>
        <input
          id="login-password"
          className="input"
          type={shown ? 'text' : 'password'}
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <label className="toggle small" style={{ marginTop: 6 }}>
          <input type="checkbox" checked={shown} onChange={(e) => setShown(e.target.checked)} /> Afficher le mot de passe
        </label>
      </div>
      <button className="btn btn--primary auth-submit" type="submit" disabled={busy}>
        {busy ? 'Connexion…' : 'Se connecter'}
      </button>
      <p className="tiny muted" style={{ marginTop: 16 }}>
        Mot de passe oublié ou compte verrouillé ? Demandez à un administrateur de réinitialiser votre accès.
      </p>
    </form>
  )
}

function PasswordForm({ onDone }: { onDone: (s: AuthStage) => void }) {
  const [pw, setPw] = useState('')
  const [confirm, setConfirm] = useState('')
  const [shown, setShown] = useState(false)
  const { busy, error, setError, submit } = useSubmit()
  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (pw !== confirm) return setError('Les deux saisies ne correspondent pas.')
    void submit(async () => {
      const res = await authApi.changePassword(pw)
      if (!res.ok) return setError(res.error)
      onDone(res.stage)
    })
  }
  return (
    <form onSubmit={onSubmit}>
      <h1 className="auth-title">Choisissez votre mot de passe</h1>
      <p className="small muted" style={{ marginBottom: 16 }}>
        Le mot de passe temporaire doit être remplacé. Utilisez au moins 12 caractères ; une phrase de passe est idéale.
      </p>
      {error && (
        <div className="banner banner--error" role="alert">
          {error}
        </div>
      )}
      <div className="field">
        <label htmlFor="new-password">Nouveau mot de passe</label>
        <input id="new-password" className="input" type={shown ? 'text' : 'password'} autoComplete="new-password" minLength={12} required value={pw} onChange={(e) => setPw(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="confirm-password">Confirmation</label>
        <input
          id="confirm-password"
          className="input"
          type={shown ? 'text' : 'password'}
          autoComplete="new-password"
          minLength={12}
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
        <label className="toggle small" style={{ marginTop: 6 }}>
          <input type="checkbox" checked={shown} onChange={(e) => setShown(e.target.checked)} /> Afficher les mots de passe
        </label>
      </div>
      <button className="btn btn--primary auth-submit" type="submit" disabled={busy}>
        {busy ? 'Enregistrement…' : 'Enregistrer'}
      </button>
    </form>
  )
}

function CodeField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="field">
      <label htmlFor="totp-code">Code à 6 chiffres</label>
      <input
        id="totp-code"
        className="input auth-code"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="\d{6}"
        maxLength={6}
        required
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, ''))}
      />
    </div>
  )
}

function TotpEnroll({ onDone, onRestart }: { onDone: (s: AuthStage) => void; onRestart: () => void }) {
  const [setup, setSetup] = useState<{ qr: string; secret: string } | null>(null)
  const [code, setCode] = useState('')
  const { busy, error, setError, submit } = useSubmit()

  useEffect(() => {
    void authApi.totpSetup().then((res) => (res.ok ? setSetup({ qr: res.qr, secret: res.secret }) : setError(res.error)))
  }, [setError])

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    void submit(async () => {
      const res = await authApi.totpEnroll(code)
      if (!res.ok) return setError(res.error)
      onDone(res.stage)
    })
  }
  return (
    <form onSubmit={onSubmit}>
      <h1 className="auth-title">Activez la double authentification</h1>
      <ol className="small auth-steps">
        <li>Ouvrez une application d’authentification (FreeOTP, Aegis, Microsoft ou Google Authenticator…).</li>
        <li>Scannez ce QR code, ou saisissez la clé manuellement.</li>
        <li>Saisissez le code à 6 chiffres affiché.</li>
      </ol>
      {error && (
        <div className="banner banner--error" role="alert">
          {error}
        </div>
      )}
      {setup ? (
        <div className="auth-qr">
          <img src={setup.qr} alt="QR code d’enrôlement TOTP" width={180} height={180} />
          <code className="mono tiny" aria-label="Clé secrète">
            {setup.secret.replace(/(.{4})/g, '$1 ').trim()}
          </code>
        </div>
      ) : (
        !error && <p className="muted small">Génération de la clé…</p>
      )}
      <CodeField value={code} onChange={setCode} />
      <button className="btn btn--primary auth-submit" type="submit" disabled={busy || !setup}>
        {busy ? 'Vérification…' : 'Activer et continuer'}
      </button>
      <button type="button" className="link-button small" style={{ marginTop: 12 }} onClick={onRestart}>
        Revenir à la connexion
      </button>
    </form>
  )
}

function TotpVerify({ onDone, onRestart }: { onDone: (s: AuthStage) => void; onRestart: () => void }) {
  const [code, setCode] = useState('')
  const { busy, error, setError, submit } = useSubmit()
  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    void submit(async () => {
      const res = await authApi.totpVerify(code)
      if (!res.ok) {
        setCode('')
        return setError(res.error)
      }
      onDone(res.stage)
    })
  }
  return (
    <form onSubmit={onSubmit}>
      <h1 className="auth-title">Double authentification</h1>
      <p className="small muted" style={{ marginBottom: 16 }}>
        Saisissez le code affiché par votre application d’authentification.
      </p>
      {error && (
        <div className="banner banner--error" role="alert">
          {error}
        </div>
      )}
      <CodeField value={code} onChange={setCode} />
      <button className="btn btn--primary auth-submit" type="submit" disabled={busy || code.length !== 6}>
        {busy ? 'Vérification…' : 'Valider'}
      </button>
      <button type="button" className="link-button small" style={{ marginTop: 12 }} onClick={onRestart}>
        Revenir à la connexion
      </button>
    </form>
  )
}
