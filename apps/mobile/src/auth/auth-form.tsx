import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import {
  displayNameSchema,
  emailSchema,
  passwordSchema,
} from '@chatapp/contracts';
import { TextField } from '../components/fields';
import {
  AppButton,
  AppHeader,
  AppScreen,
  AppText,
  IconButton,
} from '../components/primitives';
import { space } from '../design/tokens';
import { useSession } from './session-provider';
import { httpStatus } from './session-manager';

export function AuthForm({ mode }: { mode: 'register' | 'login' }) {
  const creating = mode === 'register';
  const { manager, state } = useSession();
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [visible, setVisible] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [failure, setFailure] = useState('');
  const submitting = useRef(false);
  const busy = state.phase === 'authenticating';
  const emailCheck = emailSchema.safeParse(email);
  const nameCheck = displayNameSchema.safeParse(displayName);
  const passwordCheck = passwordSchema.safeParse(password);
  const issue = (invalid: boolean, description: string) =>
    attempted && invalid ? { error: description } : {};

  async function submit() {
    if (submitting.current) return;
    setAttempted(true);
    setFailure('');
    if (!emailCheck.success || !passwordCheck.success) return;
    if (creating && (!nameCheck.success || password !== confirmation)) return;
    submitting.current = true;
    try {
      const credentials = { email: emailCheck.data, password };
      if (creating && nameCheck.success)
        await manager.register({ ...credentials, displayName: nameCheck.data });
      else await manager.signIn(credentials);
    } catch (error) {
      const status = httpStatus(error);
      setFailure(
        status === 401
          ? 'Check your email and password.'
          : status === 409
            ? 'An account already uses this email. Try signing in.'
            : status === 429
              ? 'Too many attempts. Wait a moment and try again.'
              : status === 400
                ? 'Check the information you entered.'
                : 'Couldn’t complete the request. Check your connection and try again.',
      );
    } finally {
      submitting.current = false;
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.fill}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <AppScreen scroll>
        <AppHeader
          title="ChatApp"
          trailing={
            <IconButton
              label="Connection settings"
              icon="Settings2"
              disabled={busy}
              onPress={() => router.push('/settings')}
            />
          }
        />
        <View style={styles.content}>
          <AppText variant="display" accessibilityRole="header">
            {creating ? 'Create an account' : 'Sign in'}
          </AppText>
          {(state.phase === 'expired' || state.phase === 'unauthenticated') &&
            !!state.note && (
              <AppText tone="warning" accessibilityLiveRegion="polite">
                {state.note}
              </AppText>
            )}
          {creating && (
            <TextField
              label="Display name"
              value={displayName}
              onChangeText={setDisplayName}
              editable={!busy}
              autoComplete="name"
              maxLength={60}
              {...issue(!nameCheck.success, 'Enter a display name.')}
            />
          )}
          <TextField
            label="Email"
            value={email}
            onChangeText={setEmail}
            editable={!busy}
            keyboardType="email-address"
            autoComplete="email"
            textContentType="emailAddress"
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={254}
            {...issue(!emailCheck.success, 'Enter a valid email address.')}
          />
          <TextField
            label="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!visible}
            editable={!busy}
            autoComplete={creating ? 'new-password' : 'current-password'}
            maxLength={128}
            {...issue(!passwordCheck.success, 'Use 12–128 characters.')}
          />
          {creating && (
            <TextField
              label="Confirm password"
              value={confirmation}
              onChangeText={setConfirmation}
              secureTextEntry={!visible}
              editable={!busy}
              autoComplete="new-password"
              maxLength={128}
              {...issue(
                password !== confirmation || !confirmation,
                'Enter the same password again.',
              )}
            />
          )}
          <AppButton
            kind="quiet"
            label={visible ? 'Hide password' : 'Show password'}
            disabled={busy}
            onPress={() => setVisible(!visible)}
          />
          {!!failure && (
            <AppText
              accessibilityRole="alert"
              accessibilityLiveRegion="polite"
              tone="error"
            >
              {failure}
            </AppText>
          )}
          <AppButton
            label={creating ? 'Create account' : 'Sign in'}
            loading={busy}
            onPress={submit}
          />
          <AppButton
            kind="quiet"
            label={creating ? 'Return to sign in' : 'Create an account'}
            disabled={busy}
            onPress={() => router.replace(creating ? '/sign-in' : '/register')}
          />
          {__DEV__ && (
            <AppButton
              kind="quiet"
              label="Open design preview"
              disabled={busy}
              onPress={() => router.push('/design-preview')}
            />
          )}
        </View>
      </AppScreen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { padding: space.gutter, gap: space.sm },
});
