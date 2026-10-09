
CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('cutting_supervisor','cutting_verifier','sewing_supervisor')),
  full_name     TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS recipes (
  id               SERIAL PRIMARY KEY,
  recipe_code      TEXT NOT NULL UNIQUE,
  name             TEXT NOT NULL,
  category         TEXT NOT NULL,
  std_fabric_yards NUMERIC(6,2) NOT NULL CHECK (std_fabric_yards > 0),
  wastage_cap      NUMERIC(5,2) NOT NULL CHECK (wastage_cap >= 0),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS recipe_components (
  id                 SERIAL PRIMARY KEY,
  recipe_id          INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  component_name     TEXT NOT NULL,
  pieces_per_garment INTEGER NOT NULL CHECK (pieces_per_garment > 0),
  image_url          TEXT,
  UNIQUE (recipe_id, component_name)
);

CREATE SEQUENCE IF NOT EXISTS cutting_order_no_seq;

CREATE TABLE IF NOT EXISTS cutting_orders (
  id                SERIAL PRIMARY KEY,
  order_no          TEXT NOT NULL UNIQUE
                    DEFAULT ('CUT-' || lpad(nextval('cutting_order_no_seq')::text, 5, '0')),
  recipe_id         INTEGER NOT NULL REFERENCES recipes(id),
  target_qty        INTEGER NOT NULL CHECK (target_qty > 0 AND target_qty <= 100000),
  fabric_roll_id    TEXT NOT NULL,
  actual_fabric_yds NUMERIC(10,2) NOT NULL CHECK (actual_fabric_yds > 0),
  status            TEXT NOT NULL DEFAULT 'IN_PROGRESS'
                    CHECK (status IN ('IN_PROGRESS','PENDING_VERIFICATION','REJECTED','VERIFIED')),
  created_by        INTEGER NOT NULL REFERENCES users(id),
  sewing_started_at TIMESTAMPTZ,
  sewing_started_by INTEGER REFERENCES users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cutting_orders_status ON cutting_orders(status);

CREATE TABLE IF NOT EXISTS verification_items (
  id           SERIAL PRIMARY KEY,
  order_id     INTEGER NOT NULL REFERENCES cutting_orders(id) ON DELETE CASCADE,
  component_id INTEGER NOT NULL REFERENCES recipe_components(id),
  expected_qty INTEGER NOT NULL CHECK (expected_qty > 0),
  actual_qty   INTEGER CHECK (actual_qty >= 0),          -- NULL = not counted yet
  status       TEXT CHECK (status IN ('GREEN','YELLOW','RED')),
  counted_by   INTEGER REFERENCES users(id),
  counted_at   TIMESTAMPTZ,
  UNIQUE (order_id, component_id),
  CHECK ((actual_qty IS NULL) = (status IS NULL))
);

CREATE TABLE IF NOT EXISTS verification_logs (
  id                  SERIAL PRIMARY KEY,
  order_id            INTEGER NOT NULL REFERENCES cutting_orders(id),
  verifier_id         INTEGER NOT NULL REFERENCES users(id),
  decision            TEXT NOT NULL CHECK (decision IN ('APPROVED','REJECTED')),
  rejection_note      TEXT,
  approval_note       TEXT,
  wastage_pct         NUMERIC(8,2) NOT NULL,
  component_variances JSONB NOT NULL,
  "timestamp"         TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (decision <> 'REJECTED' OR length(trim(coalesce(rejection_note, ''))) >= 5)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_one_approval_per_order
  ON verification_logs(order_id) WHERE decision = 'APPROVED';


-- 1. Audit log is append-only (immutable).
CREATE OR REPLACE FUNCTION forbid_log_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'verification_logs is append-only (immutable audit trail)';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_logs_immutable ON verification_logs;
CREATE TRIGGER trg_logs_immutable
  BEFORE UPDATE OR DELETE ON verification_logs
  FOR EACH ROW EXECUTE FUNCTION forbid_log_mutation();

-- 2. Legal state transitions only + hard stop for VERIFIED.
CREATE OR REPLACE FUNCTION enforce_order_transition() RETURNS trigger AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT (
         (OLD.status = 'IN_PROGRESS'          AND NEW.status = 'PENDING_VERIFICATION')
      OR (OLD.status = 'PENDING_VERIFICATION' AND NEW.status IN ('VERIFIED', 'REJECTED'))
      OR (OLD.status = 'REJECTED'             AND NEW.status = 'PENDING_VERIFICATION')
    ) THEN
      RAISE EXCEPTION 'Illegal status transition % -> %', OLD.status, NEW.status;
    END IF;

    IF NEW.status = 'VERIFIED' THEN
      IF NOT EXISTS (SELECT 1 FROM verification_items WHERE order_id = NEW.id)
         OR EXISTS (SELECT 1 FROM verification_items
                    WHERE order_id = NEW.id AND (status IS NULL OR status = 'RED'))
         OR NOT EXISTS (SELECT 1 FROM verification_logs
                        WHERE order_id = NEW.id AND decision = 'APPROVED')
      THEN
        RAISE EXCEPTION 'HARD STOP: order % has RED/uncounted components or no approval record', NEW.id;
      END IF;
    END IF;
  END IF;

  -- a VERIFIED order is frozen (only the sewing_* columns may change)
  IF OLD.status = 'VERIFIED' AND (
       NEW.recipe_id <> OLD.recipe_id OR NEW.target_qty <> OLD.target_qty
    OR NEW.fabric_roll_id <> OLD.fabric_roll_id
    OR NEW.actual_fabric_yds <> OLD.actual_fabric_yds
    OR NEW.status <> OLD.status
  ) THEN
    RAISE EXCEPTION 'A VERIFIED order is immutable';
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_order_transition ON cutting_orders;
CREATE TRIGGER trg_order_transition
  BEFORE UPDATE ON cutting_orders
  FOR EACH ROW EXECUTE FUNCTION enforce_order_transition();

-- 3. Piece counts of a VERIFIED order can never change.
CREATE OR REPLACE FUNCTION freeze_verified_items() RETURNS trigger AS $$
DECLARE s TEXT;
BEGIN
  SELECT status INTO s FROM cutting_orders WHERE id = OLD.order_id;
  IF s = 'VERIFIED' THEN
    RAISE EXCEPTION 'Component counts of a VERIFIED order are immutable';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_items_frozen ON verification_items;
CREATE TRIGGER trg_items_frozen
  BEFORE UPDATE OR DELETE ON verification_items
  FOR EACH ROW EXECUTE FUNCTION freeze_verified_items();
