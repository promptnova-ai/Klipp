# Welcome to your Expo app 👋

This is an [Expo](https://expo.dev) project created with [`create-expo-app`](https://www.npmjs.com/package/create-expo-app).

## Klipp location and booking setup

Apply `supabase/migrations/004_location_services_and_tracking.sql` after the existing migrations before testing the multi-industry catalog, GPS checkout, messaging, or live tracking.

For native maps, set `GOOGLE_MAPS_ANDROID_API_KEY` in the build environment. Set `GOOGLE_MAPS_IOS_API_KEY` only if using Google Maps instead of the default Apple map on iOS. Restrict each key to the app's package/bundle identifier and required Maps SDK. Native permission and background-location changes require a new development or production build; live location is shared only while a booking is `en_route`.

## Admin accounts and professional verification

Apply `supabase/migrations/007_admin_verification_and_settings.sql` after the other migrations. The migration creates a private Storage bucket for identity documents, admin-only database functions, audit records, and editable commission/request-expiry settings. Never make the verification bucket public or put a Supabase service-role key in the app.

Bootstrap the first administrator from the Supabase SQL Editor after that person has registered and confirmed their email. Replace the email below with the account to promote:

```sql
update public.profiles p
set role = 'admin'
from auth.users u
where p.id = u.id
  and lower(u.email) = lower('admin@example.com');
```

Confirm exactly one account was updated, then sign in with that account. The admin panel is shown on the account home screen. Administrators can assign `client`, `pro`, or `admin` to other existing accounts, review professional documents, edit the service catalog and pricing tiers, and change the commission and professional-request expiry applied to new records. The current administrator cannot change their own role from the panel.

Professionals submit a PDF, JPG, or PNG (maximum 10 MB) from **Mi perfil → Verificación de identidad**. Documents stay in private Storage; an administrator opens a short-lived signed link, then approves or rejects the submission with a reason. Approval requires a confirmed email and a submitted document. Do not approve a profile unless its identity has actually been checked.

## Get started

1. Install dependencies

   ```bash
   npm install
   ```

2. Start the app

   ```bash
   npx expo start
   ```

In the output, you'll find options to open the app in a

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

You can start developing by editing the files inside the **src/app** directory. This project uses [file-based routing](https://docs.expo.dev/router/introduction).

## Get a fresh project

When you're ready, run:

```bash
npm run reset-project
```

This command will move the starter code to the **example** directory and create a blank **src/app** directory where you can start developing.

### Other setup steps

- To set up ESLint for linting, run `npx expo lint`, or follow our guide on ["Using ESLint and Prettier"](https://docs.expo.dev/guides/using-eslint/)
- If you'd like to set up unit testing, follow our guide on ["Unit Testing with Jest"](https://docs.expo.dev/develop/unit-testing/)
- Learn more about the TypeScript setup in this template in our guide on ["Using TypeScript"](https://docs.expo.dev/guides/typescript/)

## Learn more

To learn more about developing your project with Expo, look at the following resources:

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/): Follow a step-by-step tutorial where you'll create a project that runs on Android, iOS, and the web.

## Join the community

Join our community of developers creating universal apps.

- [Expo on GitHub](https://github.com/expo/expo): View our open source platform and contribute.
- [Discord community](https://chat.expo.dev): Chat with Expo users and ask questions.
