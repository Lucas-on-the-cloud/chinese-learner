-- Drop the on_auth_user_created trigger that was throwing "Database error
-- saving new user" during Google OAuth signup. Profile sync is now handled
-- client-side by AuthService._syncProfile(), called on every page load after
-- a real (non-anonymous) login.
--
-- Why this trigger failed despite a valid INSERT signature: the function had
-- no `SET search_path` and ran under SECURITY DEFINER, so when it tried to
-- INSERT INTO public.profiles under RLS it could either fail to resolve the
-- table or be blocked by a policy that didn't account for the function's
-- effective role. Rather than patching the trigger, we let the client do it
-- under the user's own auth.uid() — RLS policies below ensure that works.

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();

-- profiles RLS: each user reads / inserts / updates their own row.
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles select own" ON public.profiles;
CREATE POLICY "profiles select own" ON public.profiles
  FOR SELECT TO authenticated
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "profiles insert own" ON public.profiles;
CREATE POLICY "profiles insert own" ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "profiles update own" ON public.profiles;
CREATE POLICY "profiles update own" ON public.profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);
