ALTER TABLE "trip_companion_publication" ADD COLUMN "canceledAt" TIMESTAMP(3),
  ADD CONSTRAINT "companion_cancellation_stops_recruitment" CHECK ("canceledAt" IS NULL OR NOT "recruitmentOpen");
CREATE FUNCTION protect_companion_cancellation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."canceledAt" IS NOT NULL AND NEW."canceledAt" IS DISTINCT FROM OLD."canceledAt" THEN
    RAISE EXCEPTION 'Companion cancellation is terminal' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "trip_companion_terminal_cancellation" BEFORE UPDATE ON "trip_companion_publication"
FOR EACH ROW EXECUTE FUNCTION protect_companion_cancellation();
