# Optional cloud sync setup

Aara works fully on one device with no server. Sync is an optional add-on for
owners who want the same mill on a second phone or a computer — or simply an
off-device copy of their data.

Everything below takes about 15 minutes and is free on Supabase's free tier.

## 1. Create the project

1. Sign in at https://supabase.com and create a new project.
2. In the SQL editor, run the contents of `supabase/schema.sql` once.
   It creates one table (`mill_data`) with row-level security, so each
   signed-in user can only ever see their own rows.

## 2. Turn on sign-in codes

- **Email (recommended, zero setup):** Authentication → Providers → Email is
  on by default and sends 6-digit codes. Nothing else to do.
- **Phone/SMS:** Authentication → Providers → Phone needs an SMS provider
  (Twilio or MessageBird) with its credentials pasted in.

## 3. Connect the app

In Aara: **More → Sync across devices**

1. Paste your project URL (`https://xxxx.supabase.co`) and the
   **anon public key** (Project Settings → API). The anon key is safe to
   store in the app — row-level security is what protects the data.
2. Enter your email (or phone) → "Save & send code" → type the 6-digit code.

From then on, every save writes to this device *and* the cloud; on sign-in
and reconnect the app merges both directions per item — newest write wins.
Open the app on a second device, repeat step 3 with the same email, and the
mill appears there.

## What syncs — and what does not

- Mill data, backups index, saved backups: synced per key.
- Your sign-in session and project config: never leave the device.
- The PIN lock stays per-device. Cloud sign-in is by email/SMS code.

## Honest limits

- Last-write-wins per key. Two devices editing the *same* order at the same
  time while offline → the later sync wins that key. Fine for a small mill,
  not a multi-branch system.
- The Supabase anon key is public by design; protection is the RLS policy.
  Do not paste the `service_role` key anywhere in the app.
