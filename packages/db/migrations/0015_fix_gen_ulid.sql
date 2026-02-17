-- Fix gen_ulid() to produce proper 26-character ULIDs
-- Previous version only produced 20 chars (10 timestamp + 10 random)
-- Correct: 10 timestamp chars + 16 random chars = 26 total

CREATE OR REPLACE FUNCTION gen_ulid() RETURNS TEXT AS $$
DECLARE
  unix_ts    BIGINT;
  output     TEXT := '';
  encoding   TEXT := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  rand_bytes BYTEA;
  rand_val   BIGINT;
  i          INT;
BEGIN
  -- Timestamp: 48-bit millisecond epoch → 10 Crockford Base32 chars
  unix_ts := (EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::BIGINT;
  FOR i IN REVERSE 9..0 LOOP
    output := output || substr(encoding, ((unix_ts >> (i * 5)) & 31)::INT + 1, 1);
  END LOOP;

  -- Randomness: 80 bits (10 bytes) → 16 Crockford Base32 chars
  -- Process in two 40-bit (5-byte) halves to stay within BIGINT range
  rand_bytes := gen_random_bytes(10);

  -- First 5 bytes → 8 chars
  rand_val := 0;
  FOR i IN 0..4 LOOP
    rand_val := (rand_val << 8) | get_byte(rand_bytes, i);
  END LOOP;
  FOR i IN REVERSE 7..0 LOOP
    output := output || substr(encoding, ((rand_val >> (i * 5)) & 31)::INT + 1, 1);
  END LOOP;

  -- Last 5 bytes → 8 chars
  rand_val := 0;
  FOR i IN 5..9 LOOP
    rand_val := (rand_val << 8) | get_byte(rand_bytes, i);
  END LOOP;
  FOR i IN REVERSE 7..0 LOOP
    output := output || substr(encoding, ((rand_val >> (i * 5)) & 31)::INT + 1, 1);
  END LOOP;

  RETURN output;
END;
$$ LANGUAGE plpgsql VOLATILE;
