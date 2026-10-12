import { useState } from 'react'
import { KeyboardAvoidingView, Platform, ScrollView, TextInput, View } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { COUNTRY_CODES, toE164 } from '@cepca/shared'
import { api, ApiError, errorMessage } from '@/lib/api'
import { OnboardingHeader } from '@/components/OnboardingHeader'
import { Btn, Chip, ChipRow, fieldStyle } from '@/components/ui'
import { Txt } from '@/components/Txt'
import { color, extra, family } from '@/theme'

const COUNTRIES: Record<(typeof COUNTRY_CODES)[number], string> = { '+237': 'Cameroun', '+33': 'France', '+1': 'Canada' }

/**
 * Étape 1 : nom, e-mail et téléphone (création), ou e-mail seul (connexion).
 * Le code part par e-mail ; le téléphone sert au paiement Mobile Money.
 */
export default function AccountStep() {
  const { mode } = useLocalSearchParams<{ mode?: string }>()
  const login = mode === 'login'
  const insets = useSafeAreaInsets()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [cc, setCc] = useState<(typeof COUNTRY_CODES)[number]>('+237')
  const [phone, setPhone] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const mail = email.trim().toLowerCase()
  const e164 = toE164(cc, phone)
  const valid = /^\S+@\S+\.\S+$/.test(mail) && (login || (name.trim().length >= 2 && !!e164))

  async function send() {
    if (!valid) return
    setBusy(true)
    setError(null)
    const next = { pathname: '/code' as const, params: { email: mail, name: login ? '' : name.trim(), phone: login ? '' : (e164 ?? ''), mode: login ? 'login' : 'signup' } }
    try {
      await api('/auth/otp/request', { method: 'POST', auth: false, body: { email: mail, purpose: login ? 'LOGIN' : 'SIGNUP' } })
      router.push(next)
    } catch (e) {
      // Code déjà envoyé il y a moins de 30 s : on passe quand même à la saisie
      if (e instanceof ApiError && e.code === 'OTP_COOLDOWN') router.push(next)
      else setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: color.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <OnboardingHeader step={1} />
      <ScrollView contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 20, paddingTop: 24, paddingBottom: insets.bottom + 28, gap: 18 }} keyboardShouldPersistTaps="handled">
        <View>
          <Txt serif size={34} lh={1.05} accessibilityRole="header">
            {login ? 'Me connecter' : 'Créer mon compte'}
          </Txt>
          <Txt size={14} lh={1.5} color={color.textMuted} style={{ marginTop: 8 }}>
            Un code vous sera envoyé par e-mail pour vérifier votre adresse.
          </Txt>
        </View>

        {login ? null : (
          <View style={{ gap: 8 }}>
            <Txt size={13} weight={700} nativeID="name-label">
              Nom complet
            </Txt>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Ex. Élise Moukoko"
              placeholderTextColor={color.textFaint}
              autoComplete="name"
              textContentType="name"
              autoCapitalize="words"
              accessibilityLabelledBy="name-label"
              style={[fieldStyle, { fontFamily: family[500] }]}
            />
          </View>
        )}

        <View style={{ gap: 8 }}>
          <Txt size={13} weight={700} nativeID="email-label">
            Adresse e-mail
          </Txt>
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="vous@exemple.com"
            placeholderTextColor={color.textFaint}
            keyboardType="email-address"
            autoComplete="email"
            textContentType="emailAddress"
            autoCapitalize="none"
            autoCorrect={false}
            accessibilityLabelledBy="email-label"
            style={[fieldStyle, { fontFamily: family[500] }]}
          />
        </View>

        {login ? null : (
          <>
            <View style={{ gap: 8 }}>
              <Txt size={13} weight={700}>
                Pays
              </Txt>
              <ChipRow>
                {COUNTRY_CODES.map((c) => (
                  <Chip key={c} label={`${COUNTRIES[c]} ${c}`} active={cc === c} onPress={() => setCc(c)} height={38} />
                ))}
              </ChipRow>
            </View>

            <View style={{ gap: 8 }}>
              <Txt size={13} weight={700} nativeID="phone-label">
                Numéro de téléphone
              </Txt>
              <View style={{ flexDirection: 'row', height: 52, borderRadius: 14, backgroundColor: color.surface, borderWidth: 1, borderColor: extra.fieldBorder, overflow: 'hidden' }}>
                <View style={{ paddingHorizontal: 14, justifyContent: 'center', borderRightWidth: 1, borderRightColor: extra.fieldBorder }}>
                  <Txt size={15} weight={600}>
                    {cc}
                  </Txt>
                </View>
                <TextInput
                  value={phone}
                  onChangeText={setPhone}
                  keyboardType="phone-pad"
                  autoComplete="tel"
                  textContentType="telephoneNumber"
                  placeholder="6 77 12 34 42"
                  placeholderTextColor={color.textFaint}
                  accessibilityLabelledBy="phone-label"
                  style={{ flex: 1, minWidth: 0, paddingHorizontal: 14, fontSize: 15, fontFamily: family[500], color: color.text }}
                />
              </View>
              <Txt size={12} color={color.textMuted} lh={1.5}>
                Utilisé pour vos dons par MTN MoMo ou Orange Money.
              </Txt>
            </View>
          </>
        )}

        {error ? (
          <Txt size={13} weight={600} color={color.errorFg} accessibilityLiveRegion="polite">
            {error}
          </Txt>
        ) : null}
        {login ? null : (
          <Txt size={12} color={color.textMuted} lh={1.5}>
            Vous avez déjà un compte ?{' '}
            <Txt size={12} weight={700} color={color.primary} onPress={() => router.setParams({ mode: 'login' })} accessibilityRole="link">
              Me connecter
            </Txt>
          </Txt>
        )}

        <View style={{ flex: 1 }} />
        <Btn label="Recevoir le code" onPress={send} disabled={!valid} loading={busy} />
      </ScrollView>
    </KeyboardAvoidingView>
  )
}
