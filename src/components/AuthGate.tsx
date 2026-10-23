import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { authApi, type AuthStage } from '../api/http'
import Icon from './Icon'

type GateState =
  | { kind: 'checking' }
  | { kind: 'error'; message: string }
  | { kind: 'login'; notice?: string }
  | { kind: 'invitation'; token: string }
  | { kind: AuthStage }

/**
 * Lien reçu par e-mail : /invitation#<jeton>. Le jeton est lu dans le fragment
 * (jamais envoyé au serveur par le navigateur) puis retiré de l'URL.
 */
let invitationToken: string | null | undefined
function takeInvitationToken(): string | null {
  // Mémorisé : React (StrictMode) peut appeler deux fois l'initialisation de l'état.
  if (invitationToken !== undefined) return invitationToken
  invitationToken = null
  if (window.location.pathname !== '/invitation') return null
  const token = window.location.hash.slice(1)
  window.history.replaceState(null, '', '/')
  if (/^[A-Za-z0-9_-]{20,100}$/.test(token)) invitationToken = token
  return invitationToken
}

/**
 * Porte d'authentification (version production) : connexion, changement du
 * mot de passe initial, enrôlement ou saisie du code TOTP. Le contenu n'est
 * affiché qu'une fois la session complète.
 */
export default function AuthGate({ children }: { children: (onSessionEnded: (reason?: 'logout') => void) => ReactNode }) {
  const [gate, setGate] = useState<GateState>(() => {
    const token = takeInvitationToken()
    return token ? { kind: 'invitation', token } : { kind: 'checking' }
  })

  const check = useCallback(async () => {
    const me = await authApi.me()
    if (!me.ok) return setGate({ kind: 'error', message: me.error })
    setGate(me.stage ? { kind: me.stage } : { kind: 'login' })
  }, [])

  useEffect(() => {
    // Vérification initiale uniquement : un lien d'invitation n'utilise pas la session existante.
    if (gate.kind === 'checking') void check()
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
        {gate.kind === 'invitation' && <InvitationForm token={gate.token} onDone={advance} onLogin={() => setGate({ kind: 'login' })} />}
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

/** Choix du mot de passe à partir d'un lien d'invitation ou de réinitialisation. */
function InvitationForm({ token, onDone, onLogin }: { token: string; onDone: (s: AuthStage) => void; onLogin: () => void }) {
  const [invite, setInvite] = useState<{ name: string; email: string; purpose: 'invite' | 'reset' } | null>(null)
  const [invalid, setInvalid] = useState<string | null>(null)
  const [pw, setPw] = useState('')
  const [confirm, setConfirm] = useState('')
  const [shown, setShown] = useState(false)
  const { busy, error, setError, submit } = useSubmit()

  useEffect(() => {
    void authApi.checkInvitation(token).then((res) => (res.ok ? setInvite(res) : setInvalid(res.error)))
  }, [token])

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (pw !== confirm) return setError('Les deux saisies ne correspondent pas.')
    void submit(async () => {
      const res = await authApi.acceptInvitation(token, pw)
      if (!res.ok) return setError(res.error)
      onDone(res.stage)
    })
  }

  if (invalid)
    return (
      <div>
        <h1 className="auth-title">Lien inutilisable</h1>
        <div className="banner banner--error" role="alert">
          {invalid}
        </div>
        <button type="button" className="btn btn--secondary auth-submit" onClick={onLogin}>
          Aller à la connexion
        </button>
      </div>
    )
  if (!invite) return <p className="muted small">Vérification du lien…</p>

  return (
    <form onSubmit={onSubmit}>
      <h1 className="auth-title">{invite.purpose === 'invite' ? 'Activez votre compte' : 'Choisissez un nouveau mot de passe'}</h1>
      <p className="small muted" style={{ marginBottom: 16 }}>
        Bonjour {invite.name}. Choisissez votre mot de passe (12 caractères minimum ; une phrase de passe est idéale), puis configurez la double
        authentification.
      </p>
      {error && (
        <div className="banner banner--error" role="alert">
          {error}
        </div>
      )}
      <div className="field">
        <label htmlFor="invite-email">Identifiant</label>
        <input id="invite-email" className="input" type="email" autoComplete="username" readOnly value={invite.email} />
      </div>
      <div className="field">
        <label htmlFor="invite-password">Mot de passe</label>
        <input
          id="invite-password"
          className="input"
          type={shown ? 'text' : 'password'}
          autoComplete="new-password"
          minLength={12}
          required
          value={pw}
          onChange={(e) => setPw(e.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor="invite-confirm">Confirmation</label>
        <input
          id="invite-confirm"
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
        {busy ? 'Enregistrement…' : 'Enregistrer et continuer'}
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
