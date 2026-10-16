// Aim Plus server settings. Empty until the Supabase project exists (see supabase/README.md);
// while they're empty, Aim is Aim Free only: no account, no network, and no Plus section in Settings.
// The anon key is public by design. It only names the project, and the database's row-level
// security decides what each signed-in user may read. Never put a service-role or Claude key here.
self.AIM_PLUS = {
  supabaseUrl: "",      // e.g. "https://abcdefghijklmnop.supabase.co"
  supabaseAnonKey: ""
};
