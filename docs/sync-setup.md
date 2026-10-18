# Optional cloud sync setup

Aara works fully on one device with no server — everything is saved on the
device first and syncs in the background whenever a connection is available.
Sync is an optional add-on for owners who want the same mill on a second
phone or a computer, an off-device copy of their data, or shared access for
a partner or munshi.

Everything below takes about 15 minutes and is free on Supabase's free tier.

## 1. Create the project

1. Sign in at https://supabase.com and create a new project.
   **Choose the Mumbai region (ap-south-1)** so Indian mill data stays in
   India — that fits the DPDP Act.
2. In the SQL editor, run the contents of `supabase/schema.sql` once.
   It creates three tables (`mill_members`, `mill_data`, `mill_invites`)
   with row-level security, so each mill's data is walled off and members
   can only ever see their own mill's rows.

## 2. Turn on sign-in codes

- **Email (recommended, zero setup):** Authentication → Providers → Email is
  on by default and sends 6-digit codes. Nothing else to do.
- **Phone/SMS:** Authentication → Providers → Phone needs an SMS provider
  (Twilio or MessageBird). Commercial SMS in India additionally needs **DLT
  registration** of your sender ID and message templates — that takes a few
  days, so start with email and add SMS OTP once DLT is done.

## 3. Connect the app

In Aara: **More → Sync across devices**

1. Paste your project URL (`https://xxxx.supabase.co`) and the
   **anon / publishable key** (Project Settings → API). The anon key is
   safe in the app — row-level security is what protects the data.
   **Never paste the `service_role` key anywhere** — it bypasses RLS and
   can read every mill's data.
2. Enter your email (or phone) → "Save & send code" → type the 6-digit code.

From then on, every save writes to this device *and* the cloud; on sign-in
and reconnect the app merges both directions per item — the newer edit wins.
Open the app on a second device, repeat step 3 with the same email, and the
mill appears there.

## 4. Share the mill with a partner or munshi

The first person to connect a mill is its **owner**. To add someone:

1. Owner: More → Sync across devices → **Invite partner / munshi** → pick
   the role → share the 8-character code (single-use, valid 7 days).
2. On their device: connect sync with *their own* email, then enter the
   code under "Join a shared mill". Their device merges into your mill.

| Role | Can do |
|---|---|
| **Owner** | Everything: invite/remove members, settings, delete, export |
| **Partner** | Everything except member management and deleting the mill |
| **Munshi** | Enter orders, customers, payments, attendance, stock — cannot change settings or delete records |

Mill membership is enforced by row-level security on the server, and the
`mill_data_guard` trigger enforces munshi limits there too — a munshi cannot
change mill settings or people, nor delete records, even with a hand-built
client. The app hides those buttons as well, but the database is the wall.

## What syncs — and what does not

- Orders, people, customers, stock, by-products, auctions, stock moves and
  advances each sync as their own record — two devices editing *different*
  records never overwrite each other. Settings/profile sync under `core_`;
  attendance marks travel per worker per day.
- Deletes propagate via tombstones — removing on one device removes everywhere.
- Backups index and saved backups: synced per key, newest wins.
- Your sign-in session, PIN hashes, the `accounts` list and project config:
  never leave the device. The PIN lock stays per-device.
- Joining a mill wipes the joiner's local mill records first and adopts the
  mill's cloud data — a new member can never overwrite the owner's data.
- The server stamps every write with its own clock, so a phone with a wrong
  clock cannot win conflicts; sessions renew automatically (no re-login
  every hour).

## Honest limits

- Conflicts resolve per record, newest-server-write wins. Two devices editing
  the *same* record while offline → the later sync wins it. Fine for a small
  mill, not a multi-branch system.
- Free-tier Supabase projects pause after about a week without activity —
  fine for building and testing; move to a paid plan before real mills
  depend on it.
- A user can belong to more than one mill but syncs the one they last
  joined. Multi-mill dashboards are out of scope.
