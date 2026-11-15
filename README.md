# Residential Building App

A free, open-source web app for the person who manages a residential building's money, and for the residents who pay into it.
Arabic and English. Anyone can register their own building; each building's data is separate.

- Plain HTML and JavaScript. No build step and nothing to install.
- Hosted free on GitHub Pages. Data and logins live in Supabase (free tier).
- Until Supabase is connected the app runs in **demo mode**: a sample 22-apartment building, saved only in your browser.

## What it does

**The manager** (one email login per building):

- Creates the building: number of floors, apartments per floor and the monthly fee. The apartments are created automatically, each with its own password.
- Sets a different monthly fee per apartment (for example 120, 100 or 50). The fee is charged automatically at the start of each month.
- Records fee payments. An apartment that pays more than it owes shows as paid in advance.
- Records building expenses (elevator, cleaning, repairs, electricity) and other income.
- Records a water, gas or other bill paid **from the manager's own pocket** for an apartment. It is added to what that apartment owes the manager and does not touch the building fund.
- Sets each apartment's balance to the real figure at any time (**Apartments > Edit all** does it for every apartment in one table).
- Adds one-time extra fees, for one apartment or all of them, for example for an upgrade project.
- Keeps a maintenance list.
- Is the only one who can set, read or replace apartment passwords.
- Sends a resident their balance and sign-in details by WhatsApp, from the apartment's page.
- Saves a building report or an apartment's statement as a PDF.
- Backs up and restores the building: a copy is saved automatically once a day, and **Settings > Backup and restore** downloads a backup file or goes back to an earlier copy.
- Names apartments by floor (`F1-R` and `F1-L` for two per floor, `F1-1`, `F1-2`, `F1-3` for more) or by plain numbers, and can switch between the two later in Settings.
- Can add other managers by email. The person who created the building is its owner; only the owner adds or removes managers and deletes the building.

**Each apartment** (building code + apartment number + password):

- Sees what it owes or has paid in advance, with a full statement.
- Does **not** see the building fund, the building's expenses or other apartments' balances.

## Try it on this PC

Double-clicking `index.html` will not work (browsers block it). Start a small local server instead:

```bash
python -m http.server 5183
```

Then open http://localhost:5183. In demo mode, sign in as manager with any email and password,
or as a resident with building `DEMO01`, any apartment from `F1-R` to `F11-L`, and password `1234`.

## Go live

### 1. Create the database (Supabase)

1. Create a free account and a new project at https://supabase.com
2. Open **SQL Editor > New query**, paste the whole of `supabase/schema.sql`, and press **Run**.
3. Open **Project Settings > API** and copy the **Project URL** and the **anon / publishable** key.
4. Paste both into `config.js`:

   ```js
   supabaseUrl: 'https://xxxxxxxx.supabase.co',
   supabaseAnonKey: 'eyJ...',
   ```

   The anon key is designed to be public. The access rules in `schema.sql` are what protect the data.
   Never put the **service_role** key in this project.

### 2. Publish the app (GitHub Pages)

1. Create a free account at https://github.com and a new **public** repository.
2. Upload everything in this folder (`index.html`, `config.js`, `.nojekyll`, `LICENSE`, `README.md`, and the `css`, `js` and `supabase` folders).
3. Open **Settings > Pages**, set **Source** to "Deploy from a branch", choose branch `main` and folder `/ (root)`, and save.
4. After a minute the app is live at `https://YOUR-USERNAME.github.io/YOUR-REPO/`. Put that address in `appUrl` in `config.js`.

### 3. Connect the two

In Supabase open **Authentication > URL Configuration** and set **Site URL** to your GitHub Pages address,
so that email confirmation and password-reset links bring managers back to the app.

Manager accounts are confirmed by email. Supabase's built-in email sender only delivers to the project's own team,
so either set up your own sender (**Authentication > Emails > SMTP settings**) or turn off
**Authentication > Sign In / Providers > Email > Confirm email**.

### 4. Set up your building

1. Open the app, choose **Manager**, create an account and sign in.
2. Fill in the building form. The next page lists every apartment's password. Each password is also shown on its apartment's page.
3. In **Settings**, copy the resident link and send it to the residents with their passwords.
4. In **Apartments**, set each apartment's fee, resident name and opening balance.
5. In **Settings**, enter the money that is already in the building fund.

## How the money is counted

| Entry | Effect |
|---|---|
| Monthly fee | Apartment owes the building more |
| Fee payment | Apartment owes less; building fund goes up |
| Expense | Building fund goes down |
| Other income | Building fund goes up |
| Bill paid by manager | Apartment owes the manager more; building fund unchanged |
| Bill repaid | Apartment owes the manager less; building fund unchanged |

A new fee applies from the next month; months already charged keep their amount.

## Security notes

- Apartment passwords are checked against a hash, and are also kept readable for the building's managers so they can send them to residents. Residents cannot read or change them. Backup files contain these passwords, so keep the files private.
- Backups are stored in the same database. Download a backup file now and then to have a copy outside it.
- Five wrong passwords lock an apartment's sign-in for 15 minutes.
- Residents have no direct access to the database tables. Everything they see comes from one function that returns only their own apartment.
- Whoever runs the Supabase project can read every building's data in it. If that matters to you, run your own copy.

## Notes

- Supabase's free tier pauses a project after about a week with no activity. Resume it from the Supabase dashboard.
- Add `?demo` to the app's address to try it with sample data without touching real data.
- The month changes on Cairo time by default (`timezone` column of the `buildings` table).

## Licence

MIT. See `LICENSE`.
