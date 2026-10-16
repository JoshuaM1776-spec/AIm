// Aim Plus server settings (see docs/SETUP.md). With both values empty, Aim is Aim Free only:
// no account, no network, and no Plus section in Settings.
// The anon key is public by design. It only names the project, and the database's row-level
// security decides what each signed-in user may read. Never put a service-role or Claude key here.
self.AIM_PLUS = {
  supabaseUrl: "https://qelnwpekknnhejuwocmh.supabase.co",
  supabaseAnonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFlbG53cGVra25uaGVqdXdvY21oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIxODcxNDgsImV4cCI6MjEwNzc2MzE0OH0.NQPLTrIPTFy9FaZpdI9-JypyglVP14IHf4MdOlWSboc"
};
