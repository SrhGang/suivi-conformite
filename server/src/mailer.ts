/** Envoi d'e-mails par un relais SMTP (TLS obligatoire). */
import nodemailer from 'nodemailer'
import type { SmtpConfig } from './config'

export interface MailMessage {
  to: string
  subject: string
  text: string
  html: string
}

export interface Mailer {
  send(message: MailMessage): Promise<void>
}

export function createSmtpMailer(smtp: SmtpConfig): Mailer {
  const secure = smtp.port === 465
  const transport = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    // Port 465 : TLS implicite ; sinon STARTTLS exigé, jamais d'envoi en clair.
    secure,
    requireTLS: !secure,
    tls: { minVersion: 'TLSv1.2' },
    ...(smtp.user ? { auth: { user: smtp.user, pass: smtp.password } } : {}),
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,
  })
  return {
    async send(m) {
      await transport.sendMail({ from: smtp.from, to: m.to, subject: m.subject, text: m.text, html: m.html })
    },
  }
}
