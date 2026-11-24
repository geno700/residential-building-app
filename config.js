// App settings. Leave the two Supabase values empty to run in demo mode
// (sample data, saved only in this browser). See README.md for setup.
export const config = {
  supabaseUrl: 'https://gzvknfvqyqfynainxgur.supabase.co',
  // Publishable (anon) key: safe to be public. Never put a secret or service_role key here.
  supabaseAnonKey: 'sb_publishable_M7QzNvmL2Tto6-QnkTr0rQ_-Y0ueJok',
  // Public address of the app, e.g. 'https://your-name.github.io/residential-building-app/'.
  // Used for the link residents open. Leave empty to use the address the app is opened from.
  appUrl: 'https://algebratronics.com/residential-building-app/',
  appName: 'Residential Building App',
  // Country calling code added to local phone numbers for WhatsApp links (20 = Egypt).
  countryCode: '20',
};
