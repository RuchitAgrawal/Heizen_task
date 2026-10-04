-- OrderCombination.orderId is denormalised for kitchen queries. Keep it consistent
-- with the owning line even for future imports or maintenance scripts.
CREATE OR REPLACE FUNCTION check_combination_order_matches_line()
RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "OrderLine"
    WHERE id = NEW."lineId" AND "orderId" = NEW."orderId"
  ) THEN
    RAISE EXCEPTION 'OrderCombination orderId must match its OrderLine orderId';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "OrderCombination_order_matches_line"
BEFORE INSERT OR UPDATE OF "lineId", "orderId" ON "OrderCombination"
FOR EACH ROW EXECUTE FUNCTION check_combination_order_matches_line();
