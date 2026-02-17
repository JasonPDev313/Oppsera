CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION gen_ulid() RETURNS TEXT AS $$
DECLARE
  timestamp  BIGINT;
  output     TEXT;
  unix_ts    BIGINT;
  encoding   TEXT := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  rand_bytes BYTEA;
  i          INT;
BEGIN
  unix_ts := (EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::BIGINT;
  output := '';
  FOR i IN REVERSE 9..0 LOOP
    output := output || substr(encoding, ((unix_ts >> (i * 5)) & 31)::INT + 1, 1);
  END LOOP;
  rand_bytes := gen_random_bytes(10);
  FOR i IN 0..9 LOOP
    output := output || substr(encoding, (get_byte(rand_bytes, i) & 31) + 1, 1);
  END LOOP;
  RETURN output;
END;
$$ LANGUAGE plpgsql VOLATILE;
