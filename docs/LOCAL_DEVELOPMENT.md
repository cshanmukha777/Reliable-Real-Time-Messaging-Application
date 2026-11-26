# Local development

## Prerequisites and installation

Use Node.js 24.22.3 LTS, npm 11.19.1, Docker Engine or Docker Desktop with Compose v2, and Git. Native Android development additionally needs Android Studio, its SDK and an emulator or connected device. Native iOS development needs a compatible Xcode installation on macOS and a simulator or provisioned device. Follow the [Expo native environment guide](https://docs.expo.dev/get-started/set-up-your-environment/) for SDK 58.

```bash
git clone https://github.com/cshanmukha777/Reliable-Real-Time-Messaging-Application.git
cd Reliable-Real-Time-Messaging-Application
# When testing the Stage 4 pull request:
git switch feat/stage-4-authentication
nvm install
nvm use
npm install --global npm@11.19.1
npm ci
cp .env.example .env
printf "\nAUTH_SIGNING_KEY=%s\n" "$(openssl rand -hex 32)" >> .env
cp apps/mobile/.env.example apps/mobile/.env.local
npm run prisma:generate
```

Start MongoDB and apply the probe index as described in [Database setup](DATABASE_SETUP.md). Then start the API.

```bash
npm run dev:api
curl -fsS http://127.0.0.1:3000/v1/health
curl -fsS http://127.0.0.1:3000/v1/health/live
curl -fsS http://127.0.0.1:3000/v1/health/ready
```

`dev:api` builds TypeScript and starts Node using the root `.env`. Rerun it after changing TypeScript source.

## Mobile development

Set `EXPO_PUBLIC_API_BASE_URL` in `apps/mobile/.env.local` to the address reachable from the device. For the local HTTP examples set `EXPO_PUBLIC_ALLOW_LOCAL_HTTP=true` before generating the native development build.

| Environment                                | Example                                                          | API binding                  |
| ------------------------------------------ | ---------------------------------------------------------------- | ---------------------------- |
| iOS simulator on the API Mac               | `http://127.0.0.1:3000`                                          | `127.0.0.1`                  |
| Android Studio emulator on the API host    | `http://10.0.2.2:3000`                                           | `127.0.0.1`                  |
| Physical Android or iPhone on the same LAN | `http://192.168.1.10:3000` (replace with your host’s private IP) | `0.0.0.0`                    |
| Hosted backend                             | `https://api.example.com` (replace with your DNS name)           | Set by hosting configuration |

For a physical device, allow port 3000 through the host firewall on the trusted LAN. An Expo Metro tunnel does not forward the NestJS backend. A phone’s `localhost` is the phone. iOS may prompt for Local Network permission. Use a native development build for SDK 58 and confirm its cleartext settings were generated with the chosen environment. Rebuild native projects after changing native transport flags.

```bash
npm run build:contracts
cd apps/mobile
npx --no-install expo run:android
# On macOS with Xcode:
npx --no-install expo run:ios
# For a previously installed development build:
npx --no-install expo start --dev-client
```

In Settings, test an alternate reachable origin and confirm the **Active server** changes only after **Save tested server**. Change the appearance and run **SQLite check**. Record the probe ID. Force-close and reopen, including Android stop/relaunch or iOS app switcher termination. Reopen Settings and confirm the same origin, appearance, and probe ID. Test an invalid URL and a failed connection, then confirm **Reset to default** restores the configured origin. Record device/OS and commit with the result.

## Quality commands

```bash
npm run lint
npm run format:check
npm run typecheck
npm test
npm run test:api
npm run build:api
npm run doctor -w @chatapp/mobile
CI=1 npm run dependencies:check -w @chatapp/mobile
npm run router:check -w @chatapp/mobile
EXPO_PUBLIC_API_BASE_URL=https://api.example.com npm run export:android -w @chatapp/mobile
EXPO_PUBLIC_API_BASE_URL=https://api.example.com npm run export:ios -w @chatapp/mobile
npm run check:security
```

Run the [replica-set integration suite](DATABASE_SETUP.md#isolated-integration-tests) with the test database URL. Both exports are JS/Hermes bundles. Installing and booting requires a native build.
