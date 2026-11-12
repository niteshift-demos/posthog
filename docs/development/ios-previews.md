# iOS previews in Niteshift

The `ios` target in `.niteshift/mobile.yaml` builds the existing Expo app at
`products/desktop/apps/mobile`, with bundle ID `com.posthog.code.mobile`.

Niteshift setup installs the mobile app's dependency graph from the nested desktop workspace.
The root JavaScript install does not include that workspace.
The iOS build skips JavaScript install hooks because the workspace also includes Electron's
SQLite rebuild. CocoaPods and Xcode still compile the iOS app's native dependencies.
Build preparation copies the generated app scheme to `PostHogPreview` so Xcode does not
select the CocoaPod's identically named `PostHog` scheme.
The generated iOS project is explicitly synced to the builder and stays out of Git.

Build a fresh simulator development client with:

```sh
ns mobile build ios --cold
```

Open the iOS target in the mobile preview. The preview starts its `metro` and `proxy`
service dependencies and opens the development client against `http://localhost:8081`.
The existing web preview remains the default; Metro starts on demand.

To start Metro from the sandbox shell:

```sh
ns services start metro
curl -f http://localhost:8081/status
```

The expected response is `packager-status:running`.
JavaScript and TypeScript changes reload through Metro. Native dependency or Expo configuration
changes require another `ns mobile build ios`.

The app's Dev region uses the local PostHog server at `http://localhost:8010`.
The native app uses its own sign-in flow; the web preview's cookie does not sign in the iOS app.
No development sign-in link is declared because the app does not provide one.

Merging this target enables repeatable builds and daily iOS builds when Environment caching is enabled.
