-- Require every new professional account to complete the dedicated onboarding flow.
-- Client registrations remain unaffected.
CREATE OR REPLACE FUNCTION public.require_professional_onboarding_payload()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
BEGIN
  IF NEW.raw_user_meta_data ->> 'role' = 'pro'
     AND NEW.raw_user_meta_data -> 'pro_onboarding' IS NULL THEN
    RAISE EXCEPTION 'Professional registration must be completed through the professional onboarding flow';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS require_professional_onboarding_payload ON auth.users;

CREATE TRIGGER require_professional_onboarding_payload
BEFORE INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.require_professional_onboarding_payload();
