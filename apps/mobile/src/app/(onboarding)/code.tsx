import { useEffect, useState } from 'react'
import { KeyboardAvoidingView, Platform, ScrollView, TextInput, View } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useQueryClient } from '@tanstack/react-query'
import type { AuthTokens, MeDto } from '@cepca/shared'
import { api, errorMessage } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { qk } from '@/lib/queries'
import { OnboardingHeader } from '@/components/OnboardingHeader'
import { Btn } from '@/components/ui'
import { Txt } from '@/components/Txt'
import { color, family } from '@/theme'

const RESEND_AFTER = 30 // délai imposé par l'API entre deux codes

/** Étape 2 : code à 4 chiffres reçu par e-mail. Crée le compte à la première vérification. */
export default function CodeStep() {
  const { email = '', name = '', phone = '', mode } = useLocalSearchParams<{ email: string; name?: string; phone?: string; mode?: string }>()
  const insets = useSafeAreaInsets()
  const { signIn } = useAuth()
  const qc = useQueryClient()
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [wait, setWait] = useState(RESEND_AFTER)
  const [resent, setResent] = useState(false)

  useEffect(() => {
    if (wait <= 0) return
    const t = setTimeout(() => setWait((w) => w - 1), 1000)
    return () => clearTimeout(t)
  }, [wait])

  async function verify() {
    if (code.length !== 4) return
    setBusy(true)
    setError(null)
    try {
      const t = await api<AuthTokens & { created: boolean }>('/auth/otp/verify', { method: 'POST', auth: false, body: { email, code, ...(name ? { fullName: name } : {}), ...(phone ? { phone } : {}) } })
      await signIn(t)
      const me = await api<MeDto>('/me')
      qc.setQueryData(qk.me, me)
      // Pas encore d'Église : étape 3 ; sinon directement l'accueil
      router.replace(me.membership ? '/home' : '/church')
    } catch (e) {
      setError(errorMessage(e))
      setCode('')
    } finally {
      setBusy(false)
    }
  }

  async function resend() {
    setError(null)
    try {
      await api('/auth/otp/request', { method: 'POST', auth: false, body: { email, purpose: mode === 'login' ? 'LOGIN' : 'SIGNUP' } })
      setResent(true)
      setWait(RESEND_AFTER)
    } catch (e) {
      setError(errorMessage(e))
    }
  }

  const mm = `${Math.floor(wait / 60)}:${String(wait % 60).padStart(2, '0')}`
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: color.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <OnboardingHeader step={2} />
      <ScrollView contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 20, paddingTop: 24, paddingBottom: insets.bottom + 28, gap: 20 }} keyboardShouldPersistTaps="handled">
        <View>
          <Txt serif size={34} lh={1.05} accessibilityRole="header">
            Code de vérification
          </Txt>
          <Txt size={14} lh={1.5} color={color.textMuted} style={{ marginTop: 8 }}>
            Saisissez le code à 4 chiffres envoyé à {email}. Pensez à regarder dans les courriers indésirables.
          </Txt>
        </View>
        <TextInput
          value={code}
          onChangeText={(v) => {
            const next = v.replace(/\D/g, '').slice(0, 4)
            setCode(next)
            if (error) setError(null)
          }}
          keyboardType="number-pad"
          autoComplete="one-time-code"
          textContentType="oneTimeCode"
          maxLength={4}
          autoFocus
          placeholder="••••"
          placeholderTextColor={color.textFaint}
          accessibilityLabel="Code de vérification"
          style={{
            height: 72,
            borderRadius: 18,
            backgroundColor: color.surface,
            borderWidth: 1.5,
            borderColor: error ? color.errorFg : color.primary,
            textAlign: 'center',
            fontSize: 32,
            fontFamily: family[700],
            letterSpacing: 16,
            color: color.text,
          }}
        />
        {error ? (
          <Txt size={13} weight={600} color={color.errorFg} accessibilityLiveRegion="polite">
            {error}
          </Txt>
        ) : null}
        <Txt size={13} color={color.textMuted}>
          {resent && wait > 0 ? 'Nouveau code envoyé. ' : 'Vous n’avez rien reçu ? '}
          {wait > 0 ? (
            <Txt size={13} weight={700} color={color.textFaint}>
              Renvoyer le code ({mm})
            </Txt>
          ) : (
            <Txt size={13} weight={700} color={color.primary} onPress={resend} accessibilityRole="button">
              Renvoyer le code
            </Txt>
          )}
        </Txt>
        <View style={{ flex: 1 }} />
        <Btn label="Vérifier" onPress={verify} disabled={code.length !== 4} loading={busy} />
      </ScrollView>
    </KeyboardAvoidingView>
  )
}
